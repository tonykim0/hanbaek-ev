import { bboxOf, distanceBetween, expandBbox, type PolygonCoords } from './geo';
import { dongRiOf, jibunOf, parsePnu, type PnuParts } from './pnu';
import { str } from './props';
import { sleep } from './sources/http';
import { gridRowsIn, kepcoCodes, type Codes } from './sources/kepco';
import { parcelsIn } from './sources/vworld';
import type { GridRow } from './types';

/**
 * 한전 여유용량 — 그 번지 → 없으면 가장 가까운 기록 필지 → 그래도 없으면 같은 읍면동 전체.
 * 한전 자료는 번지 단위라 빈 번지가 흔하다(풍세로 706 = 구룡동 564-27 은 404). SolarCheck 도 같은 자리에서
 * 「이 지번의 한전 기록이 없어 가장 가까운 기록 필지(약 115m)의 배전선로 기준」으로 보인다.
 */
export type GridResult = {
  rows: GridRow[];
  /**
   * 그 번지 기록이 아닐 때 무엇으로 대신 봤나 — 둘레 필지(번지와 거리) 또는 같은 읍면동 전체.
   * 읍면동은 그 번지가 어느 선로에 붙는지 모른다(도심은 둘레 150m 에도 기록이 없는 일이 흔하다 — 강남 역삼동 737).
   */
  via:
    | { kind: 'neighbor'; address: string; distanceM: number; polygons: PolygonCoords[] }
    | { kind: 'dong'; dong: string }
    | null;
};

/** 둘레를 이만큼까지 본다 — 넓히면 VWorld 상자 한도(2km²·1000필지)에 걸린다 */
export const NEIGHBOR_RADIUS_M = 150;
/** 한전에 물어볼 둘레 필지 수 — 가까운 것부터 하나씩 */
export const NEIGHBOR_TRIES = 8;

/**
 * 차례: ① 이 읍면동(리) 전체 ② 그 번지 ③ 둘레 필지 ④ ①의 동 전체.
 * 동 전체를 먼저 묻는 이유 둘 — 자료가 새·옛 코드 중 어디에 있는지 한 번에 정하고(화성 새 구는 옛 41590 에만 있다),
 * 동 전체가 번지 기록을 다 품으므로 동에 기록이 없으면 그 동의 번지는 묻지 않는다.
 * 한전은 한꺼번에 넷을 받으면 일부를 빈 응답으로 돌려줘서(실측 2026-11-03, 나주 송월동) 하나씩 차례로 묻는다.
 */
export async function gridNear(
  pnu: string,
  jibunAddress: string | null,
  polys: PolygonCoords[],
  /** ②까지만 — 한 부지로 묶은 필지 중 대표가 아닌 것은 제 번지 기록만 본다(둘레 · 동은 대표의 것으로 — lib/solar/run) */
  ownOnly = false,
): Promise<GridResult> {
  const parts = parsePnu(pnu);
  const { dong, ri } = dongRiOf(jibunAddress);
  if (!parts || !dong) return { rows: [], via: null };
  const sameSgg = (p: PnuParts) => p.sido === parts.sido && p.sigungu === parts.sigungu;

  const chain = kepcoCodes(parts.sido, parts.sigungu);
  let area = await gridRowsIn(chain, { dong, ri, jibun: null });
  if (!area.code) {
    // 동 전체가 비면 그 동의 번지를 다 건너뛰므로, 한전이 가끔 주는 헛 404 한 번에 결과가 통째로 「기록 없음」이 된다
    // (폭스존 광주점이 다섯 번 중 한 번 그랬다, 2026-11-03) — 잠깐 쉬고 첫 코드로 한 번 더 묻는다
    await sleep(500);
    area = await gridRowsIn(chain.slice(0, 1), { dong, ri, jibun: null });
  }
  const found: Codes[] = area.code ? [area.code] : [];

  if (area.code) {
    const own = await gridRowsIn(found, { dong, ri, jibun: jibunOf(parts) });
    if (own.rows.length) return { rows: own.rows, via: null };
  }
  if (ownOnly) return { rows: [], via: null };

  const bbox = bboxOf(polys);
  if (bbox) {
    // 둘레 필지를 못 받아도(큰 필지는 상자 한도를 넘는다) 읍면동 단계로 넘어간다
    const neighbors = await parcelsIn(expandBbox(bbox, NEIGHBOR_RADIUS_M)).catch((err) => {
      console.error('[source] 둘레 필지', err instanceof Error ? err.message : err);
      return [];
    });
    const ranked = neighbors
      .map((f) => ({
        pnu: str(f.properties.pnu),
        address: str(f.properties.addr),
        d: distanceBetween(polys, f.polygons),
        polygons: f.polygons,
      }))
      .filter((n): n is { pnu: string; address: string; d: number; polygons: PolygonCoords[] } => !!n.pnu && !!n.address && n.pnu !== pnu)
      .filter((n) => n.d <= NEIGHBOR_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOR_TRIES);

    for (const n of ranked) {
      const np = parsePnu(n.pnu);
      const nd = dongRiOf(n.address);
      if (!np || !nd.dong) continue;
      const sameArea = sameSgg(np) && nd.dong === dong && nd.ri === ri;
      if (sameArea && !area.code) continue; // 동 전체에 기록이 없으면 그 안의 번지에도 없다
      try {
        const codes = sameSgg(np) && area.code ? found : kepcoCodes(np.sido, np.sigungu);
        const r = await gridRowsIn(codes, { dong: nd.dong, ri: nd.ri, jibun: jibunOf(np) });
        if (r.rows.length)
          return { rows: r.rows, via: { kind: 'neighbor', address: n.address, distanceM: Math.round(n.d), polygons: n.polygons } };
      } catch (err) {
        // 둘레 한 곳의 고장은 건너뛴다 — 다음으로 가까운 필지가 있다
        console.error('[source] 둘레 한전', n.address, err instanceof Error ? err.message : err);
      }
    }
  }

  if (area.rows.length) return { rows: area.rows, via: { kind: 'dong', dong: ri ? `${dong} ${ri}` : dong } };
  return { rows: [], via: null };
}

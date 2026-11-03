import { areaOf, centroidOf, containsPoint, type PolygonCoords } from './geo';

/**
 * VWorld 건축물정보는 같은 건물을 「대장 없는 도형」과 「대장 붙은 도형」으로 두 번 주기도 한다 —
 * 이랜드리테일 천안물류센터는 42,454㎡ 도형 + 42,406.07㎡ 대장이 한 건물이라, 둘을 더한 84,869㎡ 가
 * 필지(53,038㎡)보다 컸다(2026-11-03 실측).
 * 대장 붙은 건물과 겹치고(한쪽 중심이 다른 쪽 안) 크기가 비슷한(½~2배) 무대장 도형은 그 건물의 그림자로 보고 뺀다.
 * 대장과 안 엮인 진짜 건물(풍세로 706 둘레 46동 중 27동)은 겹치는 대장 건물이 없어 남는다.
 */
export function dropShadowCopies<T extends { polygons: PolygonCoords[]; registered: boolean }>(items: T[]): T[] {
  const registered = items.filter((b) => b.registered);
  return items.filter((b) => {
    if (b.registered) return true;
    const c = centroidOf(b.polygons);
    const area = areaOf(b.polygons);
    return !registered.some((r) => {
      const rc = centroidOf(r.polygons);
      const overlaps = (c !== null && containsPoint(r.polygons, c)) || (rc !== null && containsPoint(b.polygons, rc));
      const ratio = area / Math.max(areaOf(r.polygons), 1);
      return overlaps && ratio > 0.5 && ratio < 2;
    });
  });
}

/**
 * 도로명주소 건물 관리번호(25자리 = 법정동 10 · 산 1 · 본번 4 · 부번 4 · 일련 6)의 본번이 0000 — 지번과 안 엮였다.
 * 산업단지 블록처럼 지번이 없는 실제 건물도 이렇다(광주 첨단과기로208번길 43: 꼭짓점 15개짜리 실제 모양).
 */
export const unlotted = (bdMgtSn: unknown) => /^\d{11}0000/.test(String(bdMgtSn ?? ''));

/** 꼭짓점 넷짜리 네모(닫힌 고리 5점) */
const isBox = (polys: PolygonCoords[]) => polys.length === 1 && polys[0].length === 1 && polys[0][0].length === 5;

/**
 * 임시 모양 — 도로명주소를 붙일 때 그린 네모가 그대로 남은 것. 세 가지가 다 맞을 때만 그렇게 본다:
 * 대장과 안 엮였고(건축면적 칸이 비었다) · 그 자리의 도로명주소 건물 관리번호 본번이 0000 이고 · 꼭짓점 넷짜리 네모다.
 * 충주 동충주산단4길 17: 2024-11 준공 4동 자리에 1,369㎡ 네모 하나(관리번호 …1 0000 0000 000008)뿐이었다.
 * 둘레 987동 중 본번 0000 은 20동 — 그중 네모가 아닌 것(실제 블록 건물)은 거른다.
 */
export function markProvisional(
  buildings: { polygons: PolygonCoords[]; registered: boolean }[],
  addressBuildings: { polygons: PolygonCoords[]; properties: Record<string, unknown> }[],
): boolean[] {
  const suspects = addressBuildings.filter((a) => unlotted(a.properties.bd_mgt_sn) && isBox(a.polygons));
  return buildings.map((b) => {
    if (b.registered || !isBox(b.polygons)) return false;
    const c = centroidOf(b.polygons);
    const area = areaOf(b.polygons);
    return suspects.some((a) => {
      const ratio = area / Math.max(areaOf(a.polygons), 1);
      return c !== null && containsPoint(a.polygons, c) && ratio > 0.8 && ratio < 1.25;
    });
  });
}

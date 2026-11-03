/**
 * 건축물대장 표제부 — 지붕 검토에 쓰는 칸만. VWorld 건물 도형은 새 건물이 늦게 들어오고(충주 동충주산단4길 17:
 * 2024년 준공 4동 3,521.72㎡ 가 도형으로는 1동 1,369㎡) 대장 연결이 절반쯤 비어 있어(풍세로 706 둘레 46동 중 27동)
 * 면적·구조·지붕재는 대장을 정본으로 본다. 햇빛길도 같은 칸(지붕재 「기타지붕(판넬)」 등)을 보인다.
 */
export type RegisterBuilding = {
  dong: string | null;
  /** 주건축물(true) · 부속건축물(false) */
  main: boolean;
  /** 건축면적 ㎡ — 지붕 면적으로 쓴다 */
  archArea: number | null;
  structure: string | null;
  roof: string | null;
  height: number | null;
  use: string | null;
  /** 사용승인일 yyyymmdd */
  useApr: string | null;
};

/**
 * 지붕 이름 — 대장의 지붕코드 이름과 기타 칸을 한 줄로. 실응답(충주 영덕리 2074)은 기타 칸에 코드 이름이 이미 들어
 * 있기도 하고(「기타지붕」 + 「기타지붕(판넬)」) 모양을 덧붙이기도 한다(「(철근)콘크리트」 + 「평지붕」).
 */
export function roofLabel(code: string | null | undefined, etc: string | null | undefined): string | null {
  const c = code?.trim() || null;
  const e = etc?.trim() || null;
  if (!c || !e || c === e) return c ?? e;
  if (e.includes(c)) return e;
  return /기타/.test(c) ? `${c}(${e})` : `${c} ${e}`;
}

/** 석면 슬레이트 지붕 — 그 위에 올리지 않고 철거·교체가 먼저다 */
export const isSlate = (roof: string | null) => /슬레이트|석면/.test(roof ?? '');

/**
 * 지붕을 설치 방식이 갈리는 갈래로 — 대장의 지붕 이름은 제각각이다(동성제약 14동: 「기타지붕(샌드위치판넬)」
 * 「기타지붕(칼라쉬트)」 「(철근)콘크리트 슬라브」 …). 판넬·금속은 붙여 깔고, 콘크리트 평지붕은 기울여 세운다.
 * 섞인 이름은 설치가 까다로운 쪽으로 본다(「슬래브,기와」 → 기와).
 */
export type RoofKind = '판넬·금속' | '콘크리트' | '기와' | '슬레이트' | '기타';
export function roofKind(roof: string | null): RoofKind {
  const t = roof ?? '';
  if (isSlate(t)) return '슬레이트';
  if (/판넬|패널|샌드위치|쉬트|시트|강판|징크|금속|철판|LTS|경량철골|칼라/.test(t)) return '판넬·금속';
  if (/기와/.test(t)) return '기와';
  if (/콘크리트|슬라브|슬래브|평지붕/.test(t)) return '콘크리트';
  return '기타';
}

export type RegisterSummary = {
  /** 면적에 센 동 — 주건축물(햇빛길과 같다: 풍세로 706 은 주건축물 7동 3,496.52㎡ · 부속 4동 231㎡ 는 뺀다) */
  count: number;
  /** 건축면적 합 ㎡ */
  area: number;
  attached: { count: number; area: number };
  /** 건축면적이 가장 큰 동 — 용도·구조·사용승인을 여기서 읽는다 */
  biggest: RegisterBuilding | null;
  /** 지붕 갈래별 면적(넓은 순) */
  kinds: { kind: RoofKind; area: number; count: number }[];
  slate: boolean;
};

export function summarizeRegister(rows: RegisterBuilding[]): RegisterSummary {
  const main = rows.filter((r) => r.main);
  const counted = main.length ? main : rows;
  const attached = main.length ? rows.filter((r) => !r.main) : [];
  const sum = (list: RegisterBuilding[]) => list.reduce((s, r) => s + (r.archArea ?? 0), 0);
  const biggest = counted.reduce<RegisterBuilding | null>((a, b) => ((b.archArea ?? 0) > (a?.archArea ?? -1) ? b : a), null);
  const byKind = new Map<RoofKind, { area: number; count: number }>();
  for (const r of counted) {
    const k = roofKind(r.roof);
    const v = byKind.get(k) ?? { area: 0, count: 0 };
    byKind.set(k, { area: v.area + (r.archArea ?? 0), count: v.count + 1 });
  }
  return {
    count: counted.length,
    area: sum(counted),
    attached: { count: attached.length, area: sum(attached) },
    biggest,
    kinds: [...byKind.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.area - a.area),
    slate: counted.some((r) => isSlate(r.roof)),
  };
}

import { GRID_REGION, OLD_BUILDING_YEARS, SETBACK } from './assumptions';
import { GRID_LAYERS, type GridLayerKey, type GridRow, type Level, type Mode } from './types';

/**
 * 판정 규칙 — 자료가 말하는 사실을 「적합 ~ 설치 불가」로 옮기는 자리.
 * ★법 해석이 들어가는 곳이라 운영 전에 사람이 확인해야 한다★ (표는 화면의 사유로 그대로 나간다).
 */

/* ---------------------------------------------------------- 용도지역·지구 */

/** law — 근거 법령 한 줄(걸렸을 때만 화면에 보인다). 확인한 것만 적는다 */
type ZoneRule = { match: RegExp; ground: Level | null; roof: Level | null; why: string; law?: string };

/** 위에서부터 본다. 한 지역이 여러 규칙에 걸리면 가장 나쁜 것이 그 지역의 판정이다. */
export const ZONE_RULES: ZoneRule[] = [
  { match: /개발제한구역/, ground: 'banned', roof: null, why: '개발제한구역 — 지상 태양광은 원칙적으로 허가 대상이 아님 (기존 건축물 지붕은 가능)' },
  { match: /상수원보호구역/, ground: 'banned', roof: null, why: '상수원보호구역 — 발전시설 설치 금지' },
  { match: /습지보호지역/, ground: 'banned', roof: null, why: '습지보호지역 — 개발행위 금지' },
  { match: /농업진흥구역/, ground: 'banned', roof: null, why: '농업진흥구역 — 지상 태양광 불가 (염해농지 등 예외)' },
  { match: /보전녹지지역/, ground: 'hard', roof: null, why: '보전녹지지역 — 개발행위허가가 매우 제한됨' },
  { match: /자연환경보전지역/, ground: 'hard', roof: null, why: '자연환경보전지역 — 개발행위허가가 매우 제한됨' },
  { match: /공익용산지/, ground: 'hard', roof: null, why: '공익용산지 — 산지전용이 매우 제한됨' },
  { match: /생태.?경관보전지역/, ground: 'hard', roof: null, why: '생태·경관보전지역 — 행위 제한 · 조례 이격 예외 지역' },
  { match: /자연공원|도시자연공원구역/, ground: 'hard', roof: null, why: '공원 구역 — 공원 시설 외 설치 제한' },
  { match: /개발행위허가제한지역/, ground: 'hard', roof: null, why: '개발행위허가제한지역 — 제한 기간 동안 허가 불가' },
  { match: /^하천구역|소하천구역/, ground: 'hard', roof: null, why: '하천구역 — 점용허가 없이는 설치 불가' },
  {
    match: /역사문화환경|국가유산|문화재/,
    ground: 'conditional',
    roof: 'conditional',
    why: '국가유산 주변 — 인허가 전 약식영향진단, 영향이 있으면 현상변경 허가',
    law: '문화유산법 제13조·제35조 · 국가유산영향진단법 제17조',
  },
  { match: /농업보호구역/, ground: 'conditional', roof: null, why: '농업보호구역 — 농지전용 허가 필요' },
  { match: /임업용산지|준보전산지/, ground: 'conditional', roof: null, why: '산지 — 산지일시사용허가 필요 · 평균경사도 15° 이하' },
  {
    match: /군사|비행안전|대공방어/,
    ground: 'conditional',
    roof: 'conditional',
    why: '군사시설 관련 구역 — 관할 부대 협의 필요',
    law: '군사기지 및 군사시설 보호법 제13조',
  },
  { match: /경관지구/, ground: 'conditional', roof: 'conditional', why: '경관지구 — 경관 심의 대상일 수 있음' },
  { match: /자연취락지구|관광지|관광단지/, ground: 'conditional', roof: null, why: '조례 이격 예외 지역 — 지자체가 이격거리를 둘 수 있음' },
  { match: /수변구역/, ground: 'conditional', roof: null, why: '수변구역 — 행위 제한 확인 필요' },
];

export type ZoneHit = { zone: string; level: Level; why: string; law?: string };

/** 「접함」은 경계가 닿기만 한 것이라 뺀다 — 「포함」·「저촉」만 그 땅의 지역이다. */
export function judgeZones(zones: { name: string; relation: string }[], mode: Mode): ZoneHit[] {
  const hits: ZoneHit[] = [];
  for (const z of zones) {
    if (/접함/.test(z.relation)) continue;
    const rule = ZONE_RULES.find((r) => r.match.test(z.name) && r[mode] !== null);
    if (rule) hits.push({ zone: z.name, level: rule[mode]!, why: rule.why, law: rule.law });
  }
  return hits;
}

/* ------------------------------------------------------------- 지목 */

/** 지번 표기 끝의 지목 한 글자(「142-1답」·「산 12임」) */
export function landCategoryOf(jibun: string | null | undefined): string | null {
  const m = jibun?.trim().match(/([가-힣]+)$/);
  return m ? m[1] : null;
}

const CATEGORY_NAME: Record<string, string> = {
  전: '전(밭)', 답: '답(논)', 과: '과수원', 임: '임야', 대: '대지', 장: '공장용지', 잡: '잡종지', 창: '창고용지', 목: '목장용지',
};

export function judgeLandCategory(cat: string | null): { level: Level; why: string } | null {
  if (!cat) return null;
  const name = CATEGORY_NAME[cat] ?? cat;
  if (/^(전|답|과)$/.test(cat)) return { level: 'conditional', why: `지목 ${name} — 농지전용 허가 필요` };
  if (cat === '임') return { level: 'conditional', why: `지목 ${name} — 산지일시사용허가 필요 · 평균경사도 15° 이하` };
  return { level: 'ok', why: `지목 ${name}` };
}

/* ------------------------------------------------------------- 지상형 — 경사 · 진입도로 */

/**
 * 개발행위허가 기준의 경사·도로(국토계획법 시행령 별표 1의2 — 표고·경사도는 시·군 도시·군계획조례, 진입도로는 조례로 정하는
 * 도로 너비). 산지 태양광은 평균경사도 15° 이하만(산지관리법 시행령, 2018 강화). 공공 자료에 경사도 숫자는 없어서 토지특성
 * (개별공시지가 조사)의 지형높이 · 도로접면으로 짚는다 — 급경사·고지는 경사도를, 맹지·세로(불)은 진입도로를 확인할 것.
 */
export function judgeTerrain(t: { height: string | null; road: string | null }): { level: Level; why: string }[] {
  const out: { level: Level; why: string }[] = [];
  if (t.height === '급경사') out.push({ level: 'conditional', why: '급경사 — 경사도 기준(산지 평균 15° 이하 · 그 밖은 시·군 조례) 확인, 토목비가 큼' });
  else if (t.height === '고지') out.push({ level: 'conditional', why: '고지 — 주변보다 높이 솟은 땅, 표고·경사도 기준(시·군 조례) 확인' });
  if (t.road === '맹지') out.push({ level: 'conditional', why: '맹지 — 길에 닿지 않아 진입도로를 확보해야 개발행위허가' });
  else if (t.road === '세로(불)') out.push({ level: 'conditional', why: '차가 못 다니는 길에만 닿음 — 공사·점검 차량 진입로 확보 필요' });
  return out;
}

/* ------------------------------------------------------------- 지상형 — 개발행위허가 규모 · 소규모 환경영향평가 */

/**
 * 개발행위허가 규모(국토계획법 시행령 제55조 ① — 토지 형질변경 면적이 이만큼 「미만」이어야 한다). 관리·농림지역은 시·군
 * 조례로 더 작게 정할 수 있다. 넘으면 도시·군계획위원회 심의 등 예외 요건을 봐야 하고, 재해영향평가 협의 대상이 된다
 * (자연재해대책법 시행령 별표 1 — 개발행위허가는 이 규모를 넘을 때만, 부지 5천㎡ 이상).
 * 소규모 환경영향평가(환경영향평가법 시행령 별표 4 — 사업계획 면적이 이만큼 「이상」이면 사업 승인 전 협의). 도시지역은 대상이 아니다.
 * 값은 에너지공단 재생에너지 클라우드플랫폼 「인허가 절차」와 같다(2026-11-03 확인).
 * 매장유산 지표조사 면적(옛 「3만㎡ 이상」)은 시행령 제4조가 2025-02-13 삭제돼 지금 기준을 확정하지 못해 넣지 않았다.
 */
const DEV_LIMIT: { match: RegExp; m2: number }[] = [
  { match: /보전녹지지역/, m2: 5_000 },
  { match: /자연환경보전지역/, m2: 5_000 },
  { match: /주거지역|상업지역|자연녹지지역|생산녹지지역/, m2: 10_000 },
  { match: /공업지역/, m2: 30_000 },
  { match: /관리지역/, m2: 30_000 },
  { match: /농림지역/, m2: 30_000 },
];
const SMALL_EIA: { match: RegExp; m2: number }[] = [
  { match: /보전관리지역/, m2: 5_000 },
  { match: /자연환경보전지역/, m2: 5_000 },
  { match: /생산관리지역/, m2: 7_500 },
  { match: /농림지역/, m2: 7_500 },
  { match: /계획관리지역/, m2: 10_000 },
];
export const DEV_LAW = '국토계획법 시행령 제55조 · 환경영향평가법 시행령 별표 4 · 자연재해대책법 시행령 별표 1';

export type DevJudgement = { level: Level | 'unknown'; why: string; facts: { label: string; value: string }[] };

/**
 * @param zones 필지에 걸린 용도지역·지구 이름(접함 뺌) — 용도지역이 여럿이면 한도가 가장 작은 것으로 본다
 * @param areaM2 개발 면적 @param basis 면적을 무엇으로 쟀나(필지 · 그린 네모)
 */
export function judgeDevPermit(zones: string[], areaM2: number | null, basis: string): DevJudgement {
  const tightest = (rules: { match: RegExp; m2: number }[]) =>
    rules.flatMap((r) => zones.filter((z) => r.match.test(z)).map((zone) => ({ zone, m2: r.m2 }))).sort((a, b) => a.m2 - b.m2)[0] ?? null;
  const dev = tightest(DEV_LIMIT);
  const eia = tightest(SMALL_EIA);
  const facts: { label: string; value: string }[] = [];
  if (areaM2 !== null) facts.push({ label: '개발 면적', value: `${Math.round(areaM2).toLocaleString()}㎡ (${basis})` });
  if (dev)
    facts.push({
      label: '개발행위허가 규모',
      value: `${dev.zone} ${dev.m2.toLocaleString()}㎡ 미만${/관리지역|농림지역/.test(dev.zone) ? ' — 시·군 조례로 더 작을 수 있음' : ''}`,
    });
  facts.push({ label: '소규모 환경영향평가', value: eia ? `${eia.zone} ${eia.m2.toLocaleString()}㎡ 이상이면 협의` : '대상 지역 아님' });
  if (!dev) return { level: 'unknown', why: '용도지역을 몰라 개발행위허가 규모를 못 봄', facts };
  if (areaM2 === null) return { level: 'unknown', why: '면적을 못 재 개발행위허가 규모를 못 봄', facts };
  const flags: string[] = [];
  if (areaM2 >= dev.m2)
    flags.push(`${dev.zone} 개발행위허가 규모(${dev.m2.toLocaleString()}㎡ 미만)를 넘음 — 도시·군계획위원회 심의 등 예외 요건 · 재해영향평가 협의`);
  if (eia && areaM2 >= eia.m2) flags.push(`${eia.zone} ${eia.m2.toLocaleString()}㎡ 이상 — 소규모 환경영향평가 협의(사업 승인 전)`);
  if (flags.length) return { level: 'conditional', why: flags.join(' / '), facts };
  return { level: 'ok', why: `개발행위허가(시·군) — 규모 안${eia ? ' · 소규모 환경영향평가 대상 아님' : ''}`, facts };
}

/* ------------------------------------------------------------- 계통 */

export const LAYER_NAME: Record<GridLayerKey, string> = { substation: '변전소', transformer: '주변압기', feeder: '배전선로' };

/** 여유가 가장 작은 단계 — 접속을 막는 곳. 하나라도 모르면 null */
export function bottleneckOf(row: GridRow): GridLayerKey | null {
  let worst: GridLayerKey | null = null;
  for (const k of GRID_LAYERS) {
    const v = row.layers[k].spareKw;
    if (v === null) return null;
    if (worst === null || v < row.layers[worst].spareKw!) worst = k;
  }
  return worst;
}

const kw = (v: number) => `${v.toLocaleString()}kW`;

/**
 * 한전 여유용량 → 판정. 변전소·주변압기·배전선로 셋 중 가장 작은 여유가 그 땅의 여유다.
 * 여유가 0 인 단계가 어디냐에 따라 기다릴 것이 다르다 — 변전소·주변압기는 한전의 보강을 기다리고,
 * 배전선로는 보강하면 붙는데 그 비용을 사업자가 쓰는 만큼 낸다(2024-02 개편, 2024-11 이후 신청분 —
 * 「설계조정시설부담금」 · 전기신문·이코노믹리뷰 2024-01-31).
 * 지역 사정(GRID_REGION)은 여유가 있어도 「적합」을 막는다.
 */
export function judgeGrid(row: GridRow | null, capacityKw: number | null, sido: string | null): {
  level: Level | 'unknown';
  why: string;
} {
  const region = sido ? GRID_REGION[sido] : undefined;
  const spare = row?.spareKw ?? null;
  let base: { level: Level | 'unknown'; why: string };
  if (!row || spare === null) base = { level: 'unknown', why: '한전 여유용량 자료 없음' };
  else if (spare <= 0) {
    const upstream = (['substation', 'transformer'] as const).filter((k) => row.layers[k].spareKw! <= 0);
    base = upstream.length
      ? { level: 'hard', why: `${upstream.map((k) => LAYER_NAME[k]).join('·')} 여유 0 — 한전 보강이 끝나야 접속` }
      : { level: 'hard', why: '배전선로 여유 0 — 선로 보강 뒤 접속 (보강비는 사업자가 쓰는 만큼 부담)' };
  } else {
    const at = LAYER_NAME[bottleneckOf(row)!];
    base =
      capacityKw !== null && spare < capacityKw
        ? { level: 'conditional', why: `${at} 여유 ${kw(spare)} — 예상 ${kw(capacityKw)}보다 작음 (용량을 줄이거나 보강)` }
        : { level: 'ok', why: `여유 ${kw(spare)} — 가장 빠듯한 ${at} 기준` };
  }
  if (region && (base.level === 'ok' || base.level === 'unknown')) return { level: 'conditional', why: region };
  return base;
}

/* ------------------------------------------------------------- 허가 */

/**
 * 발전사업 허가권자 — 3,000kW 이하는 시·도지사(전기사업법 시행령 제62조①1호 위임), 넘으면 기후에너지환경부장관이
 * 전기위원회 심의를 거쳐 허가한다(전기사업법 제7조①② · 2025-10-01 부처 개편). 제주 태양광도 같은 규칙이다
 * (제주특별법 제303조 특례는 풍력만). 막는 것이 아니라 길이라서 통과로 두고, 길을 한 줄로 말한다.
 */
export const PERMIT_LIMIT_KW = 3000;
export function judgePermit(capacityKw: number | null, sido: string | null): { level: Level; why: string } | null {
  if (capacityKw === null) return null;
  if (capacityKw <= PERMIT_LIMIT_KW)
    return { level: 'ok', why: `${sido === '50' ? '제주특별자치도지사' : '시·도지사'} 허가 (3MW 이하)` };
  return { level: 'ok', why: '기후에너지환경부장관 허가 · 전기위원회 심의 (3MW 초과)' };
}

/* ------------------------------------------------------------- 지붕형 이격 */

/**
 * 지붕형은 주택 이격(제27조의3 ②)에서 빠진다(③ 2호). 그러나 ③이 빼 주는 것은 ②뿐이라, ①이 따로 정한 지역 —
 * 역사문화환경 보존지역·보호구역 · 생태·경관보전지역 · 시행령의 관광지·관광단지·자연취락지구 — 에서는
 * 지붕형도 조례 이격거리가 걸릴 수 있다(재생에너지 개발·이용·보급 촉진법, 2026-09-18 시행).
 */
const SETBACK_AREAS = /역사문화환경|(문화재|문화유산|국가유산).{0,4}보호구역|생태.?경관보전지역|관광지(?!구)|관광단지|자연취락지구/;
export function judgeRoofSetback(zones: { name: string; relation: string }[] | null): { level: Level | 'skip'; why: string; law?: string } {
  const hit = (zones ?? []).filter((z) => !/접함/.test(z.relation) && SETBACK_AREAS.test(z.name)).map((z) => z.name);
  if (hit.length)
    return {
      level: 'conditional',
      why: `지붕형이지만 ${[...new Set(hit)].join(' · ')} — 조례 이격거리가 적용될 수 있음`,
      law: '재생에너지법 제27조의3 ①',
    };
  return { level: 'skip', why: '지붕형은 주택 이격거리 적용 제외 — 재생에너지법 제27조의3 ③ (2026-09-18 시행)' };
}

/* ------------------------------------------------------------- 건물 */

export function judgeBuildingAge(useAprDay: string | null, today = new Date()): { level: Level; why: string } | null {
  const m = useAprDay?.match(/^(\d{4})/);
  if (!m) return null;
  const years = today.getFullYear() - Number(m[1]);
  if (years >= OLD_BUILDING_YEARS) {
    return { level: 'conditional', why: `사용승인 ${m[1]}년 (${years}년 경과) — 지붕 구조 안전진단 필요` };
  }
  return { level: 'ok', why: `사용승인 ${m[1]}년` };
}

/* ------------------------------------------------------------- 이격 */

/**
 * 지상형 주택 이격. 법이 정한 위 한도(200m 안 · 5호 이상)를 넘는 이격은 조례로도 못 둔다.
 * 그래서 200m 안 주택이 5호 미만이면 어느 지자체든 이격 대상이 아니다.
 */
export function judgeSetback(houses: number): { level: Level; why: string } {
  if (houses < SETBACK.minHouses) {
    return { level: 'ok', why: `${SETBACK.radiusM}m 안 주택 ${houses}호 — 이격 대상 아님 (${SETBACK.minHouses}호 미만)` };
  }
  return {
    level: 'conditional',
    why: `${SETBACK.radiusM}m 안 주택 ${houses}호 이상 — 지자체 조례의 이격거리 확인 필요`,
  };
}

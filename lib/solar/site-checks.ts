/**
 * 부지 검토의 검사 짓기 — 받아 온 자료(Settled)를 검사 한 칸(Check)으로. 자료를 받는 일은 run.ts 가 한다. [순수]
 */
import { SETBACK } from './assumptions';
import { buildingUseName } from './building-use';
import { summarizeRegister, type RegisterBuilding, type RegisterSummary } from './building-register';
import { dropShadowCopies } from './buildings';
import { areaLabel } from './estimate';
import { areaOf, centroidOf, containsPoint, distanceBetween, type PolygonCoords } from './geo';
import { num, pick, str } from './props';
import {
  isUseZone,
  JIMOK_NAME,
  judgeBuildingAge,
  judgeLandCategory,
  judgeRoofSetback,
  judgeSetback,
  judgeTerrain,
  judgeZones,
  landCategoryOf,
  zonesInside,
} from './rules';
import type { Feature, LandTraits, Zone } from './sources/vworld';
import type { Check, Fact, Level, Mode, SiteFacts } from './types';
import { worstLevel } from './verdict';

/** 자료 하나를 받은 결과 — 못 받았으면 그 까닭(검사가 「못 받음 — …」으로 적는다) */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

const SRC_VWORLD = { name: 'VWorld 국토교통부 공간정보' };

/* ------------------------------------------------------------ 검사들 */

function unknown(key: string, title: string, why: string, source = SRC_VWORLD): Check {
  return { key, title, status: 'unknown', summary: why, source };
}

/** 필지 안에 서 있는 건물 — 도형 중심이 필지 안에 있는 것만(옆 필지 건물이 BOX 에 같이 걸린다). */
function buildingsOnParcel(parcelPolys: PolygonCoords[], all: Feature[]): Feature[] {
  return all.filter((b) => {
    const c = centroidOf(b.polygons);
    return c ? containsPoint(parcelPolys, c) : false;
  });
}

/**
 * 슬레이트 지붕 — 설치 전에 걷어내라는 조항은 없다(재생에너지법·REC 고시·2026 지원사업 공고에 「슬레이트」 0건).
 * 석면이면 걷어낼 때 석면해체·제거업자가 해야 하고(산업안전보건법 제122조), 지자체 처리 지원이 있다(석면안전관리법 제25조).
 */
const SLATE_LAW = '산업안전보건법 제122조 · 석면안전관리법 제25조';

/**
 * 건물 — 건축물대장이 있으면 그것이 정본(면적·구조·지붕재·준공), 없으면 VWorld 도형으로 잰다.
 * @returns on — 필지 위 VWorld 도형(지도에 칠한다). 대장으로 셌을 때도 지도에는 도형을 그린다.
 */
export function roofCheck(
  parcelPolys: PolygonCoords[],
  buildings: Settled<Feature[]>,
  register: Settled<RegisterBuilding[] | null>,
): { check: Check; area: number | null; on: (Feature & { registered: boolean })[]; summary?: RegisterSummary } {
  const title = '건물';
  const archOf = (b: Feature) => num(pick(b.properties, 'archarea', 'arch_area', 'bld_area'));
  const on = buildings.ok
    ? dropShadowCopies(buildingsOnParcel(parcelPolys, buildings.value).map((b) => ({ ...b, registered: (archOf(b) ?? 0) > 0 })))
    : [];

  if (register.ok && register.value?.length) {
    const r = registerCheck(register.value);
    if (r) return { ...r, on };
  }

  // 대장을 못 썼다 — 왜인지 사실 한 줄로 남긴다
  const registerFact: Fact = !register.ok
    ? { label: '건축물대장', value: `못 받음 — ${register.error}` }
    : register.value === null
      ? { label: '건축물대장', value: '연결 안 됨 (DATA_GO_KR_KEY 없음) — 지도 도형으로 잼' }
      : { label: '건축물대장', value: '이 지번으로 등록된 건물 없음' };
  const unregistered = register.ok && register.value !== null; // 대장을 봤는데 비었다

  if (!buildings.ok) return { check: unknown('roof', title, `건물 자료 못 받음 — ${buildings.error}`), area: null, on };
  if (on.length === 0) {
    return {
      check: { key: 'roof', title, status: 'hard', summary: '이 필지에 건물이 없음 — 지상형으로 검토', facts: [registerFact], source: SRC_VWORLD },
      area: null,
      on,
    };
  }
  const rows = on.map((b) => ({
    // 대장과 안 엮인 도형은 건축면적이 「0」으로 온다(실측: 풍세로 706 둘레 46동 중 27동) — 그때는 도형 면적
    area: b.registered ? archOf(b)! : areaOf(b.polygons),
    fromRegister: b.registered,
    useApr: str(pick(b.properties, 'useapr_day', 'use_apr_day', 'useaprday')),
    use: buildingUseName(str(pick(b.properties, 'usability_nm', 'main_purps_nm', 'usability'))),
  }));
  const area = rows.reduce((s, r) => s + r.area, 0);
  // 용도·사용승인은 대장이 붙은 동에서 — 도형만 있는 동은 둘 다 비어 있다
  const registered = rows.filter((r) => r.fromRegister);
  const biggest = (registered.length ? registered : rows).reduce((a, b) => (b.area > a.area ? b : a));
  const age = judgeBuildingAge(biggest.useApr);
  const size = `${areaLabel(area)} · ${rows.length}동${rows.every((r) => r.fromRegister) ? '' : ' (지도 도형으로 잼)'}`;
  // 대장을 봤는데 이 지번에 건물이 없다 — 무허가이거나 다른 지번으로 등록된 건물이다. 영업 전에 등록부터 본다
  const status: Level = unregistered ? 'conditional' : (age?.level ?? 'ok');
  const summary = unregistered ? '건축물대장에 이 지번 건물 없음 — 등록 여부 확인' : status === 'ok' ? `건축면적 ${size}` : age!.why;
  // 결론 한 줄에 있는 값은 사실 목록에 다시 적지 않는다
  const facts: Fact[] = [];
  if (status !== 'ok') facts.push({ label: '건축면적', value: size });
  if (biggest.use) facts.push({ label: '주용도(가장 큰 동)', value: biggest.use });
  if (age && age.why !== summary) facts.push({ label: '사용승인', value: age.why });
  if (!unregistered) facts.push(registerFact);
  return { check: { key: 'roof', title, status, summary, facts, source: SRC_VWORLD }, area, on };
}

/** 대장 표제부로 본 건물 — 건축면적이 하나도 없으면 null(도형으로 돌아간다) */
function registerCheck(rows: RegisterBuilding[]): { check: Check; area: number; summary: RegisterSummary } | null {
  const sum = summarizeRegister(rows);
  if (sum.area <= 0 || !sum.biggest) return null;
  const b = sum.biggest;
  const age = judgeBuildingAge(b.useApr ?? rows.find((r) => r.useApr)?.useApr ?? null);
  const flags: { why: string; law?: string }[] = [];
  if (age?.level === 'conditional') flags.push({ why: age.why });
  if (sum.slate) flags.push({ why: '슬레이트 지붕 — 석면이면 철거·교체 뒤 설치가 일반적 (지자체 처리 지원 있음)', law: SLATE_LAW });
  const roof = sum.kinds[0]?.kind !== '기타' ? sum.kinds[0]?.kind : null;
  const size = `${areaLabel(sum.area)} · ${sum.count}동`;
  // 결론 한 줄(통과면 면적·동수·지붕)에 있는 값은 사실 목록에 다시 적지 않는다 — 걸렸을 때만 결론이 그 자리를 비운다
  const facts: Fact[] = [];
  if (flags.length) facts.push({ label: '건축면적', value: size });
  if (sum.attached.count)
    facts.push({ label: '부속건축물', value: `${sum.attached.count}동 ${Math.round(sum.attached.area).toLocaleString()}㎡ — 면적에서 뺌` });
  if (b.use) facts.push({ label: '주용도(가장 큰 동)', value: b.use });
  if (b.structure) facts.push({ label: '구조', value: b.structure });
  if (sum.kinds.length > 1 || (flags.length && sum.kinds.length))
    facts.push({ label: '지붕', value: sum.kinds.map((k) => `${k.kind} ${Math.round(k.area).toLocaleString()}㎡`).join(' · ') });
  if (b.height) facts.push({ label: '높이', value: `${b.height}m` });
  if (age && age.level !== 'conditional') facts.push({ label: '사용승인', value: age.why }); // 걸렸으면 결론 한 줄에 있다
  return {
    check: {
      key: 'roof',
      title: '건물',
      status: flags.length ? 'conditional' : 'ok',
      summary: flags.length
        ? flags.map((f) => f.why).join(' / ')
        : `건축면적 ${size}${roof ? ` · ${roof} 지붕` : ''}`,
      facts,
      law: flags.find((f) => f.law)?.law,
      source: { name: '국토교통부 건축물대장' },
    },
    area: sum.area,
    summary: sum,
  };
}

/**
 * 지붕면 부착형으로 까는 갈래 — 기와(경사 지붕)뿐. 나머지는 경사고정형이다: 실제 설계 223곳은 금속 지붕도 거의 다
 * 경사고정형 12~15° 였다(지붕면 부착형 2곳 — lib/layout).
 */
export const FLUSH_KINDS = new Set<string | undefined>(['기와']);

export function siteCheck(parcel: Feature, polys: PolygonCoords[]): { check: Check; area: number | null } {
  const title = '부지';
  if (polys.length === 0) return { check: unknown('site', title, '필지 도형을 못 받음'), area: null };
  const area = areaOf(polys);
  const jibun = str(pick(parcel.properties, 'jibun'));
  const cat = landCategoryOf(jibun);
  const j = judgeLandCategory(cat);
  return {
    check: {
      key: 'site',
      title,
      status: j?.level ?? 'ok',
      summary: j ? j.why : `면적 ${Math.round(area).toLocaleString()}㎡`,
      facts: [
        { label: '필지', value: jibun ?? '—' },
        { label: '면적', value: `${areaLabel(area)} · 지적도 도형으로 잼` },
      ],
      source: SRC_VWORLD,
    },
    area,
  };
}

/**
 * 현장의 공적 자료 — 제안서의 「부지 검토」 표(에이치에너지 모햇)가 그대로 적는 칸. 땅은 토지특성이 정본이고(토지대장의 지목 · 면적),
 * 못 받으면 지목은 지번 끝 부호에서, 용도지역은 토지이용계획에서 읽는다. 면적은 갈음하지 않는다 — 지적도 도형 넓이는 토지대장과
 * 몇 % 어긋나 「대지면적」 칸에 적을 값이 아니다. 건물은 대장의 주건축물(건축면적 합 · 가장 큰 동의 주용도 · 사용승인일).
 */
export function siteFactsOf(
  /** 필지마다 — 토지특성과 지번(「12공」 — 끝 부호가 지목). 여러 필지를 한 부지로 묶으면 여럿(lib/solar/parcels) */
  lands: { traits: Settled<LandTraits | null>; jibun: string | null }[],
  zones: Settled<Zone[]>,
  register: RegisterSummary | null,
): SiteFacts {
  const ts = lands.map((l) => (l.traits.ok ? l.traits.value : null));
  // 용도지역 — 토지특성이 정본, 한 필지라도 못 받았으면 토지이용계획(필지 모두의 것)에서
  const zoning = ts.length && ts.every((t) => t?.zoning.length)
    ? [...new Set(ts.flatMap((t) => t!.zoning))]
    : zones.ok
      ? [...new Set(zonesInside(zones.value).map((z) => z.name).filter(isUseZone))]
      : [];
  const categories = lands.map((l, i) => {
    const code = landCategoryOf(l.jibun);
    return ts[i]?.category ?? (code ? (JIMOK_NAME[code] ?? null) : null);
  });
  const known = [...new Set(categories.filter((c): c is string => !!c))];
  // 토지 면적은 필지 모두를 알 때만 더한다 — 하나라도 모르면 합이 「대지면적」 칸에 적을 값이 아니다
  // (소수를 더하면 끝이 새서 둘째 자리로 — 대장의 건축면적과 같은 까닭)
  const areas = ts.map((t) => t?.areaM2 ?? null);
  const landAreaM2 = areas.length && areas.every((a) => a !== null)
    ? areas.length === 1
      ? areas[0]
      : Math.round(areas.reduce((s, a) => s + a!, 0) * 100) / 100
    : null;
  return {
    zoning,
    landCategory: known.length ? known.join(' · ') : null,
    landAreaM2,
    // 동마다의 ㎡(소수 둘째)를 더하면 3521.7200000000003 처럼 끝이 샌다 — 대장의 자리수로
    buildingAreaM2: register && register.area > 0 ? Math.round(register.area * 100) / 100 : null,
    buildingUse: register?.biggest?.use ?? null,
    approvedOn: register?.biggest?.useApr ?? null,
  };
}

/**
 * 필지마다의 용도지역 · 지구를 한 부지의 것으로 — 이름마다 하나. 한 필지에라도 걸렸으면(포함 · 저촉) 걸린 것이다(접함은 모두가
 * 접함일 때만) — 같은 지역이 두 번 서면 판정 사유 · 「걸린 지역·지구」가 두 번 적힌다.
 */
export function mergeZones(lists: Zone[][]): Zone[] {
  const byName = new Map<string, Zone>();
  for (const z of lists.flat()) {
    const had = byName.get(z.name);
    if (!had || (zonesInside([z]).length && !zonesInside([had]).length)) byName.set(z.name, z);
  }
  return [...byName.values()];
}

/**
 * 필지마다 지은 같은 검사 하나를 한 칸으로(여러 필지를 한 부지로 묶었을 때 — 지상형의 부지 · 경사 · 진입도로).
 * 상태는 가장 나쁜 것 — 한 필지라도 자료를 못 받았으면 나머지가 통과여도 「모름」이다(통과로 치지 않는다). 결론은 그 상태인
 * 필지들의 결론에 필지 이름을 붙여 잇고(모두 같은 말이면 한 번), 사실도 필지 이름을 붙여 늘어놓는다.
 */
export function mergeLotChecks(labels: string[], checks: Check[]): Check {
  if (checks.length === 1) return checks[0];
  const levels = checks.flatMap((c) => (c.status === 'unknown' || c.status === 'skip' ? [] : [c.status]));
  const worst = worstLevel(levels);
  const status = worst === 'ok' && checks.some((c) => c.status === 'unknown') ? 'unknown' : levels.length ? worst : checks[0].status;
  const top = checks.map((c, i) => ({ c, label: labels[i] })).filter(({ c }) => c.status === status);
  const summaries = new Set(top.map(({ c }) => c.summary));
  return {
    key: checks[0].key,
    title: checks[0].title,
    status,
    summary: summaries.size === 1 && top.length === checks.length ? [...summaries][0] : top.map(({ c, label }) => `${label} — ${c.summary}`).join(' / '),
    facts: checks.flatMap((c, i) => (c.facts ?? []).map((f) => ({ label: `${labels[i]} ${f.label}`, value: f.value }))),
    law: top.find(({ c }) => c.law)?.c.law,
    source: checks[0].source,
  };
}

/** 지상형 경사 · 진입도로 — 토지특성의 지형높이 · 도로접면(lib/rules judgeTerrain) */
export function terrainCheck(t: Settled<LandTraits | null>): Check {
  const title = '경사 · 진입도로';
  if (!t.ok) return unknown('terrain', title, `토지특성 못 받음 — ${t.error}`);
  if (!t.value) return unknown('terrain', title, '이 필지의 토지특성 자료 없음');
  const v = t.value;
  const hits = judgeTerrain(v);
  const facts: Fact[] = [
    { label: '지형', value: [v.height, v.shape].filter(Boolean).join(' · ') || '—' },
    { label: '도로', value: v.road ?? '—' },
    { label: '지금 쓰임', value: v.use ?? '—' },
  ];
  return {
    key: 'terrain',
    title,
    status: hits.length ? 'conditional' : 'ok',
    summary: hits.length ? hits.map((h) => h.why).join(' / ') : `${v.height ?? '지형 모름'} · ${v.road ?? '도로 모름'}`,
    facts,
    law: '국토계획법 시행령 별표 1의2 · 산지관리법 시행령',
  };
}

export function zoneCheck(zones: Settled<Zone[]>, mode: Mode): Check {
  const title = '용도지역·지구';
  if (!zones.ok) return unknown('zone', title, `토지이용계획 못 받음 — ${zones.error}`);
  const hits = judgeZones(zones.value, mode);
  const worst = worstLevel(hits.map((h) => h.level));
  const inZone = zonesInside(zones.value).map((z) => z.name);
  const facts: Fact[] = [{ label: '걸린 지역·지구', value: inZone.length ? inZone.join(' · ') : '0건' }];
  for (const h of hits) facts.push({ label: h.zone, value: h.why });
  const top = hits.filter((h) => h.level === worst);
  return {
    key: 'zone',
    title,
    status: worst,
    summary: worst === 'ok' ? '설치를 막는 지역·지구 없음' : top.map((h) => h.why).join(' / '),
    law: [...new Set(top.flatMap((h) => (h.law ? [h.law] : [])))].join(' · ') || undefined,
    facts,
    source: { name: 'VWorld 토지이용계획' },
  };
}

export function roofSetbackCheck(zones: Zone[] | null): Check {
  const j = judgeRoofSetback(zones);
  return { key: 'setback', title: '이격거리', status: j.level, summary: j.why, law: j.law };
}

const isHouse = (b: Feature) => {
  const code = str(pick(b.properties, 'usability', 'main_purps_cd')) ?? '';
  const name = str(pick(b.properties, 'usability_nm', 'main_purps_nm')) ?? '';
  if (/^01/.test(code) || /단독주택|다가구|다중주택/.test(name)) return 'single' as const;
  if (/^02/.test(code) || /공동주택|아파트|연립|다세대/.test(name)) return 'multi' as const;
  return null;
};

/** @returns houses — 200m 안에 든 주택(지도에 칠한다) */
export function setbackCheck(parcelPolys: PolygonCoords[], buildings: Settled<Feature[]>): { check: Check; houses: Feature[] } {
  const title = '주택 이격';
  if (!buildings.ok) return { check: unknown('setback', title, `건물 자료 못 받음 — ${buildings.error}`), houses: [] };
  let single = 0;
  let multi = 0;
  let multiHouseholds = 0;
  const houses: Feature[] = [];
  for (const b of buildings.value) {
    const kind = isHouse(b);
    if (!kind) continue;
    if (distanceBetween(parcelPolys, b.polygons) > SETBACK.radiusM) continue;
    houses.push(b);
    if (kind === 'single') single++;
    else {
      multi++;
      multiHouseholds += num(pick(b.properties, 'hhld_cnt', 'hhldcnt', 'ho_cnt')) ?? SETBACK.minHouses;
    }
  }
  const j = judgeSetback(single + multiHouseholds);
  return {
    check: {
      key: 'setback',
      title,
      status: j.level,
      summary: j.why,
      facts: [
        { label: `${SETBACK.radiusM}m 안 단독주택`, value: `${single}동` },
        { label: `${SETBACK.radiusM}m 안 공동주택`, value: `${multi}동` },
        { label: '빈집', value: '1년 넘게 비어 있는 집은 빼도 되지만 공공 자료로는 못 가림' },
      ],
      source: SRC_VWORLD,
    },
    houses,
  };
}


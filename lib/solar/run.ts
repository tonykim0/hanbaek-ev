import { SETBACK } from './assumptions';
import { areaLabel, estimate } from './estimate';
import { buildingUseName } from './building-use';
import { summarizeRegister, type RegisterBuilding, type RegisterSummary } from './building-register';
import { devCheckOf, gridCheckOf, gridViewOf, permitCheckOf } from './capacity-checks';
import { dropShadowCopies, markProvisional } from './buildings';
import { areaOf, bboxOf, centroidOf, containsPoint, distanceBetween, expandBbox, roundPolys, type PolygonCoords } from './geo';
import { gridNear, type GridResult } from './grid';
import { parsePnu } from './pnu';
import {
  judgeBuildingAge,
  judgeLandCategory,
  judgeRoofSetback,
  judgeSetback,
  judgeTerrain,
  judgeZones,
  landCategoryOf,
} from './rules';
import { registerTitles } from './sources/bldg';
import { addressBuildingsIn, buildingsIn, landTraits, parcelAt, zonesOf, type Feature, type LandTraits, type Zone } from './sources/vworld';
import { pointOfParcel, resolveTyped } from './suggest';
import type { Check, Fact, Level, Mode, Place, Report, SiteMap, Suggestion } from './types';
import { judge } from './verdict';

/** 사람이 고쳐야 하는 입력 잘못 — 화면에 그대로 보인다(400). */
export class InputError extends Error {}

/** 속성 이름이 문서에 없어 후보 중 처음 있는 것을 쓴다(대소문자 무시). */
function pick(props: Record<string, unknown>, ...names: string[]): unknown {
  const lower = Object.fromEntries(Object.entries(props).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
/** VWorld 는 빈 칸을 「」로 준다 — 없는 값으로 본다(Number('') 는 0 이라 면적 0 으로 셈해졌다). */
const blank = (v: unknown) => v === undefined || v === null || v === '';
const str = (v: unknown) => (blank(v) ? null : String(v));
const num = (v: unknown) => {
  if (blank(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const SRC_VWORLD = { name: 'VWorld 국토교통부 공간정보' };

type Settled<T> = { ok: true; value: T } | { ok: false; error: string };
async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[source]', error);
    return { ok: false, error };
  }
}

/**
 * @param picked 자동완성에서 고른 후보 — 있으면 다시 찾지 않고 그 좌표로 본다
 *   (같은 글자로 다시 찾으면 다른 줄이 첫째로 올 수 있다).
 */
export async function runCheck(query: string, mode: Mode, picked?: Suggestion | null): Promise<Report> {
  let hit = picked ?? null;
  if (!hit) {
    const r = await resolveTyped(query);
    if (r.ambiguous) throw new InputError(`「${query}」이(가) ${r.ambiguous}곳에 있습니다. 아래 목록에서 골라 주세요.`);
    hit = r.hit;
  }
  if (!hit) {
    throw new InputError(
      /\d/.test(query)
        ? '주소를 찾지 못했습니다. 도로명·지번 주소로 다시 넣어 주세요.'
        : '건물번호·지번까지 넣거나 아래 목록에서 골라 주세요.',
    );
  }

  // 장소(상호)는 카카오 표시점이 대지 밖에 찍히기도 한다 — 동성제약 아산공장은 표시점이 옆 필지(산전리 171-6),
  // 대지(관대안길 45)는 관대리 36 이다. 그 장소의 지번 주소로 필지를 잡고, 못 잡으면 표시점으로 본다.
  const spot = (hit.kind === 'place' && hit.parcel && (await pointOfParcel(hit.parcel))) || hit;
  const parcel = (await parcelAt(spot.lng, spot.lat)) ?? (spot === hit ? null : await parcelAt(hit.lng, hit.lat));
  if (!parcel) throw new InputError('그 자리의 필지를 찾지 못했습니다. 다른 후보를 골라 주세요.');
  const pnu = parcel ? str(pick(parcel.properties, 'pnu')) : null;
  const parts = parsePnu(pnu);
  const jibunAddress = (parcel && str(pick(parcel.properties, 'addr'))) ?? hit.parcel;

  const place: Place = {
    query,
    roadAddress: hit.road,
    jibunAddress,
    buildingName: hit.name,
    pnu,
    lat: hit.lat,
    lng: hit.lng,
  };

  const parcelPolys = parcel?.polygons ?? [];
  const bbox = bboxOf(parcelPolys);

  const [zones, buildings, grid, register, addressBuildings, traits] = await Promise.all([
    pnu ? settle(zonesOf(pnu)) : Promise.resolve<Settled<Zone[]>>({ ok: false, error: '필지번호 없음' }),
    bbox
      ? settle(buildingsIn(mode === 'ground' ? expandBbox(bbox, SETBACK.radiusM) : bbox))
      : Promise.resolve<Settled<Feature[]>>({ ok: false, error: '필지 도형 없음' }),
    pnu
      ? settle(gridNear(pnu, jibunAddress, parcelPolys))
      : Promise.resolve<Settled<GridResult>>({ ok: false, error: '필지번호 없음' }),
    mode === 'roof' && parts
      ? settle(registerTitles(parts))
      : Promise.resolve<Settled<RegisterBuilding[] | null>>({ ok: true, value: null }),
    // 도로명주소 건물 — 지도 모양이 주소를 붙일 때 그린 임시 네모인지 가른다(못 받아도 검토는 그대로)
    mode === 'roof' && bbox ? settle(addressBuildingsIn(bbox)) : Promise.resolve<Settled<Feature[]>>({ ok: true, value: [] }),
    // 토지특성 — 지상형의 경사 · 진입도로
    mode === 'ground' && pnu ? settle(landTraits(pnu)) : Promise.resolve<Settled<LandTraits | null>>({ ok: true, value: null }),
  ]);

  const checks: Check[] = [];

  /* 면적 — 지붕형은 필지 위 건물의 건축면적, 지상형은 필지 면적 */
  let area: number | null = null;
  let counted: (Feature & { registered: boolean })[] = [];
  let registered: RegisterSummary | null = null;
  if (mode === 'roof') {
    const c = roofCheck(parcelPolys, buildings, register);
    checks.push(c.check);
    area = c.area;
    counted = c.on;
    registered = c.summary ?? null;
  } else {
    const c = siteCheck(parcel, parcelPolys);
    checks.push(c.check);
    area = c.area;
  }

  const est = area ? estimate({ area, mode }) : null;

  checks.push(zoneCheck(zones, mode));
  const zoneNames = zones.ok ? zones.value.filter((z) => !/접함/.test(z.relation)).map((z) => z.name) : [];
  let houses: Feature[] = [];
  if (mode === 'roof') checks.push(roofSetbackCheck(zones.ok ? zones.value : null));
  else {
    const c = setbackCheck(parcelPolys, buildings);
    checks.push(c.check);
    houses = c.houses;
    checks.push(terrainCheck(traits));
    checks.push(devCheckOf(zoneNames, area, '필지 면적'));
  }
  const capacityKw = est?.capacityKw ?? null;
  const sido = parts?.sido ?? null;
  const gridView = grid.ok ? gridViewOf(grid.value, capacityKw, sido) : null;
  checks.push(gridCheckOf(gridView, grid.ok ? null : grid.error, sido));
  const permit = permitCheckOf(capacityKw, sido);
  if (permit) checks.push(permit);

  const map: SiteMap = {
    point: { lat: hit.lat, lng: hit.lng },
    parcel: roundPolys(parcelPolys),
    // 임시 모양(주소를 붙일 때 그린 네모)은 지붕이 아니라서 아예 그리지 않는다(한백 지시) — 그 자리는 AI·사람이 딴다
    buildings: (() => {
      const provisional = markProvisional(counted, addressBuildings.ok ? addressBuildings.value : []);
      return counted.filter((_, i) => !provisional[i]).map((b) => ({ polygons: roundPolys(b.polygons) }));
    })(),
    houses: houses.map((b) => roundPolys(b.polygons)),
    registerArea: registered ? Math.round(registered.area) : null,
    roofStyle: registered && FLUSH_KINDS.has(registered.kinds[0]?.kind) ? 'flush' : 'tilted',
  };

  return {
    place,
    mode,
    checks,
    verdict: judge(checks),
    estimate: est,
    grid: gridView,
    map,
    inputs: { sido, zones: zoneNames },
    checkedAt: new Date().toISOString(),
  };
}

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
function roofCheck(
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
const FLUSH_KINDS = new Set<string | undefined>(['기와']);

function siteCheck(parcel: Feature | null, polys: PolygonCoords[]): { check: Check; area: number | null } {
  const title = '부지';
  if (!parcel || polys.length === 0) return { check: unknown('site', title, '필지 도형을 못 받음'), area: null };
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

/** 지상형 경사 · 진입도로 — 토지특성의 지형높이 · 도로접면(lib/rules judgeTerrain) */
function terrainCheck(t: Settled<LandTraits | null>): Check {
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

function zoneCheck(zones: Settled<Zone[]>, mode: Mode): Check {
  const title = '용도지역·지구';
  if (!zones.ok) return unknown('zone', title, `토지이용계획 못 받음 — ${zones.error}`);
  const hits = judgeZones(zones.value, mode);
  const worst = hits.reduce<Level>((w, h) => (rank(h.level) > rank(w) ? h.level : w), 'ok');
  const inZone = zones.value.filter((z) => !/접함/.test(z.relation)).map((z) => z.name);
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

function roofSetbackCheck(zones: Zone[] | null): Check {
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
function setbackCheck(parcelPolys: PolygonCoords[], buildings: Settled<Feature[]>): { check: Check; houses: Feature[] } {
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

const LEVEL_RANK: Record<Level, number> = { ok: 0, conditional: 1, hard: 2, banned: 3 };
const rank = (l: Level) => LEVEL_RANK[l];

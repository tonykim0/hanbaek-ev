/**
 * 부지 검토 한 번 — 주소를 필지로 잡고, 자료(용도지역 · 건물 · 계통 · 건축물대장 · 토지특성)를 한꺼번에 받아, 검사를 지어 판정한다.
 * 자료를 받는 일만 여기서 하고, 받은 것을 검사로 짓는 일은 site-checks(순수)가 한다.
 */
import { SETBACK } from './assumptions';
import { estimate } from './estimate';
import type { RegisterBuilding, RegisterSummary } from './building-register';
import { devCheckOf, gridCheckOf, gridViewOf, permitCheckOf } from './capacity-checks';
import { markProvisional } from './buildings';
import { bboxOf, expandBbox, roundPolys } from './geo';
import { gridNear, type GridResult } from './grid';
import { parsePnu } from './pnu';
import { pick, str } from './props';
import { zonesInside } from './rules';
import { FLUSH_KINDS, roofCheck, roofSetbackCheck, setbackCheck, siteCheck, siteFactsOf, terrainCheck, zoneCheck, type Settled } from './site-checks';
import { registerTitles } from './sources/bldg';
import { addressBuildingsIn, buildingsIn, landTraits, parcelAt, zonesOf, type Feature, type LandTraits, type Zone } from './sources/vworld';
import { pointOfParcel, resolveTyped } from './suggest';
import type { Check, Mode, Place, Report, SiteMap, Suggestion } from './types';
import { judge } from './verdict';

/** 사람이 고쳐야 하는 입력 잘못 — 화면에 그대로 보인다(400). */
export class InputError extends Error {}

async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[source]', error);
    return { ok: false, error };
  }
}

/** 부르지 않은 자료 — 받을 수 없었거나(필지번호 없음) 그 검토 방식에 쓰지 않는다 */
const missing = <T>(error: string): Promise<Settled<T>> => Promise.resolve({ ok: false, error });
const given = <T>(value: T): Promise<Settled<T>> => Promise.resolve({ ok: true, value });

/**
 * @param picked 자동완성에서 고른 후보 — 있으면 다시 찾지 않고 그 좌표로 본다
 *   (같은 글자로 다시 찾으면 다른 줄이 첫째로 올 수 있다).
 */
export async function runCheck(query: string, mode: Mode, picked?: Suggestion | null): Promise<Report> {
  const hit = await resolveHit(query, picked);
  const parcel = await locateParcel(hit);
  const pnu = str(pick(parcel.properties, 'pnu'));
  const parts = parsePnu(pnu);
  const jibunAddress = str(pick(parcel.properties, 'addr')) ?? hit.parcel;

  const place: Place = {
    query,
    roadAddress: hit.road,
    jibunAddress,
    buildingName: hit.name,
    pnu,
    lat: hit.lat,
    lng: hit.lng,
  };

  const parcelPolys = parcel.polygons;
  const bbox = bboxOf(parcelPolys);

  const [zones, buildings, grid, register, addressBuildings, traits] = await Promise.all([
    pnu ? settle(zonesOf(pnu)) : missing<Zone[]>('필지번호 없음'),
    bbox ? settle(buildingsIn(mode === 'ground' ? expandBbox(bbox, SETBACK.radiusM) : bbox)) : missing<Feature[]>('필지 도형 없음'),
    pnu ? settle(gridNear(pnu, jibunAddress, parcelPolys)) : missing<GridResult>('필지번호 없음'),
    mode === 'roof' && parts ? settle(registerTitles(parts)) : given<RegisterBuilding[] | null>(null),
    // 도로명주소 건물 — 지도 모양이 주소를 붙일 때 그린 임시 네모인지 가른다(못 받아도 검토는 그대로)
    mode === 'roof' && bbox ? settle(addressBuildingsIn(bbox)) : given<Feature[]>([]),
    // 토지특성 — 지상형의 경사 · 진입도로, 두 방식 다 지목 · 토지 면적 · 용도지역(제안서의 부지 검토 표 — Report.site)
    pnu ? settle(landTraits(pnu)) : given<LandTraits | null>(null),
  ]);

  const checks: Check[] = [];

  /* 면적 — 지붕형은 필지 위 건물의 건축면적, 지상형은 필지 면적 */
  let area: number | null = null;
  let counted: (Feature & { registered: boolean })[] = [];
  let registerSummary: RegisterSummary | null = null;
  if (mode === 'roof') {
    const c = roofCheck(parcelPolys, buildings, register);
    checks.push(c.check);
    area = c.area;
    counted = c.on;
    registerSummary = c.summary ?? null;
  } else {
    const c = siteCheck(parcel, parcelPolys);
    checks.push(c.check);
    area = c.area;
  }

  const est = area ? estimate({ area, mode }) : null;

  checks.push(zoneCheck(zones, mode));
  const zoneNames = zones.ok ? zonesInside(zones.value).map((z) => z.name) : [];
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

  return {
    place,
    mode,
    checks,
    verdict: judge(checks),
    estimate: est,
    grid: gridView,
    map: siteMapOf(hit, parcelPolys, counted, addressBuildings, houses, registerSummary),
    site: siteFactsOf(traits, zones, registerSummary, str(pick(parcel.properties, 'jibun'))),
    inputs: { sido, zones: zoneNames },
    checkedAt: new Date().toISOString(),
  };
}

/** 검색어 → 후보 하나. 여러 곳이면 고르라고, 못 찾으면 더 적으라고 멈춘다 */
async function resolveHit(query: string, picked?: Suggestion | null): Promise<Suggestion> {
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
  return hit;
}

/**
 * 후보의 필지 — 장소(상호)는 카카오 표시점이 대지 밖에 찍히기도 한다(동성제약 아산공장은 표시점이 옆 필지(산전리 171-6),
 * 대지(관대안길 45)는 관대리 36 이다). 그 장소의 지번 주소로 필지를 잡고, 못 잡으면 표시점으로 본다.
 */
async function locateParcel(hit: Suggestion): Promise<Feature> {
  const spot = (hit.kind === 'place' && hit.parcel && (await pointOfParcel(hit.parcel))) || hit;
  const parcel = (await parcelAt(spot.lng, spot.lat)) ?? (spot === hit ? null : await parcelAt(hit.lng, hit.lat));
  if (!parcel) throw new InputError('그 자리의 필지를 찾지 못했습니다. 다른 후보를 골라 주세요.');
  return parcel;
}

/** 지도에 그릴 것 — 필지 · 필지 위 건물(임시 모양 빼고) · 200m 안 주택 · 대장 면적 · 지붕 배치 방식 */
function siteMapOf(
  hit: Suggestion,
  parcelPolys: Feature['polygons'],
  counted: (Feature & { registered: boolean })[],
  addressBuildings: Settled<Feature[]>,
  houses: Feature[],
  registerSummary: RegisterSummary | null,
): SiteMap {
  // 임시 모양(주소를 붙일 때 그린 네모)은 지붕이 아니라서 아예 그리지 않는다(한백 지시) — 그 자리는 AI·사람이 딴다
  const provisional = markProvisional(counted, addressBuildings.ok ? addressBuildings.value : []);
  return {
    point: { lat: hit.lat, lng: hit.lng },
    parcel: roundPolys(parcelPolys),
    buildings: counted.filter((_, i) => !provisional[i]).map((b) => ({ polygons: roundPolys(b.polygons) })),
    houses: houses.map((b) => roundPolys(b.polygons)),
    registerArea: registerSummary ? Math.round(registerSummary.area) : null,
    roofStyle: registerSummary && FLUSH_KINDS.has(registerSummary.kinds[0]?.kind) ? 'flush' : 'tilted',
  };
}

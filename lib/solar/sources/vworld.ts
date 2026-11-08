import type { PolygonCoords } from '../geo';
import type { Suggestion } from '../types';
import { polygonsOf } from '../geo';
import { getJson, qs, SourceError } from './http';

/**
 * VWorld (국토교통부 공간정보 오픈플랫폼) — 키 하나로 주소 검색 · 지적도 · 건물 · 토지이용계획을 다 본다.
 * 키는 발급 때 적은 서비스 URL 에 묶인다. 서버에서 부를 때는 그 URL 을 domain 으로 같이 보낸다.
 */

export function vworldKey(): { key: string; domain: string | undefined } {
  const k = process.env.VWORLD_KEY;
  if (!k) throw new Error('[VWorld] VWORLD_KEY 없음');
  return { key: k, domain: process.env.VWORLD_DOMAIN };
}

/** VWorld 키가 있는가 — 없으면 부르는 쪽이 「키가 아직 없습니다」로 돌려보낸다 */
export const hasVworld = (): boolean => Boolean(process.env.VWORLD_KEY);

type Status = { status?: string; error?: { code?: string; text?: string } };

function failIfError(r: Status, what: string) {
  if (r.status === 'ERROR') throw new SourceError('VWorld', `${what}: ${r.error?.code ?? ''} ${r.error?.text ?? ''}`.trim());
}

/* ---------------------------------------------------------------- 검색 */

export type SearchHit = {
  id: string | null;
  title: string | null;
  road: string | null;
  parcel: string | null;
  buildingName: string | null;
  lng: number;
  lat: number;
};

type SearchBody = {
  response?: Status & {
    result?: {
      items?: {
        id?: string;
        title?: string;
        address?: { road?: string; parcel?: string; bldnm?: string } | string;
        point?: { x?: string | number; y?: string | number };
      }[];
    };
  };
};

async function search(
  query: string,
  type: 'address' | 'place',
  category?: 'road' | 'parcel',
  size = 5,
): Promise<SearchHit[]> {
  const { key: k, domain } = vworldKey();
  const url = `https://api.vworld.kr/req/search?${qs({
    service: 'search',
    request: 'search',
    version: '2.0',
    crs: 'EPSG:4326',
    size,
    page: 1,
    query,
    type,
    category,
    format: 'json',
    errorformat: 'json',
    key: k,
    domain,
  })}`;
  const body = await getJson<SearchBody>('VWorld 검색', url);
  const r = body.response ?? {};
  failIfError(r, '검색');
  return (r.result?.items ?? []).flatMap((it) => {
    const lng = Number(it.point?.x);
    const lat = Number(it.point?.y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    const addr = typeof it.address === 'object' ? it.address : undefined;
    return [
      {
        id: it.id ?? null,
        title: it.title ?? null,
        road: addr?.road || null,
        parcel: addr?.parcel || (typeof it.address === 'string' ? it.address : null),
        buildingName: addr?.bldnm || (type === 'place' ? it.title ?? null : null),
        lng,
        lat,
      },
    ];
  });
}

/** VWorld 검색을 후보 모양으로 — 카카오 키가 없을 때 쓴다 */
export async function vworldSuggest(query: string): Promise<Suggestion[]> {
  const specific = /\d/.test(query);
  const [road, parcel, place] = await Promise.all([
    search(query, 'address', 'road'),
    specific ? search(query, 'address', 'parcel') : Promise.resolve([]),
    search(query, 'place'),
  ]);
  const asAddr = (h: SearchHit): Suggestion => ({ kind: 'address', name: h.buildingName, road: h.road, parcel: h.parcel, category: null, lat: h.lat, lng: h.lng });
  const asPlace = (h: SearchHit): Suggestion => ({ kind: 'place', name: h.buildingName ?? h.title, road: h.road, parcel: h.parcel, category: null, lat: h.lat, lng: h.lng });
  return [...road.map(asAddr), ...parcel.map(asAddr), ...place.map(asPlace)];
}

/* ------------------------------------------------------------ 2D 데이터 */

export type Feature = { properties: Record<string, unknown>; polygons: PolygonCoords[] };

type DataBody = {
  response?: Status & {
    record?: { total?: string };
    result?: { featureCollection?: { features?: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } }[] } };
  };
};

export async function features(
  data: string,
  filter: { geomFilter?: string; attrFilter?: string; buffer?: number },
  size = 1000,
): Promise<Feature[]> {
  const { key: k, domain } = vworldKey();
  const url = `https://api.vworld.kr/req/data?${qs({
    service: 'data',
    request: 'GetFeature',
    version: '2.0',
    data,
    geomFilter: filter.geomFilter,
    attrFilter: filter.attrFilter,
    buffer: filter.buffer,
    size,
    page: 1,
    crs: 'EPSG:4326',
    geometry: 'true',
    attribute: 'true',
    format: 'json',
    errorformat: 'json',
    key: k,
    domain,
  })}`;
  const body = await getJson<DataBody>(`VWorld ${data}`, url);
  const r = body.response ?? {};
  if (r.status === 'NOT_FOUND') return [];
  failIfError(r, data);
  return (r.result?.featureCollection?.features ?? []).map((f) => ({
    properties: f.properties ?? {},
    polygons: polygonsOf(f.geometry),
  }));
}

/** 좌표가 들어 있는 필지 하나 — 연속지적도 LP_PA_CBND_BUBUN */
export async function parcelAt(lng: number, lat: number): Promise<Feature | null> {
  const fs = await features('LP_PA_CBND_BUBUN', { geomFilter: `POINT(${lng} ${lat})` }, 10);
  return fs[0] ?? null;
}

/** 필지번호로 필지 하나 — AI 지붕 따기가 화면이 보낸 필지번호로 필지 모양을 다시 받는다(화면이 보낸 도형은 믿지 않는다) */
export async function parcelByPnu(pnu: string): Promise<Feature | null> {
  const fs = await features('LP_PA_CBND_BUBUN', { attrFilter: `pnu:=:${pnu}` }, 1);
  return fs[0] ?? null;
}

/** 둘레 필지 — 한전 기록이 없는 번지에서 가장 가까운 기록 필지를 찾을 때 */
export function parcelsIn(bbox: [number, number, number, number]): Promise<Feature[]> {
  return features('LP_PA_CBND_BUBUN', { geomFilter: `BOX(${bbox.join(',')})` });
}

/** 도로명주소 건물(LT_C_SPBD) — 관리번호로 임시 모양을 가른다(lib/buildings markProvisional) */
export function addressBuildingsIn(bbox: [number, number, number, number]): Promise<Feature[]> {
  return features('LT_C_SPBD', { geomFilter: `BOX(${bbox.join(',')})` });
}

/** 건물 — 건축물정보 LT_C_BLDGINFO (건축물대장 속성이 붙은 건물 도형) */
export function buildingsIn(bbox: [number, number, number, number]): Promise<Feature[]> {
  return features('LT_C_BLDGINFO', { geomFilter: `BOX(${bbox.join(',')})` });
}

/* ------------------------------------------------------ 토지이용계획 (NED) */

export type Zone = { name: string; relation: string };

type LandUseBody = {
  landUses?: { field?: { prposAreaDstrcCodeNm?: string; cnflcAtNm?: string }[] } & Status;
};

/** 필지에 걸린 용도지역·지구 전부 — 이름과 「포함·저촉·접함」 */
export async function zonesOf(pnu: string): Promise<Zone[]> {
  const { key: k, domain } = vworldKey();
  const url = `https://api.vworld.kr/ned/data/getLandUseAttr?${qs({
    pnu,
    format: 'json',
    numOfRows: 1000,
    pageNo: 1,
    key: k,
    domain,
  })}`;
  const body = await getJson<LandUseBody & { error?: unknown }>('VWorld 토지이용계획', url);
  const lu = body.landUses;
  if (!lu) throw new SourceError('VWorld 토지이용계획', `응답에 landUses 없음: ${JSON.stringify(body).slice(0, 200)}`);
  const seen = new Set<string>();
  return (lu.field ?? []).flatMap((f) => {
    const name = f.prposAreaDstrcCodeNm?.trim();
    if (!name) return [];
    const relation = f.cnflcAtNm?.trim() ?? '';
    const k2 = `${name}|${relation}`;
    if (seen.has(k2)) return [];
    seen.add(k2);
    return [{ name, relation }];
  });
}

/* ---------------------------------------------------------------- 토지특성 */

/**
 * 토지특성(개별공시지가 조사) — 지형높이(저지·평지·완경사·급경사·고지) · 지형형상 · 도로접면(광대로~세로·맹지) · 이용상황.
 * 지상형의 경사·진입도로를 본다(개발행위허가 기준). 해마다 새로 조사해 올해 것이 아직 없으면 지난해 것을 쓴다.
 */
export type LandTraits = { year: string; height: string | null; shape: string | null; road: string | null; use: string | null };

type TraitsField = { tpgrphHgCodeNm?: string; tpgrphFrmCodeNm?: string; roadSideCodeNm?: string; ladUseSittnNm?: string };
type TraitsBody = { landCharacteristicss?: { field?: TraitsField[] }; landCharacteristics?: { field?: TraitsField[] } };

export async function landTraits(pnu: string, year = new Date().getFullYear()): Promise<LandTraits | null> {
  const { key: k, domain } = vworldKey();
  for (const y of [year, year - 1]) {
    const url = `https://api.vworld.kr/ned/data/getLandCharacteristics?${qs({ pnu, stdrYear: y, format: 'json', numOfRows: 5, pageNo: 1, key: k, domain })}`;
    const body = await getJson<TraitsBody>('VWorld 토지특성', url);
    const f = (body.landCharacteristicss ?? body.landCharacteristics)?.field?.[0];
    if (f)
      return {
        year: String(y),
        height: f.tpgrphHgCodeNm?.trim() || null,
        shape: f.tpgrphFrmCodeNm?.trim() || null,
        road: f.roadSideCodeNm?.trim() || null,
        use: f.ladUseSittnNm?.trim() || null,
      };
  }
  return null;
}

/**
 * 부지 검토를 부르는 주소(/api/solar/check?…) — 화면이 짓고 라우트가 읽는다. 두 쪽이 한 모양을 보게 한 곳에 둔다. [순수]
 * 자동완성에서 고른 후보는 좌표 · 이름 · 주소를 같이 싣는다 — 같은 글자로 다시 찾으면 다른 줄이 첫째로 올 수 있어서다.
 */
import type { Mode, Suggestion } from './types';

export function checkParams(mode: Mode, q: string, picked?: Suggestion): URLSearchParams {
  const params = new URLSearchParams({ q: q.trim(), mode });
  if (picked) {
    params.set('lat', String(picked.lat));
    params.set('lng', String(picked.lng));
    if (picked.road) params.set('road', picked.road);
    if (picked.parcel) params.set('parcel', picked.parcel);
    if (picked.name) params.set('name', picked.name);
    params.set('kind', picked.kind);
  }
  return params;
}

export const modeOf = (params: URLSearchParams): Mode => (params.get('mode') === 'ground' ? 'ground' : 'roof');

/** 실어 온 후보 — 좌표가 우리나라 안일 때만(아니면 글자로 다시 찾는다) */
export function pickedOf(params: URLSearchParams): Suggestion | null {
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!(Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132)) return null;
  return {
    kind: params.get('kind') === 'place' ? 'place' : 'address',
    name: params.get('name') || null,
    road: params.get('road') || null,
    parcel: params.get('parcel') || null,
    category: null,
    lat,
    lng,
  };
}

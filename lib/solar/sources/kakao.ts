import type { Suggestion } from '../types';
import { getJson, qs } from './http';

/**
 * 카카오 로컬 — 검색창 후보. 상호·체인점 이름(「폭스존」)은 VWorld 장소 검색에 거의 없어서 여기서 찾는다.
 * 키: developers.kakao.com 앱의 REST API 키 + 그 앱에서 「카카오맵」 사용 설정 ON.
 * 하루 10만 회 무료.
 */
const BASE = 'https://dapi.kakao.com/v2/local/search';

function auth(): Record<string, string> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) throw new Error('[카카오] KAKAO_REST_KEY 없음');
  return { Authorization: `KakaoAK ${key}` };
}

export const hasKakao = () => Boolean(process.env.KAKAO_REST_KEY);

type KeywordDoc = {
  place_name?: string;
  category_name?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
};

type AddressDoc = {
  address_name?: string;
  /** REGION(동네) · ROAD(길 이름만) · REGION_ADDR(지번) · ROAD_ADDR(도로명) */
  address_type?: string;
  x?: string;
  y?: string;
  address?: { address_name?: string } | null;
  road_address?: { address_name?: string; building_name?: string } | null;
};

const lastCategory = (c?: string) => c?.split('>').pop()?.trim() || null;

export function placesOf(body: unknown): Suggestion[] {
  const docs = (body as { documents?: KeywordDoc[] })?.documents ?? [];
  return docs.flatMap((d) => {
    const lng = Number(d.x);
    const lat = Number(d.y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [
      {
        kind: 'place' as const,
        name: d.place_name ?? null,
        road: d.road_address_name || null,
        parcel: d.address_name || null,
        category: lastCategory(d.category_name),
        lat,
        lng,
      },
    ];
  });
}

/** 동네·길 이름만 걸린 줄(REGION·ROAD)은 땅 하나가 아니라서 뺀다. */
export function addressesOf(body: unknown): Suggestion[] {
  const docs = (body as { documents?: AddressDoc[] })?.documents ?? [];
  return docs.flatMap((d) => {
    if (d.address_type !== 'REGION_ADDR' && d.address_type !== 'ROAD_ADDR') return [];
    const lng = Number(d.x);
    const lat = Number(d.y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [
      {
        kind: 'address' as const,
        name: d.road_address?.building_name || null,
        road: d.road_address?.address_name || null,
        parcel: d.address?.address_name || null,
        category: null,
        lat,
        lng,
      },
    ];
  });
}

export async function kakaoPlaces(query: string, size = 10): Promise<Suggestion[]> {
  return placesOf(await getJson('카카오 장소', `${BASE}/keyword.json?${qs({ query, size })}`, 5000, auth()));
}

export async function kakaoAddresses(query: string, size = 10): Promise<Suggestion[]> {
  return addressesOf(
    await getJson('카카오 주소', `${BASE}/address.json?${qs({ query, size, analyze_type: 'similar' })}`, 5000, auth()),
  );
}

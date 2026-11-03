import { hasKakao, kakaoAddresses, kakaoPlaces } from './sources/kakao';
import { vworldSuggest } from './sources/vworld';
import type { Suggestion } from './types';

export type SuggestResult = { items: Suggestion[]; error: string | null };

/**
 * 검색창 후보 — 주소 먼저, 장소 다음.
 * 카카오 키가 있으면 카카오(상호까지 찾는다), 없으면 VWorld. 둘 다 없으면 이유를 돌려준다 —
 * 「후보 0건」으로 삼키면 키가 없는 것과 정말 없는 것이 같아 보인다.
 */
export async function suggest(query: string, size = 10): Promise<SuggestResult> {
  if (!hasKakao() && !process.env.VWORLD_KEY) {
    return { items: [], error: '검색 키가 없어 후보를 띄울 수 없습니다 (KAKAO_REST_KEY 또는 VWORLD_KEY)' };
  }
  const tasks: Promise<Suggestion[]>[] = hasKakao()
    ? [kakaoAddresses(query), kakaoPlaces(query)]
    : [vworldSuggest(query)];
  const settled = await Promise.allSettled(tasks);
  const errors = settled.flatMap((s) => (s.status === 'rejected' ? [String(s.reason?.message ?? s.reason)] : []));
  const all = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  if (errors.length === settled.length) return { items: [], error: errors.join(' · ') };
  return { items: dedupe(all).slice(0, size), error: null };
}

/** 같은 줄 두 번 — 주소는 도로명(없으면 지번)으로, 장소는 이름+주소로 가른다. */
export function dedupe(items: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return items.filter((s) => {
    const addr = s.road || s.parcel || `${s.lng},${s.lat}`;
    const k = s.kind === 'address' ? `a|${addr}` : `p|${s.name}|${addr}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 후보를 고르지 않고 「검토하기」를 눌렀을 때 — 글자로 땅 하나를 정한다.
 * 장소 이름이 여러 곳에 걸리면(「폭스존」 지점 여럿) 아무거나 고르지 않고 목록에서 고르라고 돌려보낸다.
 */
export async function resolveTyped(query: string): Promise<{ hit: Suggestion | null; ambiguous: number }> {
  const { items, error } = await suggest(query);
  if (error) throw new Error(error);
  const addresses = items.filter((s) => s.kind === 'address');
  if (addresses.length > 0) return { hit: addresses[0], ambiguous: 0 };
  const places = items.filter((s) => s.kind === 'place');
  const spots = new Set(places.map((p) => p.road || p.parcel));
  if (spots.size > 1) return { hit: null, ambiguous: spots.size };
  return { hit: places[0] ?? null, ambiguous: 0 };
}

/**
 * 지번 주소 → 그 필지 안의 점. 장소 후보의 표시점 대신 필지를 잡을 때 쓴다(카카오 주소 검색의 지번 좌표는 필지 안이다).
 * 못 찾거나 카카오 키가 없으면 null — 부르는 쪽이 표시점으로 돌아간다.
 */
export async function pointOfParcel(parcel: string): Promise<{ lat: number; lng: number } | null> {
  if (!hasKakao()) return null;
  try {
    const hit = (await kakaoAddresses(parcel, 1))[0];
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  } catch (err) {
    console.error('[source] 지번 좌표', parcel, err instanceof Error ? err.message : err);
    return null;
  }
}

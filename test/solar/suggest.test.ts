import { afterEach, describe, expect, it, vi } from 'vitest';
import { addressesOf, placesOf } from '@/lib/solar/sources/kakao';
import { dedupe, resolveTyped } from '@/lib/solar/suggest';

describe('카카오 응답 → 후보', () => {
  it('장소 — 이름·도로명·지번·분류 마지막 칸', () => {
    const [p] = placesOf({
      documents: [
        { place_name: '폭스존 광주점', category_name: '가정,생활 > 생활용품', road_address_name: '광주 광산구 앰코로 35', address_name: '광주 광산구 쌍암동 688-4', x: '126.84', y: '35.21' },
      ],
    });
    expect(p).toEqual({ kind: 'place', name: '폭스존 광주점', road: '광주 광산구 앰코로 35', parcel: '광주 광산구 쌍암동 688-4', category: '생활용품', lat: 35.21, lng: 126.84 });
  });
  it('주소 — 동네·길 이름만 걸린 줄은 뺀다', () => {
    const out = addressesOf({
      documents: [
        { address_name: '충남 천안시 동남구', address_type: 'REGION', x: '127', y: '36' },
        { address_name: '충남 천안시 동남구 풍세로 706', address_type: 'ROAD_ADDR', x: '127.13', y: '36.77', address: { address_name: '충남 천안시 동남구 구룡동 564-27' }, road_address: { address_name: '충남 천안시 동남구 풍세로 706', building_name: '' } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'address', road: '충남 천안시 동남구 풍세로 706', parcel: '충남 천안시 동남구 구룡동 564-27', name: null });
  });
  it('좌표 없는 줄은 버린다', () => expect(placesOf({ documents: [{ place_name: 'x' }] })).toEqual([]));
  it('모양이 다르면 빈 목록', () => expect(placesOf({ errorType: 'x' })).toEqual([]));
});

describe('dedupe', () => {
  const base = { category: null, lat: 1, lng: 1 };
  it('같은 도로명 주소는 한 줄 · 같은 건물의 다른 가게는 남는다', () => {
    const out = dedupe([
      { ...base, kind: 'address', name: null, road: 'A로 1', parcel: 'a 1' },
      { ...base, kind: 'address', name: null, road: 'A로 1', parcel: 'a 1' },
      { ...base, kind: 'place', name: '폭스존', road: 'A로 1', parcel: 'a 1' },
      { ...base, kind: 'place', name: '분식집', road: 'A로 1', parcel: 'a 1' },
    ]);
    expect(out.map((s) => s.name ?? s.road)).toEqual(['A로 1', '폭스존', '분식집']);
  });
});


describe('resolveTyped — 고르지 않고 검토를 눌렀을 때', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  /** 카카오 두 API 의 응답을 흉내 낸다 */
  function kakao(places: object[], addresses: object[] = []) {
    vi.stubEnv('KAKAO_REST_KEY', 'test');
    vi.stubGlobal('fetch', async (url: string) => {
      const body = url.includes('/keyword.json') ? { documents: places } : { documents: addresses };
      return new Response(JSON.stringify(body), { status: 200 });
    });
  }
  const shop = (name: string, road: string) => ({ place_name: name, road_address_name: road, address_name: road, x: '127', y: '37' });

  it('지점이 여러 곳이면 고르지 않고 몇 곳인지 돌려준다', async () => {
    kakao([shop('폭스존 광주점', '광주 앰코로 35'), shop('폭스존 대구점', '대구 동성로 1'), shop('폭스존 부산점', '부산 서면로 2')]);
    expect(await resolveTyped('폭스존')).toEqual({ hit: null, ambiguous: 3 });
  });
  it('한 곳이면 그 곳', async () => {
    kakao([shop('폭스존 광주점', '광주 앰코로 35')]);
    expect((await resolveTyped('폭스존 광주점')).hit?.name).toBe('폭스존 광주점');
  });
  it('주소가 걸리면 주소가 먼저', async () => {
    kakao([shop('가게', '다른 곳 1')], [
      { address_type: 'ROAD_ADDR', x: '127.1', y: '36.7', road_address: { address_name: '천안 풍세로 706' }, address: { address_name: '구룡동 564-27' } },
    ]);
    expect((await resolveTyped('풍세로 706')).hit?.road).toBe('천안 풍세로 706');
  });
  it('키가 없으면 이유를 던진다 — 「못 찾음」으로 바꾸지 않는다', async () => {
    vi.stubEnv('KAKAO_REST_KEY', '');
    vi.stubEnv('VWORLD_KEY', '');
    await expect(resolveTyped('폭스존')).rejects.toThrow(/검색 키가 없어/);
  });
});

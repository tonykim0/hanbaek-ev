import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PolygonCoords } from '@/lib/solar/geo';
import { gridNear } from '@/lib/solar/grid';
import { kepcoCodes } from '@/lib/solar/sources/kepco';

const codes = (sido: string, sigungu: string) => kepcoCodes(sido, sigungu).map((c) => c.sido + c.sigungu);

describe('kepcoCodes — 한전 자료는 옛 코드로 나오는 곳이 있다', () => {
  it('전남광주통합특별시는 옛 광주·전남 코드를 먼저', () => {
    expect(codes('12', '330')).toEqual(['29200', '12330']); // 광산구
    expect(codes('12', '190')).toEqual(['46230', '12190']); // 광양시
  });
  it('전북특별자치도 52 → 45 먼저, 구는 끝에 시 코드', () => expect(codes('52', '111')).toEqual(['45111', '52111', '45110', '52110']));
  it('화성시 새 구(41595 병점구)는 옛 화성시 41590 먼저', () => expect(codes('41', '595')).toEqual(['41590', '41595']));
  it('부천 소사구(41194)는 부천시(41190)로도 — 한전이 구 코드를 401 로 거절', () => expect(codes('41', '194')).toEqual(['41194', '41190']));
  it('특별·광역시 구는 그 코드 하나', () => {
    expect(codes('11', '680')).toEqual(['11680']);
    expect(codes('28', '177')).toEqual(['28177']);
  });
  it('구 없는 시군은 그 코드 하나', () => expect(codes('44', '200')).toEqual(['44200']));
});

/* 한전·VWorld 를 주소로 흉내 낸다 — 한전 열쇠는 「시도시군구/번지(없으면 읍면동)」 */
const sq = (x: number, y: number, s = 0.0003): PolygonCoords => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
const parcel = (pnu: string, addr: string, x: number) => ({ properties: { pnu, addr }, geometry: { type: 'Polygon', coordinates: sq(x, 36.77) } });
const OWN = '4413112000105640027';
const NEAR = parcel('4413112000105640028', '충청남도 천안시 동남구 구룡동 564-28', 127.1405); // 동쪽으로 틈 약 18m
const FAR = parcel('4413112000105640030', '충청남도 천안시 동남구 구룡동 564-30', 127.1415); // 틈 약 107m
const line = (...dl: string[]) => ({ data: dl.map((dlNm) => ({ substNm: '장재', mtrNo: '1', dlNm, vol1: 177185, vol2: 35820, vol3: 12975 })) });

/** @returns 한전에 물은 열쇠들(차례대로) */
function stub(kepco: Record<string, unknown>): string[] {
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const u = new URL(String(input));
    if (u.hostname === 'api.vworld.kr')
      return new Response(JSON.stringify({ response: { status: 'OK', result: { featureCollection: { features: [FAR, NEAR, parcel(OWN, '자기 자신', 127.14)] } } } }));
    const k = `${u.searchParams.get('metroCd')}${u.searchParams.get('cityCd')}/${u.searchParams.get('addrJibun') ?? u.searchParams.get('addrLidong')}`;
    asked.push(k);
    const body = kepco[k];
    return body ? new Response(JSON.stringify(body)) : new Response('{"errCd":"404","errMsg":"NotFound"}', { status: 404 });
  });
  return asked;
}

describe('gridNear', () => {
  beforeEach(() => {
    vi.stubEnv('KEPCO_KEY', 'k'.repeat(40));
    vi.stubEnv('VWORLD_KEY', 'v');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const own = [sq(127.14, 36.77)];
  const ownAddr = '충청남도 천안시 동남구 구룡동 564-27';

  it('그 번지 기록이 있으면 그것 — 동 전체를 먼저 물어 자료 코드를 정한다', async () => {
    const asked = stub({ '44131/구룡동': line('자기', '공원'), '44131/564-27': line('자기') });
    const r = await gridNear(OWN, ownAddr, own);
    expect(r.via).toBeNull();
    expect(r.rows[0].feeder).toBe('자기');
    expect(asked).toEqual(['44131/구룡동', '44131/564-27']);
  });
  it('없으면 가장 가까운 기록 필지 — 자기 자신은 다시 묻지 않는다', async () => {
    stub({ '44131/구룡동': line('가까운', '먼'), '44131/564-28': line('가까운'), '44131/564-30': line('먼') });
    const r = await gridNear(OWN, ownAddr, own);
    expect(r.rows[0].feeder).toBe('가까운');
    expect(r.via).toMatchObject({ kind: 'neighbor', address: NEAR.properties.addr });
    expect((r.via as { distanceM: number }).distanceM).toBeGreaterThan(10);
    expect((r.via as { distanceM: number }).distanceM).toBeLessThan(30);
  });
  it('둘레에도 없으면 같은 읍면동 전체', async () => {
    stub({ '44131/구룡동': line('광덕', '공원') });
    const r = await gridNear(OWN, ownAddr, own);
    expect(r.via).toEqual({ kind: 'dong', dong: '구룡동' });
    expect(r.rows.map((x) => x.feeder)).toEqual(['광덕', '공원']);
  });
  it('동네에 기록이 하나도 없으면 같은 동의 번지는 묻지 않는다', async () => {
    const asked = stub({});
    expect(await gridNear(OWN, ownAddr, own)).toEqual({ rows: [], via: null });
    // 동 전체 두 코드(천안 동남구 · 천안시)와 헛 404 대비 한 번 더만 묻고 끝 — 예전에는 번지·둘레 8곳·동을 다 물었다
    expect(asked).toEqual(['44131/구룡동', '44130/구룡동', '44131/구룡동']);
  });
  it('동 전체가 한 번 헛 404 를 줘도 다시 물어 찾는다', async () => {
    let first = true;
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const u = new URL(String(input));
      if (u.hostname === 'api.vworld.kr') return new Response(JSON.stringify({ response: { status: 'OK', result: { featureCollection: { features: [] } } } }));
      asked.push(`${u.searchParams.get('cityCd')}/${u.searchParams.get('addrJibun') ?? u.searchParams.get('addrLidong')}`);
      // 자료는 천안 동남구(131)에만 있다 — 첫 물음만 헛 404
      if (first || u.searchParams.get('cityCd') !== '131') {
        first = false;
        return new Response('{"errCd":"404"}', { status: 404 });
      }
      return new Response(JSON.stringify(line('자기')));
    });
    const r = await gridNear(OWN, ownAddr, own);
    expect(r.rows[0].feeder).toBe('자기');
    expect(asked).toEqual(['131/구룡동', '130/구룡동', '131/구룡동', '131/564-27']);
  });
  it('한전이 빈 응답을 주면 한 번 더 묻는다 (몰린 요청)', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => (++calls === 1 ? new Response('') : new Response(JSON.stringify(line('자기')))));
    const r = await gridNear(OWN, ownAddr, own);
    expect(calls).toBe(3); // 동(빈 응답 → 다시) · 번지
    expect(r.rows[0].feeder).toBe('자기');
  });
  it('전남광주 광산구 12/330 → 옛 29/200 에서 찾는다', async () => {
    stub({ '29200/쌍암동': line('호수'), '29200/688-4': line('호수') });
    const r = await gridNear('1233011600106880004', '전남광주통합특별시 광산구 쌍암동 688-4', own);
    expect(r).toMatchObject({ via: null, rows: [{ feeder: '호수' }] });
  });
  it('화성 병점구 41595 → 옛 41590 에서 찾고, 새 코드로는 묻지 않는다', async () => {
    const asked = stub({ '41590/안녕동': line('병점'), '41590/180-222': line('병점') });
    const r = await gridNear('4159510900101800222', '경기도 화성시 병점구 안녕동 180-222', own);
    expect(r).toMatchObject({ via: null, rows: [{ feeder: '병점' }] });
    expect(asked.some((k) => k.startsWith('41595'))).toBe(false);
  });
});

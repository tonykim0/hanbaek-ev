import { describe, expect, it } from 'vitest';
import { areaOf, containsPoint, distanceBetween, expandBbox, type PolygonCoords } from '@/lib/solar/geo';
import { dongRiOf, jibunOf, parsePnu } from '@/lib/solar/pnu';
import { rowsOf } from '@/lib/solar/sources/kepco';

/** 위도 37° 근처 한 변 100m 정사각형 */
const dLat = 100 / 111_195;
const dLng = dLat / Math.cos((37 * Math.PI) / 180);
const square = (x0: number, y0: number): PolygonCoords[] => [
  [[[x0, y0], [x0 + dLng, y0], [x0 + dLng, y0 + dLat], [x0, y0 + dLat], [x0, y0]]],
];

describe('geo', () => {
  const a = square(127, 37);
  it('면적 100×100 = 10,000㎡', () => expect(areaOf(a)).toBeCloseTo(10_000, -1));
  it('300m 떨어진 정사각형까지 거리 ≈ 200m', () => {
    expect(distanceBetween(a, square(127 + 3 * dLng, 37))).toBeCloseTo(200, 0);
  });
  it('겹치면 0', () => expect(distanceBetween(a, square(127 + dLng / 2, 37))).toBe(0));
  it('점 포함', () => {
    expect(containsPoint(a, [127 + dLng / 2, 37 + dLat / 2])).toBe(true);
    expect(containsPoint(a, [127 + 2 * dLng, 37])).toBe(false);
  });
  it('bbox 를 200m 넓힌다', () => {
    const b = expandBbox([127, 37, 127, 37], 200);
    expect((b[3] - b[1]) / 2).toBeCloseTo(2 * dLat, 6);
  });
});

describe('pnu', () => {
  it('19자리를 가른다 — 한전 metroCd·cityCd 가 그 앞 5자리', () => {
    const p = parsePnu('4413131023101420001')!;
    expect(p).toMatchObject({ sido: '44', sigungu: '131', sigunguCd: '44131', mountain: false, bun: 142, ji: 1 });
    expect(jibunOf(p)).toBe('142-1');
  });
  it('산 필지', () => expect(jibunOf(parsePnu('4413131023200120000')!)).toBe('산 12'));
  it('형식이 틀리면 null', () => expect(parsePnu('123')).toBeNull());
  it('읍면동·리 이름', () => {
    expect(dongRiOf('충청남도 천안시 동남구 광덕면 광덕리 142-1')).toEqual({ dong: '광덕면', ri: '광덕리' });
    expect(dongRiOf('서울특별시 강남구 역삼동 737')).toEqual({ dong: '역삼동', ri: null });
  });
});

describe('한전 응답', () => {
  it('셋 중 가장 작은 여유가 그 선로의 여유 · 하나라도 비면 모름', () => {
    const rows = rowsOf({
      data: [
        { substNm: '풍세', dlNm: '공원', vol1: '30000', vol2: '8,000', vol3: '1200' },
        { substNm: '풍세', dlNm: '산단', vol1: '', vol2: '', vol3: '' },
      ],
    });
    expect(rows.map((r) => [r.substation, r.feeder, r.spareKw])).toEqual([
      ['풍세', '공원', 1200],
      ['풍세', '산단', null],
    ]);
  });
  it('실제 응답 모양 — 숫자·글자가 섞여 온다 (천안 장재 #1 광덕)', () => {
    const [r] = rowsOf({
      data: [{ substCd: 'S528', substNm: '장재', jsSubstPwr: 0, substPwr: '22815', mtrNo: '1', mtrPwr: '14180', dlCd: '09', dlNm: '광덕', dlPwr: 25, vol1: 177185, vol2: 35820, vol3: 12975 }],
    });
    expect(r).toEqual({
      substation: '장재',
      transformer: '1',
      feeder: '광덕',
      spareKw: 12975,
      // 접수 + 여유 = 한도 — SolarCheck 표의 「접속 200,000 · 50,000 · 13,000」과 같다
      layers: {
        substation: { spareKw: 177185, acceptedKw: 22815, limitKw: 200000 },
        transformer: { spareKw: 35820, acceptedKw: 14180, limitKw: 50000 },
        feeder: { spareKw: 12975, acceptedKw: 25, limitKw: 13000 },
      },
    });
  });
  it('여유 0 이면 한도를 모른다 — 접수가 한도를 넘어 있다 (풍세 #2 보성 13,863kW)', () => {
    const [r] = rowsOf({ data: [{ substNm: '풍세', mtrNo: '2', dlNm: '보성', substPwr: '45647', mtrPwr: '16310', dlPwr: 13863, vol1: 104353, vol2: 33690, vol3: 0 }] });
    expect(r.layers.feeder).toEqual({ spareKw: 0, acceptedKw: 13863, limitKw: null });
    expect(r.spareKw).toBe(0);
  });
  it('모양이 다르면 빈 목록', () => expect(rowsOf({ error: 'x' })).toEqual([]));
});

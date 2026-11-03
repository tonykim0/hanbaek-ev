import { describe, expect, it } from 'vitest';
import { areaOf, coveredShare, unprojector, type LngLat, type PolygonCoords } from '@/lib/solar/geo';
import { dropNested } from '@/lib/solar/roof-merge';

const toLL = unprojector([127.1, 36.7]);
/** 미터로 적은 직사각형(왼쪽 아래 x·y, 가로 w, 세로 h) → 경위도 폴리곤 */
const box = (x: number, y: number, w: number, h: number): PolygonCoords[] => [
  [
    (
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ] as [number, number][]
    ).map(toLL) as LngLat[],
  ],
];

describe('coveredShare — 넓이 중 덮인 몫', () => {
  it('같은 것은 1, 떨어진 것은 0', () => {
    expect(coveredShare(box(0, 0, 40, 20), [box(0, 0, 40, 20)])).toBeCloseTo(1, 5);
    expect(coveredShare(box(0, 0, 40, 20), [box(100, 0, 40, 20)])).toBe(0);
  });
  it('절반 겹치면 약 0.5', () => expect(coveredShare(box(0, 0, 40, 20), [box(20, 0, 40, 20)])).toBeCloseTo(0.5, 1));
  it('여럿이 함께 덮은 몫', () => expect(coveredShare(box(0, 0, 40, 20), [box(0, 0, 20, 20), box(20, 0, 20, 20)])).toBeCloseTo(1, 5));
});

describe('dropNested — AI 가 겹쳐 딴 지붕', () => {
  const roof = (x: number, y: number, w: number, h: number) => ({ polygons: box(x, y, w, h), area: areaOf(box(x, y, w, h)) });
  it('큰 지붕 안의 작은 지붕은 뺀다', () => {
    const big = roof(0, 0, 60, 30);
    const inner = roof(10, 10, 20, 10);
    expect(dropNested([inner, big])).toEqual([big]);
  });
  it('나란한 두 지붕은 둘 다 둔다 — 받은 차례 그대로', () => {
    const a = roof(0, 0, 30, 20);
    const b = roof(32, 0, 50, 20);
    expect(dropNested([a, b])).toEqual([a, b]);
  });
});

import { describe, expect, it } from 'vitest';
import { MODULE } from '@/lib/solar/assumptions';
import { boxArea, boxCorners, boxFromCorners, carportPanels, kwOfArea, moveBy, resizeCorner, rotateToward, type Box } from '@/lib/solar/boxes';
import { projector, unprojector, type LngLat } from '@/lib/solar/geo';

const O: LngLat = [127.1, 36.7];
const toLL = unprojector(O);
const toM = projector(O);
const deg = (d: number) => (d * Math.PI) / 180;
const close = (a: LngLat, b: LngLat) => {
  const [ax, ay] = toM(a);
  const [bx, by] = toM(b);
  return Math.hypot(ax - bx, ay - by);
};
/** 가운데 (x, y)m · 폭 w · 높이 h · 기울기 d° */
const box = (x: number, y: number, w: number, h: number, d = 0): Box => ({ id: 't', center: toLL([x, y]), w, h, angle: deg(d) });

describe('boxFromCorners — 두 꼭짓점과 기울기', () => {
  it('반듯한 네모: (0,0)–(40,10) → 40 × 10m, 가운데 (20,5)', () => {
    const b = boxFromCorners('a', toLL([0, 0]), toLL([40, 10]), 0);
    expect(b.w).toBeCloseTo(40, 3);
    expect(b.h).toBeCloseTo(10, 3);
    expect(close(b.center, toLL([20, 5]))).toBeLessThan(0.01);
  });
  it('30° 돌린 네모의 마주 보는 꼭짓점으로 다시 만들면 같은 크기', () => {
    const b = box(10, 10, 50, 5, 30);
    const c = boxCorners(b);
    const again = boxFromCorners('a', c[0], c[2], deg(30));
    expect(again.w).toBeCloseTo(50, 2);
    expect(again.h).toBeCloseTo(5, 2);
    expect(close(again.center, b.center)).toBeLessThan(0.01);
  });
  it('넓이는 폭 × 높이', () => expect(boxArea(box(0, 0, 50, 5, 17))).toBe(250));
});

describe('손잡이 — 크기 · 회전 · 이동', () => {
  it('모서리를 끌면 맞은편 모서리는 그대로, 기울기도 그대로', () => {
    const b = box(0, 0, 20, 10, 30);
    const fixed = boxCorners(b)[0];
    const moved = resizeCorner(b, 2, unprojector(b.center)([25, 25]));
    expect(close(boxCorners(moved)[0], fixed)).toBeLessThan(0.01);
    expect(moved.angle).toBeCloseTo(deg(30), 6);
  });
  it('1m 보다 작아지게 끌면 그대로 둔다', () => {
    const b = box(0, 0, 20, 10);
    expect(resizeCorner(b, 2, boxCorners(b)[0])).toBe(b);
  });
  it('위로(북) 끌면 0°, 동쪽으로 끌면 −90° — 2° 안이면 붙는다', () => {
    const b = box(0, 0, 20, 10, 40);
    expect(rotateToward(b, toLL([0.5, 30])).angle).toBeCloseTo(0, 6);
    expect(rotateToward(b, toLL([30, 0])).angle).toBeCloseTo(deg(-90), 6);
    expect(rotateToward(b, toLL([30, 30])).angle).toBeCloseTo(deg(-45), 6);
  });
  it('가운데를 끌면 끈 만큼 옮긴다', () => {
    const b = box(0, 0, 20, 10, 10);
    const m = moveBy(b, toLL([3, 3]), toLL([13, -2]));
    expect(close(m.center, toLL([10, -5]))).toBeLessThan(0.01);
  });
});

describe('주차장 캐노피 — 네모를 캐노피 지붕으로 보고 645W 를 빈틈없이', () => {
  it('주차면 20면 한 줄(50 × 5m): 43장 × 2줄 = 86장 · 1면에 약 2.8kW · 넓이의 93%', () => {
    const l = carportPanels(box(0, 0, 50, 5), O[1]);
    expect(l.count).toBe(86);
    expect(l.kw / 20).toBeCloseTo(2.77, 2);
    expect((l.count * MODULE.lengthM * MODULE.widthM) / 250).toBeCloseTo(0.93, 2);
  });
  it('돌려 놓아도 같은 장수 — 네모의 변을 따라 깐다', () =>
    expect(carportPanels(box(0, 0, 50, 5, 33), O[1]).count).toBe(carportPanels(box(0, 0, 50, 5), O[1]).count));
  it('땅에 세움은 넓이 ÷ 13㎡ — 5,000㎡ 는 384.6kW', () => expect(kwOfArea(5000)).toBe(384.6));
});

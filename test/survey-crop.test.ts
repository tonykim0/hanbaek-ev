import { describe, expect, it } from 'vitest';
import { crop } from '@/lib/survey/xlsx-kit';
import { collageTiles, type Tile } from '@/lib/survey/fit';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('실사보고서 사진을 칸 비율로 자르는 창', () => {
  it('비율이 같으면 자르지 않는다', () => {
    const w = crop(4 / 3, 4 / 3);
    for (const v of [w.l, w.t, w.r, w.b]) near(v, 0);
  });

  it('칸보다 길쭉한 사진은 위아래를 가운데로 자른다', () => {
    const w = crop(4 / 3, 2); // 남는 높이 2/3
    near(w.l, 0); near(w.r, 0);
    near(w.t, 1 / 6); near(w.b, 1 / 6);
  });

  it('표시가 아래쪽에 있으면 창을 내려 표시를 남긴다', () => {
    const w = crop(4 / 3, 2, { x0: 0.2, y0: 0.8, x1: 0.8, y1: 0.95 });
    near(w.b, 0.05); // 창 아래 끝 = 표시 아래 끝 0.95
    near(w.t, 1 - 2 / 3 - 0.05);
  });

  it('표시가 창보다 넓게 퍼졌으면 표시의 가운데에 맞추고, 사진 밖으로 나가지 않는다', () => {
    const w = crop(3 / 4, 2, { x0: 0, y0: 0.0, x1: 1, y1: 1 }); // 세로 사진, 창 높이 3/8
    near(w.t, 0.5 - 3 / 16);
    const edge = crop(3 / 4, 2, { x0: 0, y0: 0.9, x1: 1, y1: 1.2 });
    near(edge.b, 0);
  });

  it('칸보다 납작한 사진은 양옆을 자른다', () => {
    const w = crop(2, 1); // 남는 폭 1/2
    near(w.t, 0); near(w.b, 0);
    near(w.l, 0.25); near(w.r, 0.25);
  });
});

describe('한 칸에 사진 여러 장 — 바둑판', () => {
  const inside = (ts: Tile[], W: number, H: number) => {
    for (const t of ts) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(W + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(H + 1e-6);
    }
  };

  it('한 장은 칸 전체다', () => {
    expect(collageTiles(1, 1600, 1200)).toEqual([{ x: 0, y: 0, w: 1600, h: 1200 }]);
  });

  it('정사각 칸에 두 장은 위아래로 쌓는다', () => {
    const ts = collageTiles(2, 1600, 1600);
    expect(ts).toHaveLength(2);
    expect(ts[0].x).toBe(0); expect(ts[1].x).toBe(0);
    expect(ts[1].y).toBeGreaterThan(ts[0].y);
    inside(ts, 1600, 1600);
  });

  it('정사각 칸에 세 장은 위 한 장 + 아래 두 장', () => {
    const ts = collageTiles(3, 1600, 1600);
    expect(ts).toHaveLength(3);
    expect(ts[0].w).toBe(1600);
    expect(ts[1].y).toBe(ts[2].y);
    expect(ts[1].y).toBeGreaterThan(ts[0].y);
    inside(ts, 1600, 1600);
  });

  it('넓은 칸에 두 장은 좌우로 둔다', () => {
    const ts = collageTiles(2, 2400, 900);
    expect(ts[0].y).toBe(0); expect(ts[1].y).toBe(0);
    expect(ts[1].x).toBeGreaterThan(ts[0].x);
  });

  it('칸끼리 겹치지 않는다', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const ts = collageTiles(n, 1600, 1400);
      expect(ts).toHaveLength(n);
      inside(ts, 1600, 1400);
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
        const a = ts[i], b = ts[j];
        const overlap = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
        expect(overlap).toBe(false);
      }
    }
  });
});

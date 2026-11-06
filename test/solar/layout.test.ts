import { describe, expect, it } from 'vitest';
import { unprojector, type LngLat, type PolygonCoords } from '@/lib/solar/geo';
import { MODULE } from '@/lib/solar/assumptions';
import { cutLayout, layoutRoof, mainAxis, rowPitch, SPEC, winterShadowPerHeight } from '@/lib/solar/layout';

const ORIGIN: LngLat = [127.14, 36.8];
const toLL = unprojector(ORIGIN);
/** 미터로 적은 고리 → 경위도 폴리곤 */
const poly = (...rings: [number, number][][]): PolygonCoords => rings.map((r) => [...r, r[0]].map(toLL));
/** 가로 w · 세로 h 직사각형을 a 도 돌린 것 */
const rect = (w: number, h: number, deg = 0): [number, number][] => {
  const a = (deg * Math.PI) / 180;
  return (
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ] as [number, number][]
  ).map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
};

/** 미터 평면으로 — 경위도 꼭짓점을 ORIGIN 기준 동·북 미터로 */
const toM = (p: LngLat): [number, number] => {
  const R = 6_371_008.8;
  return [
    (((p[0] - ORIGIN[0]) * Math.PI) / 180) * R * Math.cos((ORIGIN[1] * Math.PI) / 180),
    (((p[1] - ORIGIN[1]) * Math.PI) / 180) * R,
  ];
};

describe('그림자 간격', () => {
  it('천안 위도(36.8°) 동지 오전 9시 — 높이 1 에 그림자 약 2.5', () => expect(winterShadowPerHeight(36.8, 3)).toBeCloseTo(2.51, 1));
  it('기본은 오전 10시 — 약 2.0', () => expect(winterShadowPerHeight(36.8)).toBeCloseTo(2.0, 1));
  it('위로 갈수록 그림자가 길다', () => expect(winterShadowPerHeight(38)).toBeGreaterThan(winterShadowPerHeight(34)));
  it('부착형은 모듈 길이 + 틈, 경사고정형(12°)은 그림자 몫이 더해진다', () => {
    expect(rowPitch('flush', 36.8)).toBeCloseTo(2.402, 3);
    expect(rowPitch('tilted', 36.8)).toBeCloseTo(3.32, 2);
  });
  it('정연코퍼레이션(충주 · 북위 37.1° · 12°) 실제 설계의 줄 간격 약 3.4m — 10~14시 기준은 3.33m, 9~15시면 3.6m', () => {
    expect(rowPitch('tilted', 37.1)).toBeCloseTo(3.33, 2);
    expect(rowPitch('tilted', 37.1, { ...SPEC, shadeHours: 3 })).toBeCloseTo(3.6, 1);
  });
  it('태양 고도로 정하면(사업자 설계 기준) 위도와 상관없이 L·cos(경사) + L·sin(경사) / tan(고도)', () => {
    const spec = { ...SPEC, tiltDeg: 18, shadeAngleDeg: 21 };
    const L = MODULE.lengthM;
    const want = L * Math.cos((18 * Math.PI) / 180) + (L * Math.sin((18 * Math.PI) / 180)) / Math.tan((21 * Math.PI) / 180);
    expect(rowPitch('tilted', 37.1, spec)).toBeCloseTo(want, 6);
    expect(rowPitch('tilted', 33.5, spec)).toBeCloseTo(want, 6);
    expect(want).toBeGreaterThan(rowPitch('tilted', 37.1));
  });
});

describe('mainAxis', () => {
  it('돌린 직사각형의 방향과 변 길이', () => {
    const a = mainAxis(rect(50, 20, 30));
    expect(Math.max(a.along, a.across)).toBeCloseTo(50, 3);
    expect(Math.min(a.along, a.across)).toBeCloseTo(20, 3);
  });
});

describe('layoutRoof — 50m × 20m 지붕, 가장자리 1m', () => {
  it('부착형: 한 줄 40장(20장 · 통로 1m · 20장) × 7줄 = 280장 (645W — 180.6kW)', () => {
    const l = layoutRoof([poly(rect(50, 20))], 'flush', 36.8);
    expect(l.count).toBe(280);
    expect(l.kw).toBeCloseTo(180.6, 1);
  });
  it('통로가 없으면 한 줄 41장 — 통로 1m 가 한 장 자리를 먹는다', () =>
    expect(layoutRoof([poly(rect(50, 20))], 'flush', 36.8, { aisleEvery: 0 }).count).toBe(287));
  it('경사고정형(12°): 그림자 간격 때문에 5줄 = 200장', () => expect(layoutRoof([poly(rect(50, 20))], 'tilted', 36.8).count).toBe(200));
  it('건물이 30° 돌아 있어도 같은 장수 — 건물 변을 따라 깐다', () => {
    expect(layoutRoof([poly(rect(50, 20, 30))], 'flush', 36.8).count).toBe(280);
    expect(layoutRoof([poly(rect(50, 20, 30))], 'tilted', 36.8).count).toBe(200);
  });
  it('통로는 줄마다 같은 자리 — 20장 뒤에 1m, 지붕을 가로지르는 길이 된다', () => {
    const l = layoutRoof([poly(rect(50, 20))], 'tilted', 36.8);
    const rows = new Map<number, number[]>();
    for (const q of l.quads) {
      const [x, y] = toM(q[0]);
      const key = Math.round(y * 10);
      rows.set(key, [...(rows.get(key) ?? []), x]);
    }
    expect(rows.size).toBe(5);
    const aisles = [...rows.values()].map((xs) => {
      xs.sort((a, b) => a - b);
      const gaps = xs.slice(1).map((x, i) => x - xs[i] - MODULE.widthM);
      const wide = gaps.flatMap((g, i) => (g > 0.5 ? [i] : []));
      expect(wide).toEqual([19]); // 20장째 뒤 한 곳
      expect(gaps[19]).toBeCloseTo(SPEC.gapM + SPEC.aisleM, 4); // 경위도를 다녀오며 1mm 아래 오차
      return xs[20];
    });
    for (const x of aisles) expect(x).toBeCloseTo(aisles[0], 4);
  });
  it('모든 모듈은 지붕 안, 가장자리에서 1m 떨어져 있다', () => {
    const l = layoutRoof([poly(rect(50, 20, 30))], 'flush', 36.8);
    // 30° 되돌려 축에 맞춘다
    const a = (-30 * Math.PI) / 180;
    for (const q of l.quads)
      for (const p of q) {
        const [px, py] = toM(p);
        const [x, y] = [px * Math.cos(a) - py * Math.sin(a), px * Math.sin(a) + py * Math.cos(a)];
        // 배치는 0.1mm 까지 봐준다(lib/layout EPS_M) — 1mm 로 잰다
        expect(Math.abs(x)).toBeLessThanOrEqual(24 + 1e-3);
        expect(Math.abs(y)).toBeLessThanOrEqual(9 + 1e-3);
      }
  });
  it('가운데 구멍(채광 마당)은 비운다', () => {
    const full = layoutRoof([poly(rect(50, 20))], 'flush', 36.8).count;
    const holed = layoutRoof([poly(rect(50, 20), rect(10, 6))], 'flush', 36.8).count;
    expect(holed).toBeLessThan(full);
    expect(full - holed).toBeGreaterThanOrEqual(30); // 10×6 구멍 + 둘레 1m
  });
  it('ㄱ자 지붕의 꺾인 곳 밖으로는 안 나간다', () => {
    const L: [number, number][] = [
      [0, 0],
      [40, 0],
      [40, 10],
      [10, 10],
      [10, 30],
      [0, 30],
    ];
    const l = layoutRoof([poly(L)], 'flush', 36.8);
    expect(l.count).toBeGreaterThan(0);
    expect(l.count).toBeLessThan(layoutRoof([poly(rect(40, 30))], 'flush', 36.8).count / 2);
  });
  it('작은 창고(4m × 3m)는 0장', () => expect(layoutRoof([poly(rect(4, 3))], 'flush', 36.8).count).toBe(0));
});

describe('cutLayout — 빼기 영역과 겹치는 모듈만 지운다', () => {
  const full = () => layoutRoof([poly(rect(50, 20))], 'flush', 36.8);
  it('가운데 10m × 6m 를 빼면 그만큼 준다', () => {
    const cut = cutLayout(full(), [[poly(rect(10, 6))]]);
    expect(cut.count).toBeLessThan(280);
    expect(280 - cut.count).toBeGreaterThanOrEqual(24); // 10×6 안팎 모듈 + 경계에 걸친 것
    expect(cut.kw).toBeCloseTo((cut.count * MODULE.watt) / 1000, 6);
  });
  it('지붕 밖의 빼기 영역은 아무것도 안 지운다', () => {
    const outside = poly(rect(4, 4).map(([x, y]) => [x + 100, y] as [number, number]));
    expect(cutLayout(full(), [[outside]]).count).toBe(280);
  });
  it('모듈보다 작은 빼기 영역도 그 모듈을 지운다 (환기구)', () => {
    expect(cutLayout(full(), [[poly(rect(0.3, 0.3))]]).count).toBeLessThan(280);
  });
});

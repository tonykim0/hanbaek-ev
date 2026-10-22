/**
 * 패널 배치 계산 — 장수가 곧 용량이고, 그 용량이 제안서 표에 그대로 실린다.
 * 한 장이라도 더 세면 못 얹을 설비를 팔게 되므로 가장자리·틈을 못 박는다.
 */
import { describe, expect, it } from 'vitest';
import {
  capacityLabel, layoutPanels, MODULE_650, totalOf, type Quad,
} from '@/lib/solar/layout';

/** 축에 나란한 지붕면 — 픽셀 100 당 1m 가 되게 잡는다 */
const flat = (wPx: number, hPx: number): Quad => [
  { x: 0, y: 0 }, { x: wPx, y: 0 }, { x: wPx, y: hPx }, { x: 0, y: hPx },
];

const base = {
  module: MODULE_650,
  landscape: true,
  gap: 0.02,
  margin: 0.3,
};

describe('지붕면 하나 채우기', () => {
  it('가로 20m · 세로 10m 지붕에 눕혀 깔면 장수와 용량이 맞는다', () => {
    /* 쓸 수 있는 가로 19.4m / (2.384+0.02) = 8장, 세로 9.4m / (1.303+0.02) = 7줄 */
    const r = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 20, ...base });
    expect(r.cols).toBe(8);
    expect(r.rows).toBe(7);
    expect(r.count).toBe(56);
    expect(r.watt).toBe(56 * 650);
    expect(r.cells).toHaveLength(56);
  });

  it('세워 깔면 가로로 더 들어가고 세로로 덜 들어간다', () => {
    const lay = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 20, ...base });
    const por = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 20, ...base, landscape: false });
    expect(por.cols).toBeGreaterThan(lay.cols);
    expect(por.rows).toBeLessThan(lay.rows);
  });

  it('★못 얹을 자리는 안 센다★ — 가장자리를 넓히면 장수가 준다', () => {
    const tight = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 20, ...base, margin: 0.3 });
    const wide = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 20, ...base, margin: 1.5 });
    expect(wide.count).toBeLessThan(tight.count);
  });

  it('모듈 한 장도 안 들어가는 지붕은 0장이다 — 빈 격자를 그리지 않는다', () => {
    const r = layoutPanels({ quad: flat(100, 100), edgeMeters: 1, ...base });
    expect(r.count).toBe(0);
    expect(r.cells).toEqual([]);
  });

  it('길이를 안 주면 축척이 없어 아무것도 못 센다 — 0 을 돌려주고 멈춘다', () => {
    const r = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 0, ...base });
    expect(r.count).toBe(0);
    expect(r.metersPerPx).toBe(0);
  });
});

describe('기울어진 지붕', () => {
  /*
   * ★위성사진의 지붕은 비스듬하다★ — 격자가 지붕을 따라 기울어야 한다.
   * 같은 크기를 45° 돌려 놓으면 장수는 같고 자리만 돈다.
   */
  const rot45: Quad = [
    { x: 1000, y: 0 },
    { x: 1000 + 1414.2, y: 1414.2 },
    { x: 1000 + 1414.2 - 707.1, y: 1414.2 + 707.1 },
    { x: 1000 - 707.1, y: 707.1 },
  ];

  it('돌려 놓아도 장수가 같다', () => {
    const flatR = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 20, ...base });
    const tilt = layoutPanels({ quad: rot45, edgeMeters: 20, ...base });
    expect(tilt.count).toBe(flatR.count);
  });

  it('칸의 네 모서리가 지붕과 같은 방향으로 기운다', () => {
    const r = layoutPanels({ quad: rot45, edgeMeters: 20, ...base });
    const [p0, p1] = r.cells[0];
    /* a→b 가 45° 라 칸의 첫 변도 x·y 가 같은 몫으로 는다 */
    expect(p1.x - p0.x).toBeCloseTo(p1.y - p0.y, 1);
  });
});

describe('현장 합계 — 제안서 표에 실리는 값', () => {
  it('블록 여럿을 합쳐 kW 를 소수 한 자리로 준다', () => {
    const one = layoutPanels({ quad: flat(2000, 1000), edgeMeters: 20, ...base });
    const two = layoutPanels({ quad: flat(1000, 1000), edgeMeters: 10, ...base });
    const t = totalOf([one, two]);
    expect(t.count).toBe(one.count + two.count);
    expect(t.watt).toBe(t.count * 650);
    /*
     * ★반올림은 올림 쪽이다★ — 50,050W 는 50.05kW 고 소수 한 자리면 50.1 이다.
     * 경계에 걸리는 값이라 근사로 재면 시험이 흔들린다(실제로 그랬다). 값을 못 박는다.
     */
    expect(t.count).toBe(77);
    expect(t.watt).toBe(50_050);
    expect(t.kw).toBe(50.1);
  });

  it('★Agenda 의 표기를 그대로 만든다★ — 650(W)*136장=88.4kW', () => {
    expect(capacityLabel(MODULE_650, 136)).toBe('650(W)*136장=88.4kW');
    expect(capacityLabel(MODULE_650, 278)).toBe('650(W)*278장=180.7kW');
  });
});

import { describe, expect, it } from 'vitest';
import { moveAnnot, snapPt } from '@/lib/survey/annot';
import { gvOf, newPlSpot, plSpotLabel } from '@/lib/survey/spec';

describe('도면 거점 라벨', () => {
  it('접지선 굵기는 KEC 보호도체 규칙 — 제출본 라벨의 짝과 같다', () => {
    expect([6, 10, 16, 25, 35, 50, 70, 95].map(gvOf)).toEqual([6, 10, 16, 16, 16, 25, 35, 50]);
  });

  it('위 칸은 거점·대수·분전반, 아래 칸은 CV·GV 와 길이', () => {
    const s = { ...newPlSpot('a'), qty: 4, replQty: 1, panelName: 'LEM2-B-B3 PANEL', cableSize: 50, cableLen: 82 };
    expect(plSpotLabel(s, 1)).toEqual({
      name: '1거점',
      head: ['1거점 신규 4대 · 교체 1대', 'LEM2-B-B3 PANEL'],
      body: ['CV 50sq-4C  82m', 'GV 25sq  82m'],
    });
  });

  it('한전인입은 분전반 자리에 「한전인입」, 배선 굵기가 없으면 아래 칸이 없다', () => {
    const s = { ...newPlSpot('b'), qty: 3, inlet: '한전인입' as const };
    expect(plSpotLabel(s, 2)).toEqual({ name: '2거점', head: ['2거점 신규 3대', '한전인입'], body: [] });
  });
});

describe('표시 조작', () => {
  it('선은 가로·세로에 가까우면 곧게 붙는다', () => {
    expect(snapPt({ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.52 }, 4 / 3)).toEqual({ x: 0.6, y: 0.5 });
    expect(snapPt({ x: 0.2, y: 0.5 }, { x: 0.21, y: 0.9 }, 4 / 3)).toEqual({ x: 0.2, y: 0.9 });
    const free = { x: 0.6, y: 0.8 };
    expect(snapPt({ x: 0.2, y: 0.5 }, free, 4 / 3)).toBe(free);
  });

  it('옮기면 선의 점이 다 같이 움직이고, 사진 밖으로는 안 나간다', () => {
    const l = moveAnnot({ t: 'line', pts: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.2 }], k: 'wire' }, 0.1, -0.15);
    if (l.t !== 'line') throw new Error('선이 아니다');
    expect(l.k).toBe('wire');
    const want = [[0.2, 0], [0.6, 0.05]];
    l.pts.forEach((p, i) => { expect(p.x).toBeCloseTo(want[i][0], 9); expect(p.y).toBeCloseTo(want[i][1], 9); });
    expect(moveAnnot({ t: 'sym', k: 'charger', x: 0.95, y: 0.5, r: 90 }, 0.2, 0)).toEqual({ t: 'sym', k: 'charger', x: 1, y: 0.5, r: 90 });
  });
});

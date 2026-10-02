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

describe('파워포인트식 조정', () => {
  const W = 1600; const H = 1200;
  it('기호는 모서리를 끈 거리만큼 고르게 커진다', async () => {
    const { boxOf, resizeAnnot } = await import('@/lib/survey/annot');
    const a = { t: 'sym' as const, k: 'charger' as const, x: 0.5, y: 0.5, z: 1 };
    const b = boxOf(a, W, H);
    const big = resizeAnnot(a, 1, 1, b.cx + b.w, b.cy + b.h, W, H);
    expect(big.z).toBeCloseTo(2, 5);
  });

  it('네모는 맞은편 모서리를 붙박고 늘어난다', async () => {
    const { resizeAnnot } = await import('@/lib/survey/annot');
    const a = { t: 'box' as const, a: { x: 0.25, y: 0.25 }, b: { x: 0.5, y: 0.5 } };
    const r = resizeAnnot(a, 1, 1, 0.75 * W, 0.75 * H, W, H);
    if (r.t !== 'box') throw new Error('네모가 아니다');
    expect(r.a.x).toBeCloseTo(0.25, 5); expect(r.a.y).toBeCloseTo(0.25, 5);
    expect(r.b.x).toBeCloseTo(0.75, 5); expect(r.b.y).toBeCloseTo(0.75, 5);
  });

  it('회전은 15° 근처에서 붙고, 선은 점을 돌린다', async () => {
    const { rotateAnnot } = await import('@/lib/survey/annot');
    expect(rotateAnnot({ t: 'sym', k: 'charger', x: 0.5, y: 0.5 }, 88, W, H).r).toBe(90);
    expect(rotateAnnot({ t: 'sym', k: 'charger', x: 0.5, y: 0.5 }, 50, W, H).r).toBe(50);
    const l = rotateAnnot({ t: 'line', pts: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }] }, 90, W, H);
    if (l.t !== 'line') throw new Error('선이 아니다');
    expect(l.pts[0].x * W).toBeCloseTo(800, 3); expect(l.pts[1].x * W).toBeCloseTo(800, 3);
  });

  it('누른 자리의 표시 — 위에 그린 것부터, 돌린 상자 안도 잡는다', async () => {
    const { hitAnnot } = await import('@/lib/survey/annot');
    const list = [
      { t: 'sym' as const, k: 'charger' as const, x: 0.5, y: 0.5 },
      { t: 'sym' as const, k: 'panelNew' as const, x: 0.5, y: 0.5, r: 90 },
    ];
    expect(hitAnnot(list, 800, 600, W, H)).toBe(1);
    expect(hitAnnot(list, 100, 100, W, H)).toBe(-1);
  });
});

describe('엑셀 도형', () => {
  it('표시마다 도형 하나 — 번호는 숫자 든 타원, 화살표는 끝 화살촉, 라벨은 상자 둘의 묶음', async () => {
    const { marksXml } = await import('@/lib/survey/xlsx-marks');
    let id = 100;
    const xml = marksXml([
      { t: 'num', x: 0.5, y: 0.5 },
      { t: 'line', k: 'arrow', pts: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }] },
      { t: 'label', x: 0.5, y: 0.2, head: ['1거점 신규 4대'], body: ['CV 16sq-4C  35m'] },
      { t: 'sym', k: 'charger', x: 0.2, y: 0.8, r: 90 },
    ], { width: 1600, height: 1200 }, { cx: 1600 * 9525, cy: 1200 * 9525, crop: { l: 0, t: 0, r: 0, b: 0 } }, 'red', () => (id += 1));
    expect(xml.match(/<xdr:sp /g)?.length).toBe(5); // 번호 · 선 · 라벨 둘 · 충전기
    expect(xml).toContain('prst="ellipse"');
    expect(xml).toContain('<a:t>1</a:t>');
    expect(xml).toContain('tailEnd type="triangle"');
    expect(xml).toContain('<xdr:grpSp>');
    expect(xml).toContain('rot="5400000"');
  });

  it('칸 비율로 잘린 바깥의 표시는 뺀다', async () => {
    const { marksXml } = await import('@/lib/survey/xlsx-marks');
    const xml = marksXml([{ t: 'num', x: 0.05, y: 0.5 }, { t: 'num', x: 0.5, y: 0.5 }],
      { width: 1600, height: 1200 }, { cx: 800 * 9525, cy: 1200 * 9525, crop: { l: 0.25, t: 0, r: 0.25, b: 0 } }, 'red', () => 1);
    expect(xml.match(/<xdr:sp /g)?.length).toBe(1);
    expect(xml).toContain('<a:t>2</a:t>'); // 번호는 그린 순서 그대로 — 빠진 1 이 2 를 1 로 당기지 않는다
  });
});

describe('거점 라벨은 거점 값에 묶인다', () => {
  it('배관이 있으면 아래 칸 끝에 「배관 42C 30m」', () => {
    const s = { ...newPlSpot('a'), qty: 3, panelName: 'PM-1', cableSize: 16, cableLen: 35, pipeSize: 42, pipeLen: 30 };
    expect(plSpotLabel(s, 1).body).toEqual(['CV 16sq-4C  35m', 'GV 16sq  35m', '배관 42C  30m']);
  });

  it('찍어 둔 라벨은 거점 값을 고치면 따라 바뀐다 · 값 없는 거점도 번호로 고른다(10거점까지)', async () => {
    const { resolveLabels } = await import('@/lib/survey/annot');
    const { plSpotLabels } = await import('@/lib/survey/spec');
    const s = { ...newPlSpot('a'), qty: 3, cableSize: 16, cableLen: 35 };
    const placed = [{ t: 'label' as const, x: 0.2, y: 0.2, spot: 1, head: plSpotLabel(s, 1).head, body: plSpotLabel(s, 1).body }];
    const after = resolveLabels(placed, plSpotLabels([{ ...s, cableLen: 48 }]));
    expect(after[0].t === 'label' && after[0].body[0]).toBe('CV 16sq-4C  48m');
    const names = plSpotLabels([s]).map((l) => l.name);
    expect(names.length).toBe(10);
    expect(names[4]).toBe('5거점');
  });

  it('한전인입은 전주번호를 적으면 그것이 둘째 줄', () => {
    const s = { ...newPlSpot('b'), qty: 2, inlet: '한전인입' as const, poleNo: '2175G142 송정선 49R3' };
    expect(plSpotLabel(s, 1).head).toEqual(['1거점 신규 2대', '2175G142 송정선 49R3']);
  });
});


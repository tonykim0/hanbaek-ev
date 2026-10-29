/**
 * 서류 문구 수정의 잉크 찾기 — 판독의 어림 상자에서 「지울 글자」를 정확히 집는가.
 *
 * 결과가 그림이라 틀려도 그럴싸하게 틀린다(옆 글자를 반쯤 지우거나 괘선을 끊는다). 아는 답이 있는 그림으로 묶는다:
 * 흰 종이 위에 검은 네모 「글자」를 늘어놓고, 밑에 괘선을 긋는다.
 */
import { describe, expect, it } from 'vitest';
import { findInk, fitFont, grayOf, inkColorOf, paperOf, type Box } from '@/lib/retouch/ink';

const PAPER = 235;
const INK = 30;

function page(W: number, H: number, glyphs: Box[], lines: { y?: number; x?: number }[] = []) {
  const data = new Uint8ClampedArray(W * H * 4);
  const put = (x: number, y: number, v: number) => {
    const i = (y * W + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  };
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) put(x, y, PAPER);
  for (const g of glyphs) {
    for (let y = g.y; y < g.y + g.h; y += 1) for (let x = g.x; x < g.x + g.w; x += 1) put(x, y, INK);
  }
  for (const l of lines) {
    if (l.y !== undefined) for (let x = 0; x < W; x += 1) put(x, l.y, INK);
    if (l.x !== undefined) for (let y = 0; y < H; y += 1) put(l.x, y, INK);
  }
  const rgba = { width: W, height: H, data };
  return { rgba, gray: grayOf(rgba) };
}

/* 한 줄에 글자 다섯 — 폭 20 · 높이 30 · 간격 6, 줄 위아래로 다른 줄이 있다 */
const LINE = [0, 1, 2, 3, 4].map((i) => ({ x: 50 + i * 26, y: 100, w: 20, h: 30 }));
const ABOVE = [0, 1, 2].map((i) => ({ x: 50 + i * 26, y: 50, w: 20, h: 30 }));
const BELOW = [0, 1, 2].map((i) => ({ x: 50 + i * 26, y: 150, w: 20, h: 30 }));

describe('findInk — 어림 상자에서 바꿀 글자 집기', () => {
  it('상자가 조금 어긋나도 가운데가 든 글자만 꼭 맞게 집는다', () => {
    const { gray } = page(400, 250, [...ABOVE, ...LINE, ...BELOW]);
    // 셋째·넷째 글자(x 102~148)를 어림으로 — 왼쪽은 둘째 글자 끝에 4px 걸치고 위아래는 잘렸다
    const fit = findInk(gray, { x: 94, y: 106, w: 52, h: 18 });
    expect(fit?.box).toEqual({ x: 102, y: 100, w: 46, h: 30 });
  });

  it('위아래 줄로 번지지 않는다', () => {
    const { gray } = page(400, 250, [...ABOVE, ...LINE, ...BELOW]);
    const fit = findInk(gray, { x: 50, y: 98, w: 20, h: 34 });
    expect(fit?.box.y).toBe(100);
    expect(fit?.box.h).toBe(30);
  });

  it('밑의 괘선은 잉크로 치지 않고 남길 행으로 돌려준다', () => {
    const { gray } = page(400, 250, LINE, [{ y: 134 }]);
    const fit = findInk(gray, { x: 50, y: 100, w: 46, h: 36 });
    expect(fit?.box).toEqual({ x: 50, y: 100, w: 46, h: 30 });
    expect(fit?.lineRows).toContain(134);
  });

  it('상자 안이 종이뿐이면 null', () => {
    const { gray } = page(400, 250, LINE);
    expect(findInk(gray, { x: 300, y: 50, w: 40, h: 30 })).toBeNull();
  });

  it('상자가 글자 사이 빈칸에 떨어지면 가장 가까운 글자 하나를 집는다', () => {
    const { gray } = page(400, 250, LINE);
    const fit = findInk(gray, { x: 71, y: 100, w: 4, h: 30 });
    expect(fit).not.toBeNull();
    expect([50, 76]).toContain(fit?.box.x);
    expect(fit?.box.w).toBe(20);
  });
});

describe('paperOf · inkColorOf — 종이와 글자의 색', () => {
  it('둘레 종이의 색을 잰다 — 글자는 빼고', () => {
    const { rgba, gray } = page(400, 250, LINE);
    const p = paperOf(rgba, gray, { x: 102, y: 100, w: 46, h: 30 }, 3, 120);
    expect(Math.round(p.r)).toBe(PAPER);
    expect(p.std).toBe(0);
  });

  it('글자 색은 잉크 화소의 색이다', () => {
    const { rgba, gray } = page(400, 250, LINE);
    const c = inkColorOf(rgba, gray, { x: 50, y: 100, w: 20, h: 30 }, 120);
    expect(Math.round(c.r)).toBe(INK);
  });
});

describe('fitFont — 원래 글자 크기에 맞춘 글꼴 크기·가로 배율', () => {
  it('높이로 크기를, 폭으로 가로 배율을 정한다', () => {
    // 100px 로 그리면 높이 80 · 폭 160 — 스캔은 높이 40 · 폭 88
    expect(fitFont({ w: 88, h: 40 }, { w: 160, h: 80 })).toEqual({ px: 50, sx: 1.1 });
  });

  it('가로 배율은 0.75~1.3 으로 묶는다 — 원래 글자를 잘못 읽어도 납작해지지 않게', () => {
    expect(fitFont({ w: 400, h: 40 }, { w: 160, h: 80 }).sx).toBe(1.3);
    expect(fitFont({ w: 10, h: 40 }, { w: 160, h: 80 }).sx).toBe(0.75);
  });
});

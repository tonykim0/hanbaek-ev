/**
 * 서류 문구 수정 — 스캔본에서 바꿀 글자의 잉크를 찾고, 그 둘레의 종이를 잰다. [순수 — 시험이 본다]
 *
 * 판독(lib/retouch/locate)이 주는 상자는 긴 변 1600px 그림 위의 어림이다. 원본 해상도(보통 300dpi)로
 * 옮기면 몇 화소씩 어긋나고, 그대로 지우면 옆 글자를 같이 지우거나 획 끝이 남는다. 그래서 여기서
 * ★상자 안의 실제 잉크로 다시 잡는다★ — 줄(행)을 먼저 정하고, 그 줄에서 글자 조각(잉크 열의 덩어리)을
 * 나눠 가운데가 상자 안에 든 조각만 고른다. 상자 끝이 글자 반쯤 걸쳐도 그 글자의 가운데가 어느 쪽인지로 갈린다.
 *
 * 표의 괘선은 잉크가 아니다 — 상자 폭의 대부분을 가로지르는 행·상자 높이의 대부분을 세로지르는 열은
 * 괘선으로 보고 빼며, 지울 때도 그 화소는 남긴다(괘선이 끊기면 고친 자리가 바로 보인다).
 */
import { otsu } from '@/lib/scanify';

export interface Box { x: number; y: number; w: number; h: number }

/** 밝기만 — 원본 RGBA 에서 한 번 만들어 두고 같이 쓴다 */
export interface Gray { width: number; height: number; data: Uint8Array }

export interface InkFit {
  /** 바꿀 글자들의 잉크를 꼭 맞게 두른 상자 */
  box: Box;
  /** 잉크와 종이를 가르는 밝기 — 이 값까지가 잉크다 */
  threshold: number;
  /** 괘선 — 지울 때 남길 행·열(페이지 좌표) */
  lineRows: number[];
  lineCols: number[];
}

export function grayOf(rgba: { width: number; height: number; data: Uint8ClampedArray }): Gray {
  const { width, height, data } = rgba;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }
  return { width, height, data: out };
}

const clampBox = (b: Box, W: number, H: number): Box => {
  const x = Math.max(0, Math.floor(b.x));
  const y = Math.max(0, Math.floor(b.y));
  const r = Math.min(W, Math.ceil(b.x + b.w));
  const bt = Math.min(H, Math.ceil(b.y + b.h));
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, bt - y) };
};

export const grow = (b: Box, dx: number, dy = dx): Box =>
  ({ x: b.x - dx, y: b.y - dy, w: b.w + dx * 2, h: b.h + dy * 2 });

/**
 * 상자 안의 바꿀 글자 잉크 — 못 찾으면 null(종이뿐이거나 대비가 없다).
 *
 * 찾는 범위를 상자보다 넓힌다: 어림 상자가 글자 위아래를 조금 자르는 일이 흔해서다. 넓힌 만큼 옆 줄이
 * 들어오지만, 줄은 상자 안에서 잉크가 가장 짙은 행에서 출발해 빈 행을 만나면 멈추므로 옆 줄로 번지지 않는다.
 */
export function findInk(gray: Gray, target: Box): InkFit | null {
  const { width: W, height: H, data } = gray;
  const t0 = clampBox(target, W, H);
  if (t0.w < 2 || t0.h < 2) return null;
  const m = Math.round(t0.h * 0.6) + 4;
  const s = clampBox(grow(t0, m), W, H);

  const values = new Uint8Array(s.w * s.h);
  let lo = 255, hi = 0;
  for (let y = 0; y < s.h; y += 1) {
    for (let x = 0; x < s.w; x += 1) {
      const v = data[(s.y + y) * W + s.x + x];
      values[y * s.w + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  /* 대비가 없으면 글자가 없다 — 종이의 얼룩을 글자로 잡지 않게 */
  if (hi - lo < 40) return null;
  const t = otsu(values);
  /* otsu 는 어두운 무리의 마지막 밝기를 준다 — 그 값까지가 잉크다 */
  const ink = (x: number, y: number) => values[y * s.w + x] <= t;

  /*
   * 괘선 — ★끊기지 않고 길게 이어지는 줄★이다. 비율(잉크가 행의 몇 %)로 재면 빽빽한 글자 줄 자체가 괘선으로
   * 잡힌다. 그래서 가장 긴 연속 길이로 가른다: 가로는 넓힌 폭의 절반과 글자 높이 두 배를 다 넘는 것,
   * 세로는 넓힌 높이의 80% 를 넘는 것(글자의 세로획은 글자 높이를 못 넘는다 — 넓힌 높이는 그 두 배쯤이다).
   */
  const lineRow = new Uint8Array(s.h);
  const lineCol = new Uint8Array(s.w);
  const rowNeed = Math.max(s.w * 0.5, t0.h * 2);
  for (let y = 0; y < s.h; y += 1) {
    let run = 0, longest = 0;
    for (let x = 0; x < s.w; x += 1) { run = ink(x, y) ? run + 1 : 0; if (run > longest) longest = run; }
    if (longest >= rowNeed) lineRow[y] = 1;
  }
  for (let x = 0; x < s.w; x += 1) {
    let run = 0, longest = 0;
    for (let y = 0; y < s.h; y += 1) { run = ink(x, y) ? run + 1 : 0; if (run > longest) longest = run; }
    if (longest >= s.h * 0.8) lineCol[x] = 1;
  }
  const isInk = (x: number, y: number) => !lineRow[y] && !lineCol[x] && ink(x, y);

  /*
   * 줄 — 상자 높이 안에서 잉크가 가장 많은 행에서 위아래로 번진다. 빈 행이 gap 을 넘으면 멈춘다.
   * 상자가 글자 사이 빈칸에 떨어져 그 폭에 잉크가 없으면 넓힌 폭 전체로 줄을 찾는다.
   */
  const tx0 = t0.x - s.x, tx1 = tx0 + t0.w;
  const ty0 = t0.y - s.y, ty1 = ty0 + t0.h;
  let cx0 = Math.max(0, tx0), cx1 = Math.min(s.w, tx1);
  const rowCount = (y: number) => {
    let n = 0;
    for (let x = cx0; x < cx1; x += 1) if (isInk(x, y)) n += 1;
    return n;
  };
  const seedRow = () => {
    let at = -1, best = 0;
    for (let y = ty0; y < ty1; y += 1) {
      const n = rowCount(y);
      if (n > best) { best = n; at = y; }
    }
    return at;
  };
  let seed = seedRow();
  if (seed < 0) { cx0 = 0; cx1 = s.w; seed = seedRow(); }
  if (seed < 0) return null;
  const gap = Math.max(1, Math.round(t0.h * 0.12));
  const spread = (dir: 1 | -1) => {
    let edge = seed, empty = 0;
    for (let y = seed + dir; y >= 0 && y < s.h; y += dir) {
      if (rowCount(y) > 0) { edge = y; empty = 0; } else if (++empty > gap) break;
    }
    return edge;
  };
  const top = spread(-1), bottom = spread(1);

  // 글자 조각 — 그 줄에서 잉크가 있는 열의 덩어리. 가운데가 상자 안인 것만
  const colHas = new Uint8Array(s.w);
  for (let x = 0; x < s.w; x += 1) {
    for (let y = top; y <= bottom; y += 1) if (isInk(x, y)) { colHas[x] = 1; break; }
  }
  const runs: Array<[number, number]> = [];
  for (let x = 0; x < s.w; x += 1) {
    if (!colHas[x]) continue;
    const a = x;
    while (x + 1 < s.w && colHas[x + 1]) x += 1;
    runs.push([a, x]);
  }
  let picked = runs.filter(([a, b]) => { const c = (a + b) / 2; return c >= tx0 && c < tx1; });
  if (picked.length === 0) {
    const mid = (tx0 + tx1) / 2;
    const near = runs.reduce<[number, number] | null>((p, r) =>
      (!p || Math.abs((r[0] + r[1]) / 2 - mid) < Math.abs((p[0] + p[1]) / 2 - mid) ? r : p), null);
    if (!near) return null;
    picked = [near];
  }
  const x0 = picked[0][0], x1 = picked[picked.length - 1][1];

  // 고른 열 안에서 잉크가 실제로 닿는 위아래
  let y0 = bottom, y1 = top;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = x0; x <= x1; x += 1) if (isInk(x, y)) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
  }
  if (y1 < y0) return null;

  const lineRows: number[] = [];
  const lineCols: number[] = [];
  lineRow.forEach((v, y) => { if (v) lineRows.push(s.y + y); });
  lineCol.forEach((v, x) => { if (v) lineCols.push(s.x + x); });
  return { box: { x: s.x + x0, y: s.y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, threshold: t, lineRows, lineCols };
}

export interface Paper { r: number; g: number; b: number; std: number }

/**
 * 지울 자리 둘레의 종이 — 고리(안쪽 pad 밖 · 바깥 pad×3 안)에서 잉크가 아닌 화소의 평균색과 밝기의 흩어짐.
 * 스캔 종이는 흰색이 아니라 누렇거나 회색이고 잡음이 있다 — 그 둘을 같이 재야 지운 자리가 떠 보이지 않는다.
 */
export function paperOf(
  rgba: { width: number; height: number; data: Uint8ClampedArray },
  gray: Gray,
  box: Box,
  pad: number,
  threshold: number
): Paper {
  const { width: W, height: H, data } = rgba;
  const inner = clampBox(grow(box, pad), W, H);
  const outer = clampBox(grow(box, pad * 3 + 2), W, H);
  let n = 0, r = 0, g = 0, b = 0, sum = 0, sq = 0;
  for (let y = outer.y; y < outer.y + outer.h; y += 1) {
    for (let x = outer.x; x < outer.x + outer.w; x += 1) {
      if (x >= inner.x && x < inner.x + inner.w && y >= inner.y && y < inner.y + inner.h) continue;
      const v = gray.data[y * W + x];
      if (v <= threshold) continue;
      const p = (y * W + x) * 4;
      r += data[p]; g += data[p + 1]; b += data[p + 2];
      sum += v; sq += v * v; n += 1;
    }
  }
  if (n === 0) return { r: 255, g: 255, b: 255, std: 0 };
  const mean = sum / n;
  return {
    r: r / n, g: g / n, b: b / n,
    /* 잡음은 줄인다 — 고리에 섞인 옅은 얼룩까지 그대로 뿌리면 지운 자리가 지저분해진다 */
    std: Math.min(10, Math.sqrt(Math.max(0, sq / n - mean * mean)) * 0.8),
  };
}

/** 글자 색 — 잉크 화소 중 짙은 쪽 반의 평균. 옅은 가장자리(번짐)까지 섞으면 글자가 회색으로 뜬다 */
export function inkColorOf(
  rgba: { width: number; height: number; data: Uint8ClampedArray },
  gray: Gray,
  box: Box,
  threshold: number
): { r: number; g: number; b: number } {
  const { width: W, data } = rgba;
  const px: Array<[number, number]> = [];
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const v = gray.data[y * W + x];
      if (v <= threshold) px.push([v, (y * W + x) * 4]);
    }
  }
  if (px.length === 0) return { r: 0, g: 0, b: 0 };
  px.sort((a, b) => a[0] - b[0]);
  const half = px.slice(0, Math.max(1, Math.ceil(px.length / 2)));
  let r = 0, g = 0, b = 0;
  for (const [, p] of half) { r += data[p]; g += data[p + 1]; b += data[p + 2]; }
  return { r: r / half.length, g: g / half.length, b: b / half.length };
}

/**
 * 글꼴 크기와 가로 배율 — 원래 글자를 우리 글꼴로 100px 에 그려 잰 잉크 크기(measured)와 스캔의 잉크 크기를 맞춘다.
 * 높이로 크기를 정하고, 남는 폭 차이(글꼴의 자폭·자간 차이)는 가로 배율로 메운다. 배율은 0.75~1.3 으로 묶는다 —
 * 판독이 원래 글자를 잘못 읽었으면 폭이 엉뚱해지는데, 그때 글자가 납작하거나 홀쭉해지지 않게.
 */
export function fitFont(ink: { w: number; h: number }, measured: { w: number; h: number }): { px: number; sx: number } {
  if (measured.h <= 0) return { px: ink.h, sx: 1 };
  const px = (100 * ink.h) / measured.h;
  const natural = (measured.w * px) / 100;
  const sx = natural > 0 ? Math.min(1.3, Math.max(0.75, ink.w / natural)) : 1;
  return { px, sx };
}

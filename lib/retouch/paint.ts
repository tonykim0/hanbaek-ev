'use client';

/**
 * 서류 문구 수정 — 스캔본의 글자를 지우고 그 자리에 새 글자를 같은 모양으로 쓴다. [브라우저 전용]
 *
 * 차례: 어림 상자에서 잉크를 다시 잡는다(lib/retouch/ink findInk) → 둘레 종이의 색·잡음으로 덮는다(괘선 화소는 남긴다)
 * → 원래 글자를 우리 글꼴로 재서 높이·폭을 맞춘 크기로 새 글자를 쓴다 → 스캔처럼 가장자리를 살짝 번지게 한다.
 * 흑백(1비트) 스캔이면 고친 자리를 다시 흑백으로 가른다 — 회색 가장자리가 남으면 거기만 다르게 보인다.
 *
 * 잡음은 고칠 자리마다 정해진 씨앗으로 뿌린다 — 상자를 끌 때마다 다시 그리는데, 그때마다 잡음이 바뀌면 화면이 떨린다.
 */
import { findInk, fitFont, grow, inkColorOf, paperOf, type Box, type Gray } from './ink';
import type { Align } from './types';

export interface Raster { width: number; height: number; data: Uint8ClampedArray; gray: Gray }

export type FontKey = 'serif' | 'sans';

/** 굵기 네 단계 — 스캔 글자는 보통·굵게 둘로 안 갈린다(바탕체 숫자는 그 사이다). 원본 획의 잉크 밀도로 고른다(guessWeight) */
export const WEIGHTS = [400, 500, 600, 700] as const;
export type Weight = (typeof WEIGHTS)[number];

/** 고칠 자리 하나 — 상자는 원본 해상도의 화소 좌표다 */
export interface Edit {
  id: string;
  /** 1부터 */
  page: number;
  /** 어림 상자 — 판독이 준 것을 원본 해상도로 옮긴 것. 사람이 끌어 옮기거나 늘린다 */
  box: Box;
  /** 지금 적힌 글자 — 글꼴 크기를 재는 잣대다 */
  original: string;
  replacement: string;
  font: FontKey;
  weight: Weight;
  align: Align;
  /** 맞춘 크기에 곱하는 배율 — 사람이 「작게 · 크게」로 고친다 */
  scale: number;
  /** 사람이 민 거리(원본 화소) */
  dx: number;
  dy: number;
}

/** 그린 결과 — 잉크를 못 찾은 자리는 problem 이 선다 */
export interface Painted { ink: Box | null; problem: string | null }

function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampTo = (b: Box, W: number, H: number): Box => {
  const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
  return { x, y, w: Math.max(0, Math.min(W, Math.ceil(b.x + b.w)) - x), h: Math.max(0, Math.min(H, Math.ceil(b.y + b.h)) - y) };
};

export const fontCss = (family: string, weight: Weight, px: number) => `${weight} ${px}px ${family}`;

/**
 * 쓸 글자에 필요한 글꼴 조각을 받아 둔다 — 한글 글꼴은 글자 묶음마다 파일이 따로라 써 보기 전에 받아야 한다.
 * allWeights 면 네 굵기를 다 받는다(굵기를 고르기 전).
 */
export async function ensureFonts(fonts: Record<FontKey, string>, edits: Edit[], allWeights = false): Promise<void> {
  const jobs = edits.flatMap((e) => {
    const text = `${e.original}${e.replacement}` || '가';
    return (allWeights ? WEIGHTS : [e.weight]).map((w) => document.fonts.load(fontCss(fonts[e.font], w, 40), text));
  });
  await Promise.all(jobs).catch(() => undefined);
}

const blurOf = (px: number) => `blur(${Math.min(1, Math.max(0.3, px * 0.012)).toFixed(2)}px)`;

/**
 * 원본 획의 굵기에 가장 가까운 굵기 — 잉크 상자 안에서 잉크가 차지하는 몫(밀도)을, 같은 글자를 굵기마다 같은 크기로
 * 그려 잰 밀도와 견준다. 판독의 「굵다/아니다」는 둘로만 갈라 바탕체 숫자처럼 그 사이인 글자를 못 맞췄다.
 * 잉크를 못 찾거나 원래 글자가 없으면 지금 굵기 그대로다. ensureFonts(…, true) 뒤에 부른다.
 */
export function guessWeight(raster: Raster, e: Edit, fonts: Record<FontKey, string>): Weight {
  const fit = findInk(raster.gray, e.box);
  if (!fit || !e.original) return e.weight;
  const ink = fit.box;
  let n = 0;
  for (let y = ink.y; y < ink.y + ink.h; y += 1) {
    for (let x = ink.x; x < ink.x + ink.w; x += 1) if (raster.gray.data[y * raster.width + x] <= fit.threshold) n += 1;
  }
  const target = n / (ink.w * ink.h);
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return e.weight;
  let best: Weight = e.weight, gap = Infinity;
  for (const w of WEIGHTS) {
    ctx.font = fontCss(fonts[e.font], w, 100);
    const r = ctx.measureText(e.original);
    const { px, sx } = fitFont(ink, {
      w: r.actualBoundingBoxLeft + r.actualBoundingBoxRight, h: r.actualBoundingBoxAscent + r.actualBoundingBoxDescent,
    });
    cv.width = Math.ceil(ink.w + 20); cv.height = Math.ceil(ink.h + 20);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = fontCss(fonts[e.font], w, px);
    const m = ctx.measureText(e.original);
    ctx.save();
    ctx.translate(10, 10 + m.actualBoundingBoxAscent);
    ctx.scale(sx, 1);
    ctx.fillStyle = '#000';
    ctx.filter = blurOf(px);
    ctx.fillText(e.original, m.actualBoundingBoxLeft, 0);
    ctx.restore();
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, x1 = -1, y0 = cv.height, y1 = -1, k = 0;
    for (let y = 0; y < cv.height; y += 1) {
      for (let x = 0; x < cv.width; x += 1) {
        if (d[(y * cv.width + x) * 4] >= 128) continue;
        k += 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < x0) continue;
    const diff = Math.abs(k / ((x1 - x0 + 1) * (y1 - y0 + 1)) - target);
    if (diff < gap) { gap = diff; best = w; }
  }
  return best;
}

/**
 * 한 쪽의 고칠 자리를 모두 그린다 — ctx 에는 이미 원본(raster)이 그려져 있어야 한다.
 * 종이·잉크 색은 원본(raster)에서 잰다 — 앞에서 고친 자리가 다음 자리의 잣대가 되지 않게.
 */
export function paintEdits(
  ctx: CanvasRenderingContext2D,
  raster: Raster,
  edits: Edit[],
  fonts: Record<FontKey, string>,
  mono: boolean
): Map<string, Painted> {
  const W = raster.width, H = raster.height;
  const out = new Map<string, Painted>();
  for (const e of edits) {
    const fit = findInk(raster.gray, e.box);
    if (!fit) {
      out.set(e.id, { ink: null, problem: '상자 안에 글자가 없습니다 — 상자를 글자 위로 옮기세요' });
      continue;
    }
    const ink = fit.box;
    const pad = Math.max(2, Math.round(ink.h * 0.12));
    const paper = paperOf(raster, raster.gray, ink, pad, fit.threshold);
    const color = inkColorOf(raster, raster.gray, ink, fit.threshold);

    // 지우기 — 괘선 화소는 남긴다
    const r = clampTo(grow(ink, pad), W, H);
    const keepRow = new Set(fit.lineRows);
    const keepCol = new Set(fit.lineCols);
    const img = ctx.getImageData(r.x, r.y, r.w, r.h);
    const rnd = seeded(e.id);
    for (let y = 0; y < r.h; y += 1) {
      for (let x = 0; x < r.w; x += 1) {
        const p = (y * r.w + x) * 4;
        // 번호는 늘 뽑는다 — 괘선을 건너뛰어도 다른 화소의 잡음이 밀리지 않게
        const n = (rnd() + rnd() + rnd() - 1.5) * 2 * paper.std;
        if (keepRow.has(r.y + y) || keepCol.has(r.x + x)) continue;
        img.data[p] = paper.r + n; img.data[p + 1] = paper.g + n; img.data[p + 2] = paper.b + n; img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, r.x, r.y);

    // 쓰기 — 원래 글자를 100px 로 재서 높이·폭을 맞춘다
    const family = fonts[e.font];
    ctx.font = fontCss(family, e.weight, 100);
    const ruler = ctx.measureText(e.original || e.replacement);
    const measured = {
      w: ruler.actualBoundingBoxLeft + ruler.actualBoundingBoxRight,
      h: ruler.actualBoundingBoxAscent + ruler.actualBoundingBoxDescent,
    };
    const { px: fitted, sx } = fitFont(ink, measured);
    const px = fitted * e.scale;
    /* 줄 높이는 원래 글자의 윗선에 맞춘다 — 크기를 바꿔도 아랫선(기준선)이 그대로이게 원래 크기로 잰다 */
    const baseline = ink.y + (ruler.actualBoundingBoxAscent * fitted) / 100 + e.dy;
    ctx.font = fontCss(family, e.weight, px);
    const m = ctx.measureText(e.replacement);
    const width = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) * sx;
    const left = (e.align === 'center' ? ink.x + (ink.w - width) / 2
      : e.align === 'right' ? ink.x + ink.w - width
        : ink.x) + e.dx;

    ctx.save();
    ctx.translate(left, baseline);
    ctx.scale(sx, 1);
    ctx.fillStyle = `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
    /* 스캔은 가장자리가 무르다 — 글자 크기에 비례해 아주 조금. 흑백이면 번짐 없이 갈라서 쓴다 */
    if (!mono) ctx.filter = blurOf(px);
    ctx.fillText(e.replacement, m.actualBoundingBoxLeft, 0);
    ctx.restore();

    if (mono) {
      const top = Math.min(r.y, baseline - m.actualBoundingBoxAscent - 2);
      const bottom = Math.max(r.y + r.h, baseline + m.actualBoundingBoxDescent + 2);
      const zone = clampTo({ x: Math.min(r.x, left - 2), y: top, w: Math.max(r.x + r.w, left + width + 2) - Math.min(r.x, left - 2), h: bottom - top }, W, H);
      const z = ctx.getImageData(zone.x, zone.y, zone.w, zone.h);
      for (let p = 0; p < z.data.length; p += 4) {
        const v = (z.data[p] * 299 + z.data[p + 1] * 587 + z.data[p + 2] * 114) / 1000 < 128 ? 0 : 255;
        z.data[p] = v; z.data[p + 1] = v; z.data[p + 2] = v;
      }
      ctx.putImageData(z, zone.x, zone.y);
    }
    out.set(e.id, { ink, problem: null });
  }
  return out;
}

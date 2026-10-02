'use client';

/**
 * 사진 한 장을 서식에 넣을 꼴로 굽는다 — 방향을 바로 하고, 긴 변 1600px JPEG 로. [브라우저 전용]
 *
 * ★왜 줄이나★ 휴대폰 원본은 한 장에 5~10MB 다. 거점 셋에 일곱 장씩이면 워드 하나가 150MB 를
 * 넘어 메일로도 접수 ZIP 으로도 못 보낸다(접수 상한 lib/claude-chunked). 서식 칸은 가로 9cm
 * 남짓이라 1600px 이면 인쇄해도 흐리지 않다.
 *
 * ★방향★ 휴대폰은 픽셀을 옆으로 눕힌 채 저장하고 EXIF 에 「돌려 보라」고만 적는다. 그대로
 * 워드에 넣으면 사진이 누워 들어간다. createImageBitmap 의 imageOrientation 이 그것을 읽어 세운다.
 */
import type { PreparedImage } from './docx-kit';
import { annotBounds, drawAnnots, type Annot, type NumStyle } from './annot';
import { collageTiles, crop } from './fit';

const LONG_EDGE = 1600;
const QUALITY = 0.85;

async function bitmapOf(file: File): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) {
    throw new Error(`${file.name} — 사진을 읽지 못했습니다. JPG·PNG 로 다시 올려주세요(아이폰 HEIC 는 설정에서 「호환성 우선」).`);
  }
  return bmp;
}

/**
 * 사진 → 바로 세우고 긴 변 longEdge 안으로 줄인 판(흰 바탕). 임시 저장(use-draft)도 이것으로 줄여 올린다.
 */
export async function canvasOf(file: File, longEdge = LONG_EDGE): Promise<HTMLCanvasElement> {
  const bmp = await bitmapOf(file);
  const scale = Math.min(1, longEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 그릴 수 없습니다 — 다른 브라우저에서 다시 해주세요.');
  // JPEG 는 투명을 모른다 — PNG 의 빈 자리가 검게 나오지 않게 흰 바탕을 깐다
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas;
}

async function jpegOf(canvas: HTMLCanvasElement, name: string): Promise<PreparedImage> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob) throw new Error(`${name} — 사진을 굽지 못했습니다.`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

/**
 * @param bake 표시를 사진에 굽는가 — 워드 서식은 굽고(true), 엑셀은 굽지 않고 표시를 실어 보낸다(false —
 *             xlsx-kit 이 엑셀 도형으로 얹어 엑셀에서 다시 고칠 수 있게 한다)
 */
export async function prepareImage(file: File, marks: Annot[] = [], style: NumStyle = 'red', bake = true): Promise<PreparedImage> {
  const canvas = await canvasOf(file);
  const { width, height } = canvas;
  // 사진 위 표시를 합쳐 굽는다 — 미리보기와 같은 함수다(lib/survey/annot)
  if (marks.length && bake) drawAnnots(canvas.getContext('2d')!, width, height, marks, style);
  const out = await jpegOf(canvas, file.name);
  const focus = annotBounds(marks, width, height);
  return {
    ...out,
    ...(focus ? { focus } : {}),
    ...(!bake && marks.length ? { marks, markStyle: style } : {}),
  };
}

/**
 * 여러 장을 한 장으로 — 서식 칸이 하나뿐인데 사진이 여러 장인 자리(현대엔지니어링 선로 인입경로·설치 위치,
 * SK·나이스 설치 예정 주차면). ★칸 모양(aspect) 그대로 짓는다★ — 칸에 넣을 때 다시 잘리지 않게. 칸을 장 수만큼
 * 나누고(lib/survey/fit collageTiles), 장마다 그 조각 모양으로 자른다(표시가 남게 창을 옮긴다). 표시는 먼저 굽는다.
 */
export async function prepareCollage(items: Array<{ file: File; marks: Annot[] }>, style: NumStyle = 'red', aspect = 4 / 3): Promise<PreparedImage> {
  if (items.length === 1) return prepareImage(items[0].file, items[0].marks, style);
  const W = aspect >= 1 ? LONG_EDGE : Math.round(LONG_EDGE * aspect);
  const H = aspect >= 1 ? Math.round(LONG_EDGE / aspect) : LONG_EDGE;
  const tiles = collageTiles(items.length, W, H, 8);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 그릴 수 없습니다 — 다른 브라우저에서 다시 해주세요.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  for (const [i, it] of items.entries()) {
    const t = tiles[i];
    // 표시는 사진 크기 기준이라 사진만 한 판에 굽고, 그 판을 조각 모양으로 잘라 옮긴다
    const tile = await canvasOf(it.file);
    const pw = tile.width; const ph = tile.height;
    if (it.marks.length) drawAnnots(tile.getContext('2d')!, pw, ph, it.marks, style);
    const w = crop(pw / ph, t.w / t.h, annotBounds(it.marks, pw, ph) ?? undefined);
    const sx = w.l * pw; const sy = w.t * ph;
    const sw = pw * (1 - w.l - w.r); const sh = ph * (1 - w.t - w.b);
    ctx.drawImage(tile, sx, sy, sw, sh, t.x, t.y, t.w, t.h);
  }
  return jpegOf(canvas, items[0].file.name);
}

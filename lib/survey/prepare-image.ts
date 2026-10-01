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

const LONG_EDGE = 1600;
const QUALITY = 0.85;

async function bitmapOf(file: File): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) {
    throw new Error(`${file.name} — 사진을 읽지 못했습니다. JPG·PNG 로 다시 올려주세요(아이폰 HEIC 는 설정에서 「호환성 우선」).`);
  }
  return bmp;
}

async function jpegOf(canvas: HTMLCanvasElement, name: string): Promise<PreparedImage> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob) throw new Error(`${name} — 사진을 굽지 못했습니다.`);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

export async function prepareImage(file: File, marks: Annot[] = [], style: NumStyle = 'red'): Promise<PreparedImage> {
  const bmp = await bitmapOf(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 그릴 수 없습니다 — 다른 브라우저에서 다시 해주세요.');
  // JPEG 는 투명을 모른다 — PNG 의 빈 자리가 검게 나오지 않게 흰 바탕을 깐다
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  // 사진 위 표시를 합쳐 굽는다 — 미리보기와 같은 함수다(lib/survey/annot)
  if (marks.length) drawAnnots(ctx, width, height, marks, style);
  const out = await jpegOf(canvas, file.name);
  const focus = annotBounds(marks);
  return focus ? { ...out, focus } : out;
}

/**
 * 여러 장을 한 장으로 — 서식 칸이 하나뿐인데 사진이 여러 장인 자리(현대엔지니어링 「선로 인입경로」).
 * 제출본들이 워드 칸 하나에 사진을 바둑판으로 붙인 꼴 그대로다. 칸마다 4:3, 사진은 잘리지 않게
 * 가운데 넣고(표시가 가장자리에 있어도 남는다) 남는 자리는 흰색이다. 장마다 표시를 먼저 굽는다.
 */
export async function prepareCollage(items: Array<{ file: File; marks: Annot[] }>, style: NumStyle = 'red'): Promise<PreparedImage> {
  if (items.length === 1) return prepareImage(items[0].file, items[0].marks, style);
  const cols = Math.ceil(Math.sqrt(items.length));
  const rows = Math.ceil(items.length / cols);
  const gap = 8;
  const tw = Math.floor((LONG_EDGE - gap * (cols - 1)) / cols);
  const th = Math.round((tw * 3) / 4);
  const canvas = document.createElement('canvas');
  canvas.width = tw * cols + gap * (cols - 1);
  canvas.height = th * rows + gap * (rows - 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('사진을 그릴 수 없습니다 — 다른 브라우저에서 다시 해주세요.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, it] of items.entries()) {
    const bmp = await bitmapOf(it.file);
    const s = Math.min(tw / bmp.width, th / bmp.height);
    const w = Math.round(bmp.width * s); const h = Math.round(bmp.height * s);
    // 표시는 사진 크기 기준이라 사진만 한 판에 굽고 바둑판 칸에 옮긴다
    const tile = document.createElement('canvas');
    tile.width = w; tile.height = h;
    const tc = tile.getContext('2d');
    if (!tc) throw new Error('사진을 그릴 수 없습니다 — 다른 브라우저에서 다시 해주세요.');
    tc.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    if (it.marks.length) drawAnnots(tc, w, h, it.marks, style);
    const x = (i % cols) * (tw + gap) + Math.round((tw - w) / 2);
    const y = Math.floor(i / cols) * (th + gap) + Math.round((th - h) / 2);
    ctx.drawImage(tile, x, y);
  }
  return jpegOf(canvas, items[0].file.name);
}

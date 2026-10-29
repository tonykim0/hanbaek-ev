'use client';

/**
 * 서류 문구 수정 — 올린 서류를 쪽 그림으로 열고, 고친 쪽만 바꿔 끼운 PDF 로 다시 묶는다. [브라우저 전용]
 *
 * ★같은 해상도★ — 스캔 PDF 의 쪽은 보통 그림 한 장이다. 그 그림의 화소 수를 pdf-lib 로 읽어(nativeOf) 그 배율로
 * 굽고, 고친 쪽도 그 화소 수 그대로 다시 넣는다. 못 읽으면(벡터 PDF 등) 300dpi 로 굽는다.
 * ★고치지 않은 쪽은 원본 그대로★ 둔다 — 다시 구우면 화질만 잃는다.
 * ★흑백(1비트) 스캔은 흑백으로★ — 그림이 1비트(CCITT·JBIG2·ImageMask)면 고친 쪽을 PNG 흑백으로 넣는다.
 */
import { PDFBool, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, type PDFArray } from 'pdf-lib';
import { openPdf } from '@/lib/pdf-render';
import { grayOf } from './ink';
import type { Raster } from './paint';

export interface PageInfo {
  /** 보이는 그대로의 크기(pt) */
  ptW: number;
  ptH: number;
  /** 원본 해상도 — pt 하나에 화소 몇 개 */
  pxPerPt: number;
  /** 1비트 스캔인가 */
  mono: boolean;
}

export interface OpenedDoc {
  name: string;
  kind: 'pdf' | 'image';
  /** 원본 바이트 — PDF 를 다시 묶을 때 */
  bytes: ArrayBuffer;
  pages: PageInfo[];
  /** 그 쪽을 그 배율로 — 1부터 */
  render(n: number, pxPerPt: number): Promise<Raster>;
  close(): void;
}

/** 300dpi — 원본 그림을 못 읽을 때 */
const DEFAULT_PX_PER_PT = 300 / 72;
/* 원본이라도 이 밖으로는 굽지 않는다 — 너무 크면 브라우저가 말없이 빈 그림을 준다(PhotoScanner FULL_AREA) */
const MIN_PX_PER_PT = 150 / 72;
const MAX_PX_PER_PT = 400 / 72;
const MAX_AREA = 12_000_000;
/** 열 수 있는 쪽 수 — 판독에 보낼 수 있는 만큼 */
export const MAX_PAGES = 12;

const MONO_FILTERS = new Set(['CCITTFaxDecode', 'JBIG2Decode']);

/** 그 쪽에 깔린 가장 큰 그림의 크기와 1비트 여부 — 스캔이 아니면 null */
function nativeOf(doc: PDFDocument, index: number): { w: number; h: number; mono: boolean } | null {
  const page = doc.getPage(index);
  const xo = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xo) return null;
  let best: { w: number; h: number; mono: boolean } | null = null;
  for (const [, v] of xo.entries()) {
    const obj = v instanceof PDFRef ? doc.context.lookup(v) : v;
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    const w = d.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber() ?? 0;
    const h = d.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber() ?? 0;
    if (!best || w * h > best.w * best.h) {
      const bits = d.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber();
      const mask = d.lookupMaybe(PDFName.of('ImageMask'), PDFBool)?.asBoolean() ?? false;
      const f = d.get(PDFName.of('Filter'));
      const filters = f instanceof PDFName ? [f.decodeText()]
        : f && 'asArray' in f ? (f as PDFArray).asArray().map((x) => (x instanceof PDFName ? x.decodeText() : '')) : [];
      best = { w, h, mono: bits === 1 || mask || filters.some((x) => MONO_FILTERS.has(x)) };
    }
  }
  return best;
}

const clampScale = (s: number, ptW: number, ptH: number) => {
  const byArea = Math.sqrt(MAX_AREA / (ptW * ptH));
  return Math.min(MAX_PX_PER_PT, byArea, Math.max(MIN_PX_PER_PT, s));
};

async function openPdfDoc(file: File): Promise<OpenedDoc> {
  const bytes = await file.arrayBuffer();
  let lib: PDFDocument | null = null;
  try { lib = await PDFDocument.load(bytes.slice(0), { ignoreEncryption: true }); } catch { /* 해상도는 300dpi 로 */ }
  const pdf = await openPdf(bytes.slice(0)); // pdf.js 는 받은 버퍼를 비운다
  if (pdf.total > MAX_PAGES) {
    pdf.close();
    throw new Error(`${MAX_PAGES}쪽까지 받습니다 — 고칠 쪽만 떼어 올려 주세요(PDF 분류·분할).`);
  }
  const pages: PageInfo[] = [];
  for (let n = 1; n <= pdf.total; n += 1) {
    const { width: ptW, height: ptH } = await pdf.sizeOf(n);
    const native = lib ? nativeOf(lib, n - 1) : null;
    /* 그림이 쪽을 돌려 깔았을 수 있다 — 긴 변끼리 견준다 */
    const raw = native ? Math.max(native.w, native.h) / Math.max(ptW, ptH) : DEFAULT_PX_PER_PT;
    pages.push({ ptW, ptH, pxPerPt: clampScale(raw, ptW, ptH), mono: native?.mono ?? false });
  }
  return {
    name: file.name, kind: 'pdf', bytes, pages,
    async render(n, pxPerPt) {
      const r = await pdf.render(n, pxPerPt);
      return { ...r, gray: grayOf(r) };
    },
    close: () => pdf.close(),
  };
}

/** 그림 파일 — 한 쪽짜리. 300dpi 스캔으로 보고 쪽 크기를 정한다 */
async function openImageDoc(file: File): Promise<OpenedDoc> {
  const bytes = await file.arrayBuffer();
  const bmp = await createImageBitmap(new Blob([bytes], { type: file.type }));
  const scale = Math.min(1, Math.sqrt(MAX_AREA / (bmp.width * bmp.height)));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('그림판을 만들지 못했습니다.');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const full = ctx.getImageData(0, 0, w, h);
  const page: PageInfo = { ptW: w / DEFAULT_PX_PER_PT, ptH: h / DEFAULT_PX_PER_PT, pxPerPt: DEFAULT_PX_PER_PT, mono: false };
  return {
    name: file.name, kind: 'image', bytes, pages: [page],
    async render(_n, pxPerPt) {
      if (Math.abs(pxPerPt - DEFAULT_PX_PER_PT) < 1e-6) {
        return { width: w, height: h, data: full.data, gray: grayOf(full) };
      }
      const k = pxPerPt / DEFAULT_PX_PER_PT;
      const c2 = document.createElement('canvas');
      c2.width = Math.max(1, Math.round(w * k)); c2.height = Math.max(1, Math.round(h * k));
      const x2 = c2.getContext('2d');
      if (!x2) throw new Error('그림판을 만들지 못했습니다.');
      x2.drawImage(cv, 0, 0, c2.width, c2.height);
      const img = x2.getImageData(0, 0, c2.width, c2.height);
      return { width: img.width, height: img.height, data: img.data, gray: grayOf(img) };
    },
    close: () => undefined,
  };
}

export async function openDoc(file: File): Promise<OpenedDoc> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return openPdfDoc(file);
  if (/^image\/(jpeg|png|webp)$/.test(file.type)) return openImageDoc(file);
  throw new Error('PDF 나 그림(JPG·PNG)만 받습니다.');
}

const blobOf = (cv: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('그림을 만들지 못했습니다.'))), type, q));

/**
 * 고친 쪽(canvas)을 끼워 PDF 로 — PDF 는 그 쪽만 바꾸고 나머지는 원본 그대로, 그림은 한 쪽짜리 PDF 로.
 */
export async function buildPdf(doc: OpenedDoc, edited: Map<number, HTMLCanvasElement>): Promise<Blob> {
  const out = doc.kind === 'pdf'
    ? await PDFDocument.load(doc.bytes.slice(0), { ignoreEncryption: true })
    : await PDFDocument.create();
  const pages = [...edited.entries()].sort((a, b) => a[0] - b[0]);
  for (const [n, cv] of pages) {
    const info = doc.pages[n - 1];
    const img = info.mono
      ? await out.embedPng(await (await blobOf(cv, 'image/png')).arrayBuffer())
      : await out.embedJpg(await (await blobOf(cv, 'image/jpeg', 0.92)).arrayBuffer());
    if (doc.kind === 'pdf') out.removePage(n - 1);
    const page = out.insertPage(doc.kind === 'pdf' ? n - 1 : out.getPageCount(), [info.ptW, info.ptH]);
    page.drawImage(img, { x: 0, y: 0, width: info.ptW, height: info.ptH });
  }
  const bytes = await out.save();
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

/** 판독에 보낼 쪽 그림 — 긴 변 longSide 의 JPEG(base64) */
export async function previewJpeg(doc: OpenedDoc, n: number, longSide: number, quality: number) {
  const info = doc.pages[n - 1];
  const r = await doc.render(n, longSide / Math.max(info.ptW, info.ptH));
  const cv = document.createElement('canvas');
  cv.width = r.width; cv.height = r.height;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('그림판을 만들지 못했습니다.');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  const b = await blobOf(cv, 'image/jpeg', quality);
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { image: btoa(bin), width: r.width, height: r.height };
}

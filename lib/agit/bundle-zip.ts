/**
 * 첨부 zip 을 짓는다 — 계획(lib/agit/bundle)대로 엑셀 · 거래명세서 PDF · 세금계산서를 한 폴더에 담는다. 승인 때는 그 zip 과 엑셀 캡처를
 * Blob 에 올려 아지트 글의 그림 · 고리로 쓴다(publishAgitFiles).
 * 거래명세서 PDF 와 계산서 파일을 받는 손은 부르는 쪽이 준다(라우트는 서버 브라우저 · Blob, 시험은 가짜) — 이 파일은 묶기만 한다.
 * 하나라도 못 받으면 던진다 — 빠진 zip 을 받아 아지트에 올리면 재무가 다시 묻는다.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { put } from '@vercel/blob';
import { ourBlobPathname } from '@/lib/intake-stage';
import type { AgitBundlePlan } from './bundle';
import { purchaseXlsx } from './purchase-xlsx';
import { purchaseHtml } from './purchase-image';

/**
 * 구매요청간소화 엑셀의 틀 — 한백이 쓰던 엑셀에서 값만 걷은 것(scripts/agit-purchase-template.ts). 저장소의 파일이고, 운영에서는
 * next.config 의 outputFileTracingIncludes 가 첨부 zip 라우트에 싣는다.
 */
export const PURCHASE_TEMPLATE = 'lib/agit/purchase-template.xlsx';
let template: Promise<Uint8Array> | null = null;
export const purchaseTemplate = (): Promise<Uint8Array> =>
  (template ??= readFile(join(process.cwd(), PURCHASE_TEMPLATE)).then((b) => new Uint8Array(b)).catch((e) => {
    template = null;
    throw e;
  }));

export interface AgitFileHands {
  /** 거래명세서 PDF(paths 와 같은 차례로)와 엑셀 캡처(html) — 서버 브라우저 한 번 */
  render(input: { paths: string[]; html: string }): Promise<{ pdfs: Uint8Array[]; image: Uint8Array | null }>;
  /** 세금계산서 파일 — 우리 Blob 주소만 온다 */
  file(url: string): Promise<Uint8Array>;
}

/** 첨부 zip 과 그 안의 엑셀 캡처 — 승인 때는 둘 다 쓴다(캡처는 글의 구매 내역 그림, zip 은 첨부 파일 고리) */
export async function agitFilesOf(plan: AgitBundlePlan, hands: AgitFileHands): Promise<{ zip: Uint8Array; image: Uint8Array }> {
  const zip = new JSZip();
  const dir = zip.folder(plan.folder)!;
  const xlsx = await purchaseXlsx(plan.sheet, await purchaseTemplate());
  dir.file(plan.xlsxName, xlsx);
  /* 캡처는 방금 채운 엑셀 그대로 그린다 — 엑셀과 그림의 모양이 갈리지 않게 */
  const { pdfs, image } = await hands.render({ paths: plan.statements.map((s) => s.path), html: await purchaseHtml(xlsx) });
  if (pdfs.length !== plan.statements.length) throw new Error('거래명세서를 다 만들지 못했습니다.');
  if (!image) throw new Error('엑셀 캡처를 만들지 못했습니다.');
  dir.file(plan.imageName, image);
  plan.statements.forEach((s, i) => dir.file(s.name, pdfs[i]));
  for (const inv of plan.invoices) {
    if (!ourBlobPathname(inv.url)) throw new Error(`세금계산서 주소가 콘솔 저장소가 아닙니다 — ${inv.name}`);
    dir.file(inv.name, await hands.file(inv.url));
  }
  return { zip: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), image };
}

export async function agitZipOf(plan: AgitBundlePlan, hands: AgitFileHands): Promise<Uint8Array> {
  return (await agitFilesOf(plan, hands)).zip;
}

/**
 * 승인 때 — 엑셀 캡처 · 첨부 zip 을 Blob 에 올리고 그 주소를 준다(글의 구매 내역 그림 · 첨부 파일 고리 — lib/agit/post fillAgitFiles).
 * 자리는 agit-posts/<결제일>/<무작위>/<이름> — 주소를 아는 사람만 연다(세금계산서 파일과 같은 공개 · 짐작할 수 없는 주소). 아지트를 보는
 * 사람의 브라우저가 그림을 그 주소에서 바로 불러오므로 로그인이 필요한 자리에 둘 수 없다. 올린 것은 지우지 않는다 — 아지트 글이 가리킨다.
 */
export async function publishAgitFiles(
  plan: AgitBundlePlan,
  files: { zip: Uint8Array; image: Uint8Array },
  payDate: string
): Promise<{ image: string; zip: string }> {
  const dir = `agit-posts/${payDate}/${crypto.randomUUID()}`;
  const imageBytes = Buffer.from(files.image);
  const zipBytes = Buffer.from(files.zip);
  const [image, zip] = await Promise.all([
    put(`${dir}/${plan.imageName}`, imageBytes, { access: 'public', contentType: 'image/png', addRandomSuffix: false }),
    put(`${dir}/${plan.zipName}`, zipBytes, { access: 'public', contentType: 'application/zip', addRandomSuffix: false }),
  ]);
  return { image: image.url, zip: zip.url };
}

/** 우리 Blob 의 파일 하나를 받는다 — 콘솔 저장소 주소만(ourBlobPathname) */
export async function fetchOurBlob(url: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  if (!ourBlobPathname(url)) throw new Error('콘솔 저장소의 파일이 아닙니다.');
  const res = await fetcher(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`세금계산서 파일을 받지 못했습니다(${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * 첨부 zip 을 짓는다 — 계획(lib/agit/bundle)대로 엑셀 · 엑셀 캡처 · 거래명세서 PDF · 세금계산서를 한 폴더에 담는다. Claude Code 가 이 zip 을
 * 받아(app/api/agit/posts/[id]/files) 아지트 쓰는 칸에 진짜 첨부 파일로 붙이고, 안의 캡처를 본문 그림으로 올린다(scripts/agit-post.ts —
 * 한백 2026-11-09 「첨부파일은 링크가 아니라 첨부파일로」).
 * 거래명세서 PDF 와 계산서 파일을 받는 손은 부르는 쪽이 준다(라우트는 서버 브라우저 · Blob, 시험은 가짜) — 이 파일은 묶기만 한다.
 * 하나라도 못 받으면 던진다 — 빠진 zip 을 받아 아지트에 올리면 재무가 다시 묻는다.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { ourBlobPathname } from '@/lib/intake-stage';
import type { AgitBundlePlan } from './bundle';
import type { AgitFeePlan } from './fee';
import { purchaseXlsx } from './purchase-xlsx';
import { purchaseHtml } from './purchase-image';
import { readBlob } from '@/lib/blob/server';

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

/** 첨부 zip 과 그 안의 엑셀 캡처 — 캡처는 zip 안에도 든다(Claude Code 가 꺼내 글의 구매 내역 그림으로 올린다) */
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
 * 위탁운영수수료 글의 첨부(lib/agit/fee) — 한백의 5차 zip 그대로 폴더 없이 엑셀과 플러그링크 세금계산서 둘. 엑셀 캡처는 글의 구매 내역 그림으로만
 * 쓰고 zip 에는 넣지 않는다(5차 zip 에도 없었다). 거래명세서는 없다 — 서버 브라우저는 캡처 하나만 그린다.
 */
export async function agitFeeFilesOf(plan: AgitFeePlan, hands: AgitFileHands): Promise<{ zip: Uint8Array; image: Uint8Array }> {
  if (!ourBlobPathname(plan.invoice.url)) throw new Error(`세금계산서 주소가 콘솔 저장소가 아닙니다 — ${plan.invoice.name}`);
  const zip = new JSZip();
  const xlsx = await purchaseXlsx(plan.sheet, await purchaseTemplate());
  zip.file(plan.xlsxName, xlsx);
  const { image } = await hands.render({ paths: [], html: await purchaseHtml(xlsx) });
  if (!image) throw new Error('엑셀 캡처를 만들지 못했습니다.');
  zip.file(plan.invoice.name, await hands.file(plan.invoice.url));
  return { zip: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), image };
}

/** 우리 Blob 의 파일 하나를 받는다 — 콘솔 저장소 주소만(ourBlobPathname). 비공개 저장소라 SDK 로 읽는다(lib/blob/server) */
export async function fetchOurBlob(url: string): Promise<Uint8Array> {
  if (!ourBlobPathname(url)) throw new Error('콘솔 저장소의 파일이 아닙니다.');
  const buf = await readBlob(url).catch(() => null);
  if (!buf) throw new Error('세금계산서 파일을 받지 못했습니다.');
  return new Uint8Array(buf);
}

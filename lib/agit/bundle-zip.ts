/**
 * 첨부 zip 을 짓는다 — 계획(lib/agit/bundle)대로 엑셀 · 거래명세서 PDF · 세금계산서를 한 폴더에 담는다.
 * 거래명세서 PDF 와 계산서 파일을 받는 손은 부르는 쪽이 준다(라우트는 서버 브라우저 · Blob, 시험은 가짜) — 이 파일은 묶기만 한다.
 * 하나라도 못 받으면 던진다 — 빠진 zip 을 받아 아지트에 올리면 재무가 다시 묻는다.
 */
import JSZip from 'jszip';
import { ourBlobPathname } from '@/lib/intake-stage';
import type { AgitBundlePlan } from './bundle';
import { purchaseXlsx } from './purchase-xlsx';
import { purchaseHtml } from './purchase-image';

export async function agitZipOf(
  plan: AgitBundlePlan,
  hands: {
    /** 거래명세서 PDF(paths 와 같은 차례로)와 엑셀 캡처(html) — 서버 브라우저 한 번 */
    render(input: { paths: string[]; html: string }): Promise<{ pdfs: Uint8Array[]; image: Uint8Array | null }>;
    /** 세금계산서 파일 — 우리 Blob 주소만 온다 */
    file(url: string): Promise<Uint8Array>;
  }
): Promise<Uint8Array> {
  const zip = new JSZip();
  const dir = zip.folder(plan.folder)!;
  dir.file(plan.xlsxName, await purchaseXlsx(plan.sheet));
  const { pdfs, image } = await hands.render({ paths: plan.statements.map((s) => s.path), html: purchaseHtml(plan.sheet) });
  if (pdfs.length !== plan.statements.length) throw new Error('거래명세서를 다 만들지 못했습니다.');
  if (!image) throw new Error('엑셀 캡처를 만들지 못했습니다.');
  dir.file(plan.imageName, image);
  plan.statements.forEach((s, i) => dir.file(s.name, pdfs[i]));
  for (const inv of plan.invoices) {
    if (!ourBlobPathname(inv.url)) throw new Error(`세금계산서 주소가 콘솔 저장소가 아닙니다 — ${inv.name}`);
    dir.file(inv.name, await hands.file(inv.url));
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** 우리 Blob 의 파일 하나를 받는다 — 콘솔 저장소 주소만(ourBlobPathname) */
export async function fetchOurBlob(url: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  if (!ourBlobPathname(url)) throw new Error('콘솔 저장소의 파일이 아닙니다.');
  const res = await fetcher(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`세금계산서 파일을 받지 못했습니다(${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

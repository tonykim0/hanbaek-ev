/**
 * 넘긴 세금계산서를 읽는다 — 위탁운영수수료 글(lib/agit/fee)의 재료. [서버 전용]
 * (한백 2026-11-10 「이건은 내가 에이전트한테 세금계산서를 올려주고 너가 나머지를 처리해주는 방식으로 진행 필요」)
 *
 * ★금액은 콘솔이 읽는다 — 정산 담당이 옮겨 적지 않는다★(열린구매 글과 같은 원칙). 담당은 넘긴 파일 중 어느 것이 위탁운영수수료 · 충전매출
 * 세금계산서인지만 고르고(agit_fee_post), 콘솔이 그 파일을 판독에 보내 공급자 · 공급받는자 · 작성일자 · 공급가액 · 세액 · 합계 · 품목 · 몇 월분을
 * JSON 으로 받는다(lib/vision-ask askPdfJson — 기본 모델 Opus: 돈을 옮겨 적는 자리라 가장 정확한 모델로, 달에 두 장이라 값은 작다).
 * 맞는지는 코드가 가른다(lib/agit/fee feeInvoicesOf — 공급 방향 · 합계 = 공급가액 + 세액). 국세청 전자세금계산서 PDF 는 글자층이 있다.
 * PDF 만 받는다 — 지금까지 받은 세금계산서는 다 홈택스 PDF 였다.
 */
import { askPdfJson } from '@/lib/vision-ask';
import { fetchOurBlob } from './bundle-zip';
import type { AgitFeeFile, TaxInvoiceRead } from './fee';

/** 판독의 갈래(로그 · 모델 고르기 열쇠) */
export const FEE_INVOICE_TAG = 'agit-fee-invoice';

const PROMPT = [
  '이 PDF 는 한국 국세청 전자세금계산서다. 아래 칸을 읽어 JSON 하나로만 답한다(설명 없이).',
  '{',
  '  "supplier": 공급자 칸의 상호(법인명) 그대로,',
  '  "receiver": 공급받는자 칸의 상호(법인명) 그대로,',
  '  "issued": 작성일자 YYYY-MM-DD,',
  '  "supply": 공급가액 합계(숫자 — 쉼표 · 원 없이),',
  '  "vat": 세액 합계(숫자),',
  '  "total": 합계금액(숫자),',
  '  "item": 품목 칸 첫 줄의 글 그대로,',
  '  "month": 품목에 「N월분」이 있으면 그 달을 YYYY-MM 으로(해는 작성일자의 해 — 작성일자가 1월인데 12월분이면 앞 해), 없으면 null',
  '}',
  '못 읽은 칸은 null 이다. 세금계산서가 아니면 {"error": "세금계산서 아님"} 으로 답한다.',
].join('\n');

const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** 숫자 — 판독이 「12,345,678」처럼 글로 줘도 받는다 */
const numOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,\s원]/g, '')) : NaN;
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 판독의 답 → 읽은 것(모양이 틀린 칸은 null) [순수] */
export function taxInvoiceReadOf(raw: unknown): TaxInvoiceRead {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const issued = textOf(o.issued);
  const month = textOf(o.month);
  return {
    supplier: textOf(o.supplier),
    receiver: textOf(o.receiver),
    issued: issued && DAY_RE.test(issued) ? issued : null,
    supply: numOf(o.supply),
    vat: numOf(o.vat),
    total: numOf(o.total),
    item: textOf(o.item),
    month: month && MONTH_RE.test(month) ? month : null,
  };
}

/** 넘긴 파일 하나(우리 Blob)를 읽는다 — 세금계산서가 아니면 · PDF 가 아니면 사람 말로 던진다 */
export async function readTaxInvoice(file: AgitFeeFile): Promise<TaxInvoiceRead> {
  if (!/\.pdf$/i.test(file.name)) throw new Error(`${file.name} — 세금계산서는 PDF 로 올려 주세요(홈택스에서 받은 그대로).`);
  return readTaxInvoiceBytes(file.name, await fetchOurBlob(file.url));
}

/** PDF 바이트를 판독에 보낸다 — 파일을 받는 길과 따로(실제 세금계산서로 견줄 때 맥의 파일을 바로 넣는다) */
export async function readTaxInvoiceBytes(name: string, bytes: Uint8Array): Promise<TaxInvoiceRead> {
  const raw = await askPdfJson([{ name, buffer: Buffer.from(bytes), hash: '', mimeType: 'application/pdf' }], PROMPT, FEE_INVOICE_TAG);
  if (raw && typeof raw === 'object' && 'error' in raw) throw new Error(`${name} 은 세금계산서로 읽히지 않습니다.`);
  return taxInvoiceReadOf(raw);
}

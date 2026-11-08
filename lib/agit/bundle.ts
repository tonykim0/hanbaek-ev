/**
 * 아지트 열린구매 글의 첨부 zip — 무엇을 어떤 이름으로 넣는가. [순수]
 * (한백 2026-11-08 「열린구매 글에는 거래명세서, 세금계산서 그리고 엑셀파일이 들어가야해」 → 「개별 파일로 하나의 zip으로 다운받아서 올려」)
 *
 * 모양은 한백이 아지트에 올려 온 zip 그대로다(26년 9월 2차 — 「26년 9월 영업위탁 수수료 2차.zip」):
 *   26년 10월 영업위탁 수수료 1차/
 *     구매요청간소화_전기차충전기 영업위탁수수료(26년 10월 1차 내역).xlsx   ← 구매요청간소화 양식(lib/agit/purchase-xlsx)
 *     구매요청간소화_전기차충전기 영업위탁수수료(26년 10월 1차 내역).png    ← 그 엑셀의 캡처 — 본문 가운데에 붙인다(lib/agit/purchase-image)
 *     에코일렉_거래명세서_영업비.pdf                                        ← 콘솔 거래명세서 화면 그대로(lib/agit/statement-pdf)
 *     에코일렉_세금계산서_영업비.pdf                                        ← 배치에 붙은 계산서(협력사가 낸 것)
 * 아지트 웹훅은 파일을 못 붙인다 — 한백이 정산 담당 카드에서 받아 그 글에 붙인다.
 */
import { itemNameOf, requestNameOf, sortBatches, statementPathOf, vatOf, type AgitBatch, type AgitPayee } from './post';
import type { PurchaseSheet } from './purchase-xlsx';

export interface AgitBundlePlan {
  /** 「26년 10월 영업위탁 수수료 1차.zip」 */
  zipName: string;
  /** zip 안의 폴더 — zip 이름에서 .zip 을 뗀 것 */
  folder: string;
  xlsxName: string;
  /** 엑셀 캡처 — 본문 「2. 지급요청 품목」 밑에 붙이고 파일로도 올린다 */
  imageName: string;
  sheet: PurchaseSheet;
  /** 배치마다 거래명세서 — 콘솔 주소(경로)와 넣을 이름 */
  statements: Array<{ name: string; path: string }>;
  /** 배치마다 붙은 세금계산서 — 없으면 빠진다(그 배치는 글에 「세금계산서 없음」) */
  invoices: Array<{ name: string; url: string }>;
}

/** 파일 이름에 못 쓰는 글자를 걷는다(/ \ : * ? " < > |) */
export const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 원래 파일의 확장자 — 없으면 pdf */
const extOf = (name: string): string => /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1]?.toLowerCase() ?? 'pdf';

export function agitBundleOf(
  payDate: string,
  batches: readonly AgitBatch[],
  payeeOf: (org: string | null) => AgitPayee | undefined
): AgitBundlePlan {
  const sorted = sortBatches(batches).filter((b) => b.org);
  const name = requestNameOf(payDate, sorted.map((b) => b.kind));
  const tail = name.round ?? `${payDate.slice(5, 7).replace(/^0/, '')}월 ${payDate.slice(8).replace(/^0/, '')}일 지급`;
  const folder = safeName(`${name.month} ${name.what} ${tail}`);
  /* 엑셀 이름 · 「내용」 칸은 지난 양식대로 붙여 쓴다 — 「영업위탁수수료」 */
  const tight = name.what.replace('영업위탁 수수료', '영업위탁수수료');
  /* 같은 지급처가 영업비 · 시공비 둘이면 이름 끝에 구분을 단다 — 하나면 지난 zip 처럼 지급처 이름만 */
  const twice = (org: string) => sorted.filter((b) => b.org === org).length > 1;
  const label = (b: AgitBatch) => safeName(`${b.org}${twice(b.org!) ? `_${b.kind}` : ''}`);
  return {
    zipName: `${folder}.zip`,
    folder,
    xlsxName: `${safeName(`구매요청간소화_전기차충전기 ${tight}(${name.month} ${tail} 내역)`)}.xlsx`,
    imageName: `${safeName(`구매요청간소화_전기차충전기 ${tight}(${name.month} ${tail} 내역)`)}.png`,
    sheet: {
      subject: name.subject,
      content: ` 전기차 충전 인프라 구축사업 ${tight}`,
      rows: sorted.map((b) => {
        const payee = payeeOf(b.org);
        return {
          content: `${name.month} 전기차 충전 인프라 구축사업 (${itemNameOf(b.kind, b.lines)})`,
          org: b.org!,
          supply: b.total,
          vat: vatOf(b.total),
          bank: payee?.bankName ?? '',
          account: payee?.bankAccountNo ?? '',
          holder: payee?.bankHolder ?? '',
          note: b.invoice ? '' : '세금계산서 없음',
        };
      }),
    },
    statements: sorted.map((b) => ({ name: `${label(b)}_거래명세서.pdf`, path: statementPathOf(payDate, b.org!, b.kind) })),
    invoices: sorted.filter((b) => b.invoiceFile).map((b) => ({
      name: `${label(b)}_세금계산서.${extOf(b.invoiceFile!.name)}`,
      url: b.invoiceFile!.url,
    })),
  };
}

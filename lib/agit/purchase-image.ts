/**
 * 구매요청간소화 엑셀의 캡처 — 아지트 글 본문 「2. 지급요청 품목」 밑에 붙이고 파일로도 올리는 그림. [순수 — HTML 만 짓는다]
 * (한백 2026-11-08 「중간에 엑셀파일 스크린샷 찍은것도 파일로 올려야해」 — 지난 글들이 엑셀을 캡처해 본문 가운데에 넣었다.
 *  양식의 「1. 양식 빈칸 없이 채워주세요 2. 본문 캡쳐 및 파일 필수 업로드」가 그것이다.)
 *
 * 엑셀(lib/agit/purchase-xlsx)과 같은 모형(PurchaseSheet)으로 같은 칸 자리를 HTML 표로 그리고, 서버 브라우저가 찍는다(lib/agit/statement-pdf).
 * 지난 캡처처럼 머리(구분 · 요청간 · 구매번호 · 내용 / 공사명)부터 소계 줄까지다 — 특기 사항은 빈 칸이라 넣지 않는다.
 * 글꼴은 콘솔과 같은 Pretendard(CDN) — 서버(리눅스)에는 한글 글꼴이 없다.
 */
import type { PurchaseSheet } from './purchase-xlsx';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n: number): string => n.toLocaleString('ko-KR');

/** 엑셀 열 폭(C~N, 글자 수) — 양식의 1행 값. 그림에서는 글자 하나를 7.5px 로 본다 */
const WIDTHS = [8, 30, 20, 15, 15, 15, 10, 20, 20, 20, 15, 15];

export function purchaseHtml(sheet: PurchaseSheet): string {
  const td = (v: string | number, cls = '', span = 1) =>
    `<td class="${cls}"${span > 1 ? ` colspan="${span}"` : ''}>${esc(typeof v === 'number' ? money(v) : v)}</td>`;
  const supply = sheet.rows.reduce((n, r) => n + r.supply, 0);
  const vat = sheet.rows.reduce((n, r) => n + r.vat, 0);
  const rows = sheet.rows.map((r, i) => `<tr>${[
    td(i + 1, 'c'), td(r.content, 'l'), td(r.org, 'c'), td(r.supply, 'n'), td(r.vat, 'n'), td(r.supply + r.vat, 'n b'),
    td(r.bank || '-', 'c'), td(r.account || '-', 'c'), td(r.holder || '-', 'c'), td('-', 'c'), td('㈜한백', 'c'), td(r.note, 'l'),
  ].join('')}</tr>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
  body { margin: 0; padding: 12px; background: #fff; font-family: 'Pretendard Variable', Pretendard, sans-serif; color: #111; }
  table { border-collapse: collapse; table-layout: fixed; font-size: 11px; }
  td { border: 1px solid #333; padding: 4px 5px; height: 22px; word-break: keep-all; overflow-wrap: anywhere; }
  .h { background: #f2f2f2; font-weight: 700; text-align: center; }
  .y { background: #fff2cc; font-weight: 700; text-align: center; }
  .c { text-align: center; } .l { text-align: left; } .n { text-align: right; font-variant-numeric: tabular-nums; }
  .b { font-weight: 700; } .s { background: #f2f2f2; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
  .note { font-size: 9px; color: #777; white-space: pre-line; }
</style></head><body>
<table id="sheet"><colgroup>${WIDTHS.map((w) => `<col style="width:${Math.round(w * 7.5)}px">`).join('')}</colgroup>
<tr>${td('구분', 'h')}${td('요청간', 'y')}${td('구매번호', 'h')}${td('', 'c', 2)}${td('내용', 'h')}${td(sheet.content, 'l b', 4)}${td('', 'c', 2)}</tr>
<tr>${td('공사명', 'h')}${td(sheet.subject, 'l', 4)}${td('세부 공사', 'h')}${td('', 'l', 4)}${td('', 'c', 2)}</tr>
<tr>${['No.', '내 용', '거래처', '공급가액', '세액', '입금액', '은행', '계좌번호', '예금주명', '연락처', '입금처', '비 고'].map((h) => td(h, 'h')).join('')}</tr>
${rows}
<tr>${td('소 계', 'h', 3)}${td(supply, 's')}${td(vat, 's')}${td(supply + vat, 's')}${td('1. 양식 빈칸 없이 채워주세요\n2. 본문 캡쳐 및 파일 필수 업로드', 'note', 2)}${td('필수사항', 'h')}${td('1.세금계산서 2.거래내역서 3. 각종 증빙자료 등', 'note', 3)}</tr>
</table></body></html>`;
}

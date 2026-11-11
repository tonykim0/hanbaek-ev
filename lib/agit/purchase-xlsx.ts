/**
 * 구매요청간소화 엑셀 — 한백이 열린구매에 올려 온 ★그 엑셀을 틀로★ 값만 채운다. [순수 — 틀(lib/agit/purchase-template.xlsx)은 부르는 쪽이 준다]
 * (한백 2026-11-08 「엑셀파일은 바탕화면에 있는 영업수수료 지급내역 폴더 참고필요」 → 「엑셀양식이 바뀐거같네? 기존에 쓰던 엑셀 양식을 그대로
 *  활용해줘」 — 첫 판은 칸 자리만 따라 새로 그려 글꼴 · 테두리 · 위 안내 줄 · 수식 · 거래처정보 시트가 달랐다.)
 * 틀은 scripts/agit-purchase-template.ts 가 지난 엑셀에서 값만 걷어 지었다 — 모양(글꼴 · 테두리 · 채움 · 열 폭 · 줄 높이 · 합친 칸 · 수식 ·
 * 고르는 칸 · 입금처 조건부 서식)은 틀의 것 그대로다.
 *
 * 채우는 칸(시트 「구매(일반)」): 내용 I5 · 공사명 D6 · 구매번호 머리의 해 E4(F5 =D5&E4&"-"&F4&"-"&G4 → 「요청간2026--」, 뒤는 구매팀이 적는다) ·
 * 지급 줄 — 8행부터 배치마다 한 줄, 8행의 칸 모양 그대로: No. · 내 용 · 거래처 · 공급가액 · 세액(=F*0.1) · 입금액(=SUM(F:G)) · 은행 · 계좌번호 ·
 * 예금주명 · 연락처(-) · 입금처(㈜한백) · 비 고. 소계 · 특기 사항 줄은 지급 줄 바로 밑으로 당기거나 민다(지난 엑셀도 줄 수만큼 넣고 지웠다) —
 * 소계 수식 · 합친 칸 · 입금처 조건부 서식이 따라간다.
 * 은행 · 계좌번호 · 예금주명은 값으로 적는다(지난 엑셀은 한백의 컴퓨터에만 있는 다른 파일의 거래처정보를 VLOOKUP 했다). 그 결제일의
 * 지급처는 「거래처정보」 시트에도 적는다(지난 엑셀처럼).
 * 수식 칸에는 미리 셈한 값을 같이 적는다 — 셈을 다시 하지 않는 미리보기(맥 훑어보기 · 아지트 · 캡처)도 같은 숫자를 보인다. 엑셀은 열 때
 * 다시 센다(틀의 fullCalcOnLoad).
 */
import JSZip from 'jszip';

export interface PurchaseRow {
  content: string;
  org: string;
  supply: number;
  vat: number;
  /**
   * 세액을 세금계산서 값 그대로 적는다(수식 =F*0.1 대신 값) — 위탁운영수수료 글(lib/agit/fee): 세금계산서의 세액이 10% 절사와 1원 다른 달이
   * 있다. 빼면 틀의 수식(열린구매 글 — 콘솔이 셈한 배치)
   */
  fixedVat?: boolean;
  bank: string;
  account: string;
  holder: string;
  note: string;
}

export interface PurchaseSheet {
  /** 공사명 — 「26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차」 */
  subject: string;
  /** 내용 — 「 전기차 충전 인프라 구축사업 영업위탁수수료」 */
  content: string;
  /** 구매번호 머리의 해(E4) — 결제일의 해 */
  year: number;
  /** 지은 날 YYYY-MM-DD — 틀의 =NOW()(M6)에 미리 셈한 값으로 적는다 */
  madeOn: string;
  rows: PurchaseRow[];
}

const SHEET = 'xl/worksheets/sheet1.xml';
const PARTNERS = 'xl/worksheets/sheet2.xml';
/** 틀의 자리 — scripts/agit-purchase-template.ts 가 지을 때 확인한다 */
const FIRST = 8;       // 지급 줄의 첫 행 — 그 행의 칸 모양이 지급 줄의 본이다
const FOOT = 14;       // 틀의 소계 행
const LAST_DATA = 13;  // 틀의 소계 수식이 닿는 마지막 지급 행(SUM(F8:F13))
const PARTNER_FIRST = 3;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** 세액 =F*0.1 의 미리 셈한 값 — 엑셀과 같은 곱셈, 떠도는 소수 자리만 걷는다 */
const tenth = (n: number): number => Math.round(n * 0.1 * 100) / 100;
/** 지급 줄의 세액 — 값으로 적는 줄은 그 값, 아니면 수식의 미리 셈한 값 */
const vatCellOf = (p: PurchaseRow): number => (p.fixedVat ? p.vat : tenth(p.supply));

type Value = { text: string } | { num: number } | { formula: string; cached: number | string };

function cellXml(ref: string, style: string | undefined, v: Value | undefined): string {
  const s = style ? ` s="${style}"` : '';
  if (!v) return `<c r="${ref}"${s}/>`;
  if ('text' in v) return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v.text)}</t></is></c>`;
  if ('num' in v) return `<c r="${ref}"${s}><v>${v.num}</v></c>`;
  const str = typeof v.cached === 'string';
  return `<c r="${ref}"${s}${str ? ' t="str"' : ''}><f>${esc(v.formula)}</f><v>${str ? esc(String(v.cached)) : v.cached}</v></c>`;
}

const cellRe = (ref: string) => new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);

/** 행 안의 칸 하나를 바꾼다 — 칸 모양(s)은 틀의 것 */
function setCell(row: string, ref: string, v: Value | undefined): string {
  const m = cellRe(ref).exec(row);
  if (!m) throw new Error(`엑셀 틀에 ${ref} 칸이 없습니다.`);
  const style = /\ss="(\d+)"/.exec(m[1])?.[1];
  return row.replace(cellRe(ref), () => cellXml(ref, style, v));
}

/** 수식 칸의 미리 셈한 값만 바꾼다 — 수식(과 그 표시 ca="1" 따위)은 틀의 것 그대로 */
function setCached(row: string, ref: string, cached: number | string): string {
  const m = cellRe(ref).exec(row);
  const f = m?.[2] ? /<f[^>]*\/>|<f[^>]*>[\s\S]*?<\/f>/.exec(m[2])?.[0] : undefined;
  if (!m || !f) throw new Error(`엑셀 틀의 ${ref} 에 수식이 없습니다.`);
  const str = typeof cached === 'string';
  const attrs = m[1].replace(/\st="\w+"/, '') + (str ? ' t="str"' : '');
  return row.replace(cellRe(ref), () => `<c r="${ref}"${attrs}>${f}<v>${str ? esc(cached) : cached}</v></c>`);
}

interface Row { r: number; xml: string }
const rowsOf = (sheetData: string): Row[] =>
  [...sheetData.matchAll(/<row [^>]*?r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => ({ r: Number(m[1]), xml: m[0] }));

/** 행 하나를 다른 행 번호로 옮긴다 — 칸 주소도 같이 */
const moveRow = (row: string, from: number, to: number): string => row
  .replace(/^(<row [^>]*?)r="\d+"/, `$1r="${to}"`)
  .replace(new RegExp(`<c r="([A-Z]+)${from}"`, 'g'), `<c r="$1${to}"`);

/** 「C14:E14」 꼴의 주소에서 소계 밑(행 ≥ FOOT)만 민다 */
const shiftRef = (ref: string, delta: number): string =>
  ref.replace(/([A-Z]+)(\d+)/g, (_, c: string, r: string) => `${c}${Number(r) >= FOOT ? Number(r) + delta : Number(r)}`);

/** Excel 날짜 수(1900 체계) — 1899-12-30 부터 센 날 */
const serialOf = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
};

function fillSheet(xml: string, sheet: PurchaseSheet): string {
  const n = sheet.rows.length;
  const lastData = FIRST + n - 1;
  const delta = FIRST + n - FOOT;
  const body = /<sheetData>([\s\S]*)<\/sheetData>/.exec(xml)?.[1];
  if (body === undefined) throw new Error('엑셀 틀에 표가 없습니다.');
  const rows = rowsOf(body);
  const pattern = rows.find((r) => r.r === FIRST);
  if (!pattern) throw new Error(`엑셀 틀에 지급 줄의 본(${FIRST}행)이 없습니다.`);

  const head = rows.filter((r) => r.r < FIRST).map(({ r, xml: row }) => {
    if (r === 4) return setCell(row, 'E4', { num: sheet.year });
    if (r === 5) return setCached(setCell(row, 'I5', { text: sheet.content }), 'F5', `요청간${sheet.year}--`);
    if (r === 6) return setCached(setCell(row, 'D6', { text: sheet.subject }), 'M6', serialOf(sheet.madeOn));
    return row;
  });

  const data = sheet.rows.map((p, i) => {
    const r = FIRST + i;
    const vat = vatCellOf(p);
    let row = moveRow(pattern.xml, FIRST, r);
    const put: Array<[string, Value]> = [
      ['C', { num: i + 1 }],
      ['D', { text: p.content }],
      ['E', { text: p.org }],
      ['F', { num: p.supply }],
      ['G', p.fixedVat ? { num: vat } : { formula: `F${r}*0.1`, cached: vat }],
      ['H', { formula: `SUM(F${r}:G${r})`, cached: p.supply + vat }],
      ['I', { text: p.bank || '-' }],
      ['J', { text: p.account || '-' }],
      ['K', { text: p.holder || '-' }],
      ['L', { text: '-' }],
      ['M', { text: '㈜한백' }],
    ];
    if (p.note) put.push(['N', { text: p.note }]);
    for (const [col, v] of put) row = setCell(row, `${col}${r}`, v);
    return row;
  });

  const supply = sheet.rows.reduce((s, p) => s + p.supply, 0);
  const vat = Math.round(sheet.rows.reduce((s, p) => s + vatCellOf(p), 0) * 100) / 100;
  const foot = rows.filter((r) => r.r >= FOOT).map(({ r, xml: row }) => {
    let next = moveRow(row, r, r + delta);
    if (r === FOOT) {
      const at = FOOT + delta;
      next = setCell(next, `F${at}`, { formula: `SUM(F${FIRST}:F${lastData})`, cached: supply });
      next = setCell(next, `G${at}`, { formula: `SUM(G${FIRST}:G${lastData})`, cached: vat });
      next = setCell(next, `H${at}`, { formula: `SUM(F${at}:G${at})`, cached: supply + vat });
    }
    return next;
  });
  const lastRow = Math.max(...rows.map((r) => r.r)) + delta;

  return xml
    .replace(/<sheetData>[\s\S]*<\/sheetData>/, () => `<sheetData>${[...head, ...data, ...foot].join('')}</sheetData>`)
    .replace(/<dimension ref="([A-Z]+)1:([A-Z]+)\d+"\/>/, (_, a: string, b: string) => `<dimension ref="${a}1:${b}${lastRow}"/>`)
    .replace(/<mergeCell ref="([^"]+)"\/>/g, (_, ref: string) => `<mergeCell ref="${shiftRef(ref, delta)}"/>`)
    /* 입금처 조건부 서식 — 지급 줄 전체에 */
    .replace(new RegExp(`<conditionalFormatting sqref="M${FIRST}:M${LAST_DATA - 1}">`), `<conditionalFormatting sqref="M${FIRST}:M${lastData}">`);
}

/** 「거래처정보」 — 그 결제일의 지급처(겹치면 한 번) */
function fillPartners(xml: string, sheet: PurchaseSheet): string {
  const body = /<sheetData>([\s\S]*)<\/sheetData>/.exec(xml)?.[1];
  if (body === undefined) throw new Error('엑셀 틀의 거래처정보에 표가 없습니다.');
  const rows = rowsOf(body);
  const pattern = rows.find((r) => r.r === PARTNER_FIRST);
  if (!pattern) throw new Error('엑셀 틀의 거래처정보에 줄의 본이 없습니다.');
  const payees = [...new Map(sheet.rows.map((p) => [p.org, p])).values()];
  const filled = payees.map((p, i) => {
    const r = PARTNER_FIRST + i;
    let row = moveRow(pattern.xml, PARTNER_FIRST, r);
    for (const [col, v] of [['B', p.org], ['C', p.bank || '-'], ['D', p.account || '-'], ['E', p.holder || '-'], ['F', '-']] as const) {
      row = setCell(row, `${col}${r}`, { text: v });
    }
    return row;
  });
  return xml
    .replace(/<sheetData>[\s\S]*<\/sheetData>/, () => `<sheetData>${[...rows.filter((r) => r.r < PARTNER_FIRST).map((r) => r.xml), ...filled].join('')}</sheetData>`)
    .replace(/<dimension ref="([A-Z]+\d+):([A-Z]+)\d+"\/>/, (_, a: string, b: string) => `<dimension ref="${a}:${b}${PARTNER_FIRST + payees.length - 1}"/>`);
}

/** 구매요청간소화 엑셀 한 벌 — 틀에 값만 채운다 */
export async function purchaseXlsx(sheet: PurchaseSheet, template: Uint8Array): Promise<Uint8Array> {
  if (sheet.rows.length === 0) throw new Error('엑셀에 적을 지급이 0건입니다.');
  const zip = await JSZip.loadAsync(template);
  const read = async (p: string) => {
    const f = zip.file(p);
    if (!f) throw new Error(`엑셀 틀에 ${p} 가 없습니다.`);
    return f.async('string');
  };
  zip.file(SHEET, fillSheet(await read(SHEET), sheet));
  zip.file(PARTNERS, fillPartners(await read(PARTNERS), sheet));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

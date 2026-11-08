/**
 * 구매요청간소화 엑셀 — 열린구매 첨부의 그 양식을 콘솔 값으로 채워 짓는다. [순수 · 서버와 브라우저 둘 다]
 * (한백 2026-11-08 「엑셀파일은 바탕화면에 있는 영업수수료 지급내역 폴더 참고필요」 — 「구매요청간소화_전기차충전기 영업위탁수수료(…내역).xlsx」)
 *
 * 칸 자리는 그 양식 그대로다(시트 「구매(일반)」): 5행 구분 · 요청간 · 구매번호(구매팀이 적는다) · 내용 / 6행 공사명 /
 * 7행 머리(No. · 내 용 · 거래처 · 공급가액 · 세액 · 입금액 · 은행 · 계좌번호 · 예금주명 · 연락처 · 입금처 · 비 고) / 배치마다 한 줄 /
 * 소 계(공급가액 · 세액 · 입금액 합) + 「1. 양식 빈칸 없이 채워주세요 2. 본문 캡쳐 및 파일 필수 업로드」 · 필수사항 / 특기 사항.
 * 양식의 「거래처정보」 시트(계좌 · 연락처를 VLOOKUP)는 옮기지 않는다 — 계좌는 콘솔의 협력사 정보에서 바로 넣는다.
 * 엑셀 꾸러미를 더하지 않는다 — jszip 으로 짓는다(lib/xlsx-write 와 같은 방식).
 */
import JSZip from 'jszip';

export interface PurchaseRow {
  content: string;
  org: string;
  supply: number;
  vat: number;
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
  rows: PurchaseRow[];
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 스타일 번호(styles.xml cellXfs 차례) */
const S = { plain: 0, head: 1, text: 2, money: 3, center: 4, sum: 5, note: 6, hint: 7, label: 8 } as const;
type Style = (typeof S)[keyof typeof S];
type Cell = { ref: string; style: Style; text?: string; num?: number };

const COLS = 'ABCDEFGHIJKLMNO';
/** 양식의 열 폭(1행에 적혀 있던 값) — A 는 여백 */
const WIDTHS: Record<string, number> = {
  A: 2, B: 1.5, C: 8, D: 30, E: 20, F: 15, G: 15, H: 15, I: 10, J: 20, K: 20, L: 20, M: 15, N: 15, O: 1.5,
};

function sheetXml(sheet: PurchaseSheet): string {
  const rows = new Map<number, Cell[]>();
  const heights = new Map<number, number>();
  const merges: string[] = [];
  const put = (ref: string, style: Style, v?: string | number) => {
    const r = Number(ref.replace(/[A-Z]+/, ''));
    const cell: Cell = { ref, style, ...(typeof v === 'number' ? { num: v } : v !== undefined ? { text: v } : {}) };
    rows.set(r, [...(rows.get(r) ?? []), cell]);
  };
  /** 합친 칸 — 테두리가 끊기지 않게 칸마다 같은 모양을 둔다 */
  const span = (from: string, to: string, style: Style, v?: string | number) => {
    const r = Number(from.replace(/[A-Z]+/, ''));
    const a = COLS.indexOf(from[0]);
    const b = COLS.indexOf(to[0]);
    for (let c = a; c <= b; c++) put(`${COLS[c]}${r}`, style, c === a ? v : undefined);
    merges.push(`${from}:${to}`);
  };

  put('D3', S.hint, '작성자 작성');
  span('E3', 'G3', S.hint, '구매팀 작성');
  heights.set(5, 30);
  put('C5', S.label, '구분');
  put('D5', S.center, '요청간');
  put('E5', S.label, '구매번호');
  span('F5', 'G5', S.center, '');
  put('H5', S.label, '내용');
  span('I5', 'L5', S.text, sheet.content);
  span('M5', 'N5', S.center, '');
  heights.set(6, 30);
  put('C6', S.label, '공사명');
  span('D6', 'G6', S.text, sheet.subject);
  put('H6', S.label, '세부 공사');
  span('I6', 'L6', S.text, '');
  span('M6', 'N6', S.center, '');
  heights.set(7, 30);
  ['No.', '내 용', '거래처', '공급가액', '세액', '입금액', '은행', '계좌번호', '예금주명', '연락처', '입금처', '비 고']
    .forEach((h, i) => put(`${COLS[2 + i]}7`, S.head, h));

  sheet.rows.forEach((row, i) => {
    const r = 8 + i;
    heights.set(r, 22);
    put(`C${r}`, S.center, i + 1);
    put(`D${r}`, S.text, row.content);
    put(`E${r}`, S.center, row.org);
    put(`F${r}`, S.money, row.supply);
    put(`G${r}`, S.money, row.vat);
    put(`H${r}`, S.money, row.supply + row.vat);
    put(`I${r}`, S.center, row.bank || '-');
    put(`J${r}`, S.center, row.account || '-');
    put(`K${r}`, S.center, row.holder || '-');
    put(`L${r}`, S.center, '-');
    put(`M${r}`, S.center, '㈜한백');
    put(`N${r}`, S.text, row.note);
  });

  const sum = 8 + sheet.rows.length;
  const supply = sheet.rows.reduce((n, r) => n + r.supply, 0);
  const vat = sheet.rows.reduce((n, r) => n + r.vat, 0);
  heights.set(sum, 30);
  span(`C${sum}`, `E${sum}`, S.head, '소 계');
  put(`F${sum}`, S.sum, supply);
  put(`G${sum}`, S.sum, vat);
  put(`H${sum}`, S.sum, supply + vat);
  span(`I${sum}`, `J${sum}`, S.note, '1. 양식 빈칸 없이 채워주세요\n2. 본문 캡쳐 및 파일 필수 업로드');
  put(`K${sum}`, S.label, '필수사항');
  span(`L${sum}`, `N${sum}`, S.note, '1.세금계산서 2.거래내역서 3. 각종 증빙자료 등');
  const memo = sum + 1;
  heights.set(memo, 30);
  heights.set(memo + 1, 30);
  span(`C${memo}`, `E${memo}`, S.head, '특기 사항');
  span(`F${memo}`, `N${memo}`, S.text, '');
  span(`C${memo + 1}`, `E${memo + 1}`, S.head);
  span(`F${memo + 1}`, `N${memo + 1}`, S.text, '');
  merges.splice(merges.indexOf(`C${memo}:E${memo}`), 1, `C${memo}:E${memo + 1}`);
  merges.splice(merges.indexOf(`C${memo + 1}:E${memo + 1}`), 1);

  const cellXml = (c: Cell) => {
    if (c.num !== undefined) return `<c r="${c.ref}" s="${c.style}"><v>${c.num}</v></c>`;
    if (c.text !== undefined && c.text !== '') {
      return `<c r="${c.ref}" s="${c.style}" t="inlineStr"><is><t xml:space="preserve">${esc(c.text)}</t></is></c>`;
    }
    return `<c r="${c.ref}" s="${c.style}"/>`;
  };
  const order = (a: Cell, b: Cell) => COLS.indexOf(a.ref[0]) - COLS.indexOf(b.ref[0]);
  const rowXml = [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const h = heights.get(r);
    return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${(rows.get(r) ?? []).sort(order).map(cellXml).join('')}</row>`;
  }).join('');
  const cols = Object.entries(WIDTHS)
    .map(([c, w]) => { const n = COLS.indexOf(c) + 1; return `<col min="${n}" max="${n}" width="${w}" customWidth="1"/>`; })
    .join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>'
    + `<sheetFormatPr defaultRowHeight="16.5"/><cols>${cols}</cols><sheetData>${rowXml}</sheetData>`
    + `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>'
    + '</worksheet>';
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>'
  + '<fonts count="3">'
  + '<font><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>'
  + '<font><b/><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>'
  + '<font><sz val="9"/><color rgb="FF808080"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>'
  + '</fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right>'
  + '<top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="9">'
  /* 0 plain */ + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  /* 1 head */ + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
  /* 2 text */ + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
  /* 3 money */ + '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
  /* 4 center */ + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
  /* 5 sum */ + '<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
  /* 6 note */ + '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
  /* 7 hint */ + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>'
  /* 8 label */ + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/** 구매요청간소화 엑셀 한 벌 */
export async function purchaseXlsx(sheet: PurchaseSheet): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="구매(일반)" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>');
  zip.file('xl/styles.xml', STYLES);
  zip.file('xl/worksheets/sheet1.xml', sheetXml(sheet));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

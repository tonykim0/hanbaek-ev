/**
 * 표 하나를 새 엑셀(xlsx) 파일로 — 시트 한 장, 머리 한 줄, 그 밑에 줄들.
 *
 * 서식을 고치는 lib/survey/xlsx-kit 과 다른 일이다(그쪽은 운영사 서식 안의 칸을 바꾼다). 여기는 빈 통에서
 * 짓는다 — 엑셀 라이브러리(수백 KB)를 더하지 않고 이미 있는 jszip 으로 꾸러미 여섯 개를 쓴다. 브라우저에서
 * 돈다(시공관리 표의 「엑셀 받기」는 이미 화면에 있는 자료를 그대로 쓴다 — 서버에 다시 묻지 않는다).
 *
 * 받아서 바로 쓰게 하는 것 셋: 머리 줄 고정 · 머리 줄 자동 필터 · 날짜는 진짜 날짜(엑셀에서 날짜로 거르고
 * 정렬된다 — 글자로 넣으면 「2026-11-05」가 글자라 날짜 필터가 안 선다).
 */
import JSZip from 'jszip';
import { xmlSafe } from '@/lib/survey/xml-safe';

/** 칸 하나 — 글자 · 숫자 · 날짜(YYYY-MM-DD) · 빈 칸 */
export type XlsxCell = string | number | { date: string } | null;

export interface XlsxColumn {
  header: string;
  /** 열 폭(엑셀 글자 단위) — 안 주면 머리·값 길이로 어림한다 */
  width?: number;
}

export interface XlsxSheet {
  /** 시트 이름 — 엑셀이 받지 않는 글자([]:*?/\)는 걷고 31자로 자른다 */
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
}

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** 스타일 번호 — styles.xml 의 cellXfs 순서와 같다 */
const XF_HEADER = 1;
const XF_DATE = 2;

const esc = (s: string): string =>
  xmlSafe(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 1 → A, 27 → AA */
export function colName(n: number): string {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/** YYYY-MM-DD → 엑셀 날짜 일련번호(1900 체계 · 1899-12-30 이 0). 모양이 아니면 null */
export function excelDate(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : Math.round((t - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** 글자 폭 — 한글·전각은 두 칸으로 센다(엑셀 열 폭은 영문 한 글자가 1) */
const textWidth = (s: string): number => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);

function cellWidth(c: XlsxCell): number {
  if (c === null) return 0;
  if (typeof c === 'number') return String(c).length;
  if (typeof c === 'string') return textWidth(c);
  return 10; // YYYY-MM-DD
}

/** 머리와 값 중 가장 긴 것 + 여백 — 너무 긴 주소가 열을 끝없이 늘리지 않게 50 에서 멈춘다 */
function widthOf(col: XlsxColumn, i: number, rows: XlsxCell[][]): number {
  if (col.width) return col.width;
  const longest = rows.reduce((w, r) => Math.max(w, cellWidth(r[i] ?? null)), textWidth(col.header) + 2);
  return Math.min(50, Math.max(8, longest + 2));
}

function cellXml(c: XlsxCell, ref: string): string {
  if (c === null || c === '') return '';
  if (typeof c === 'number') return Number.isFinite(c) ? `<c r="${ref}"><v>${c}</v></c>` : '';
  if (typeof c === 'object') {
    const serial = excelDate(c.date);
    // 날짜 모양이 아니면 받은 글자 그대로 둔다 — 값을 버리는 것보다 낫다
    return serial === null
      ? `<c r="${ref}" t="inlineStr"><is><t>${esc(c.date)}</t></is></c>`
      : `<c r="${ref}" s="${XF_DATE}"><v>${serial}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const n = sheet.columns.length;
  const last = sheet.rows.length + 1;
  const range = `A1:${colName(Math.max(1, n))}${last}`;
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${widthOf(c, i, sheet.rows)}" customWidth="1"/>`)
    .join('');
  const head = sheet.columns
    .map((c, i) => `<c r="${colName(i + 1)}1" t="inlineStr" s="${XF_HEADER}"><is><t>${esc(c.header)}</t></is></c>`)
    .join('');
  const body = sheet.rows
    .map((r, ri) => {
      const row = ri + 2;
      const cells = sheet.columns.map((_, ci) => cellXml(r[ci] ?? null, `${colName(ci + 1)}${row}`)).join('');
      return `<row r="${row}">${cells}</row>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="16.5"/>` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData><row r="1">${head}</row>${body}</sheetData>` +
    (n > 0 ? `<autoFilter ref="${range}"/>` : '') +
    `</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="${MAIN_NS}">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><name val="맑은 고딕"/><family val="2"/></font>` +
  `</fonts>` +
  `<fills count="3">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** 시트 이름 — 엑셀이 거절하는 글자를 걷는다. 비면 「Sheet1」 */
export function sheetNameOf(name: string): string {
  const clean = name.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31);
  return clean || 'Sheet1';
}

/** 표 한 장 → xlsx 바이트 */
export async function buildXlsx(sheet: XlsxSheet): Promise<Uint8Array> {
  const name = sheetNameOf(sheet.name);
  const n = sheet.columns.length;
  const filterRef = `'${name.replace(/'/g, "''")}'!$A$1:$${colName(Math.max(1, n))}$${sheet.rows.length + 1}`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${PKG_REL_NS}">` +
      `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      `<sheets><sheet name="${esc(name)}" sheetId="1" r:id="rId1"/></sheets>` +
      (n > 0
        ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${esc(filterRef)}</definedName></definedNames>`
        : '') +
      `</workbook>`
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${PKG_REL_NS}">` +
      `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
      `</Relationships>`
  );
  zip.file('xl/worksheets/sheet1.xml', sheetXml(sheet));
  zip.file('xl/styles.xml', STYLES);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

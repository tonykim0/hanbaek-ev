/**
 * 엑셀(xlsx) 서식에 값·사진을 넣고 시트를 복제하는 도구 — 플러그링크 실사보고서가 쓴다.
 *
 * ★서식을 다시 짓지 않고 그대로 고친다★ — 실사보고서 엑셀은 공사내역서(출력)·일위대가가 수천 개의
 * 수식으로 엮여 있다(플러그링크 v22: 출력 201 · 일위대가 7,706). 라이브러리로 열어 다시 쓰면
 * 서식·수식·도형이 깎인다. 그래서 패키지 안의 XML 을 칸 단위로만 바꾼다:
 *   · 값은 칸에 직접 쓴다 — 글자는 inlineStr 로(공유 문자열 표를 건드리지 않는다)
 *   · 수식의 캐시는 낡으므로 열 때 다시 계산하게 한다(calcPr fullCalcOnLoad, calcChain 삭제)
 *   · 사진은 시트의 그림(drawing)에 한 장씩 덧붙인다
 *
 * DOMParser·XMLSerializer 만 쓴다(브라우저에서 돌고, 시험에서는 xmldom 을 꽂는다).
 */
import type JSZip from 'jszip';
import type { PreparedImage } from './docx-kit';
import { marksXml } from './xlsx-marks';
import { crop, fits } from './fit';
import { parseXml, xmlSafe } from './xml-safe';

const S_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XDR_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';

const EMU_PER_PX = 9525;
const EMU_PER_PT = 12700;

const parse = parseXml;
const ser = (d: Document) => new XMLSerializer().serializeToString(d);

/** 「A1」 → 열 번호(1부터)·행 번호 */
export function splitRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`칸 주소가 이상합니다: ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col, row: Number(m[2]) };
}

export function colName(col: number): string {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** 패키지 안 경로 잇기 — 「xl/worksheets」 + 「../drawings/x.xml」 */
function join(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'));
const relsOf = (p: string) => `${dirOf(p)}/_rels/${p.slice(p.lastIndexOf('/') + 1)}.rels`;
const elems = (d: Document | Element, ns: string, local: string) => Array.from(d.getElementsByTagNameNS(ns, local));

interface SheetInfo { name: string; path: string; el: Element }

/**
 * 열린 통합 문서 — 시트 XML 을 들고 있다가 save 에 한꺼번에 쓴다.
 * 시트는 이름으로 부른다(사람이 서식에서 보는 이름 그대로).
 */
export class Workbook {
  private wb!: Document;
  private wbRels!: Document;
  private ct!: Document;
  private docs = new Map<string, Document>();
  private picN = 0;
  private relN = 0;
  /** 표시 도형의 id — 그림 부품 안에서 겹치면 안 된다(사진 5000번대 · 범례 6000번대 위로) */
  private shapeN = 10000;

  private constructor(private zip: JSZip) {}

  static async open(zip: JSZip): Promise<Workbook> {
    const w = new Workbook(zip);
    w.wb = parse(await zip.file('xl/workbook.xml')!.async('string'));
    w.wbRels = parse(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));
    w.ct = parse(await zip.file('[Content_Types].xml')!.async('string'));
    return w;
  }

  private async doc(path: string): Promise<Document> {
    let d = this.docs.get(path);
    if (!d) {
      const f = this.zip.file(path);
      if (!f) throw new Error(`서식 안에 ${path} 가 없습니다.`);
      d = parse(await f.async('string'));
      this.docs.set(path, d);
    }
    return d;
  }

  private sheets(): SheetInfo[] {
    return elems(this.wb, S_NS, 'sheet').map((el) => {
      const rid = el.getAttributeNS(R_NS, 'id') ?? el.getAttribute('r:id') ?? '';
      const rel = elems(this.wbRels, PKG_REL_NS, 'Relationship').find((r) => r.getAttribute('Id') === rid);
      return { name: el.getAttribute('name') ?? '', path: join('xl', rel?.getAttribute('Target') ?? ''), el };
    });
  }

  private sheet(name: string): SheetInfo {
    const s = this.sheets().find((x) => x.name === name);
    if (!s) throw new Error(`서식에 「${name}」 시트가 없습니다.`);
    return s;
  }

  hasSheet(name: string): boolean {
    return this.sheets().some((s) => s.name === name);
  }

  /** 칸에 값을 쓴다 — 숫자는 숫자로, 글자는 inlineStr 로. 빈 글자는 칸을 비운다. 서식(s)은 그대로 */
  async set(sheetName: string, ref: string, value: string | number | null): Promise<void> {
    const d = await this.doc(this.sheet(sheetName).path);
    const c = this.cell(d, ref);
    for (const k of Array.from(c.childNodes)) c.removeChild(k);
    c.removeAttribute('t');
    if (value === null || value === '') return;
    if (typeof value === 'number') {
      const v = d.createElementNS(S_NS, 'v');
      v.textContent = String(value);
      c.appendChild(v);
      return;
    }
    c.setAttribute('t', 'inlineStr');
    const is = d.createElementNS(S_NS, 'is');
    const t = d.createElementNS(S_NS, 't');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = xmlSafe(value);
    is.appendChild(t);
    c.appendChild(is);
  }

  /** 칸을 찾고 없으면 만든다 — 행과 칸의 순서를 지킨다(엑셀은 순서가 틀리면 「복구」를 띄운다) */
  private cell(d: Document, ref: string): Element {
    const { col, row } = splitRef(ref);
    const data = elems(d, S_NS, 'sheetData')[0];
    let rowEl = elems(data, S_NS, 'row').find((r) => Number(r.getAttribute('r')) === row);
    if (!rowEl) {
      rowEl = d.createElementNS(S_NS, 'row');
      rowEl.setAttribute('r', String(row));
      const after = elems(data, S_NS, 'row').find((r) => Number(r.getAttribute('r')) > row);
      data.insertBefore(rowEl, after ?? null);
    }
    const cells = elems(rowEl, S_NS, 'c');
    const hit = cells.find((c) => c.getAttribute('r') === ref);
    if (hit) return hit;
    const c = d.createElementNS(S_NS, 'c');
    c.setAttribute('r', ref);
    const after = cells.find((x) => splitRef(x.getAttribute('r') ?? 'A1').col > col);
    rowEl.insertBefore(c, after ?? null);
    return c;
  }

  /** 다음 부품 번호 — 같은 종류 파일 이름이 겹치지 않게(sheet12.xml · drawing9.xml …) */
  private nextPart(dir: string, stem: string, ext: string): string {
    let max = 0;
    const re = new RegExp(`^${dir}/${stem}(\\d+)\\.${ext}$`);
    this.zip.forEach((p) => { const m = re.exec(p); if (m) max = Math.max(max, Number(m[1])); });
    return `${dir}/${stem}${max + 1}.${ext}`;
  }

  private override(path: string, type: string): void {
    const types = this.ct.documentElement;
    const o = this.ct.createElementNS(types.namespaceURI, 'Override');
    o.setAttribute('PartName', `/${path}`);
    o.setAttribute('ContentType', type);
    types.appendChild(o);
  }

  /**
   * 시트를 복제해 바로 뒤에 둔다 — 시트에 딸린 그림·머리글 그림·인쇄 설정까지 따로 베낀다
   * (두 시트가 한 그림 부품을 같이 가리키면 한쪽에 넣은 사진이 다른 쪽에도 뜬다).
   * 그 시트만 가리키는 이름(인쇄 영역)도 함께 베끼고, 뒤 시트들의 이름 번호(localSheetId)를 민다.
   */
  async cloneSheet(srcName: string, newName: string): Promise<void> {
    const sheets = this.sheets();
    const srcIdx = sheets.findIndex((s) => s.name === srcName);
    if (srcIdx < 0) throw new Error(`서식에 「${srcName}」 시트가 없습니다.`);
    const src = sheets[srcIdx];
    // 이미 복제본이 뒤에 붙어 있으면 그 뒤에 — 순서대로 쌓는다
    let insertIdx = srcIdx + 1;
    while (insertIdx < sheets.length && sheets[insertIdx].name.startsWith(srcName.replace(/ \d+거점$/, ''))) insertIdx += 1;

    const sheetPath = this.nextPart('xl/worksheets', 'sheet', 'xml');
    const xml = ser(await this.doc(src.path)).replace(/ tabSelected="1"/g, '');
    this.zip.file(sheetPath, xml);
    this.override(sheetPath, CT_SHEET);

    const srcRels = this.zip.file(relsOf(src.path));
    if (srcRels) {
      const rels = parse(await srcRels.async('string'));
      for (const r of elems(rels, PKG_REL_NS, 'Relationship')) {
        const from = join(dirOf(src.path), r.getAttribute('Target') ?? '');
        const m = /^(.*)\/([a-zA-Z]+?)(\d+)\.(\w+)$/.exec(from);
        if (!m) continue;
        const to = this.nextPart(m[1], m[2], m[4]);
        this.zip.file(to, await this.zip.file(from)!.async('uint8array'));
        const fromRels = this.zip.file(relsOf(from));
        if (fromRels) this.zip.file(relsOf(to), await fromRels.async('uint8array'));
        if (m[4] === 'xml' && m[2] === 'drawing') this.override(to, CT_DRAWING);
        // 대상은 시트 폴더 기준 상대 경로다 — xl/drawings/x → ../drawings/x
        r.setAttribute('Target', `../${to.slice('xl/'.length)}`);
      }
      this.zip.file(relsOf(sheetPath), ser(rels));
    }

    this.relN += 1;
    const rid = `rIdSurvey${this.relN}`;
    const rel = this.wbRels.createElementNS(PKG_REL_NS, 'Relationship');
    rel.setAttribute('Id', rid);
    rel.setAttribute('Type', `${REL}/worksheet`);
    rel.setAttribute('Target', sheetPath.slice('xl/'.length));
    this.wbRels.documentElement.appendChild(rel);

    const maxId = Math.max(...sheets.map((s) => Number(s.el.getAttribute('sheetId') ?? 0)));
    const el = this.wb.createElementNS(S_NS, 'sheet');
    el.setAttribute('name', newName);
    el.setAttribute('sheetId', String(maxId + 1));
    el.setAttributeNS(R_NS, 'r:id', rid);
    const parent = src.el.parentNode!;
    parent.insertBefore(el, sheets[insertIdx]?.el ?? null);

    // 이름 정의 — 뒤 시트의 번호를 하나씩 밀고, 원본만 가리키던 이름을 새 시트 몫으로 하나 더
    const names = elems(this.wb, S_NS, 'definedName');
    const quoted = (n: string) => `'${n.replace(/'/g, "''")}'!`;
    for (const dn of names) {
      const id = dn.getAttribute('localSheetId');
      if (id !== null && Number(id) >= insertIdx) dn.setAttribute('localSheetId', String(Number(id) + 1));
    }
    for (const dn of names) {
      if (dn.getAttribute('localSheetId') !== String(srcIdx)) continue;
      const copy = dn.cloneNode(true) as Element;
      copy.setAttribute('localSheetId', String(insertIdx));
      copy.textContent = (dn.textContent ?? '').split(quoted(srcName)).join(quoted(newName));
      dn.parentNode!.insertBefore(copy, dn.nextSibling);
    }
    this.docs.set(sheetPath, parse(xml));
  }

  /** 시트 이름을 바꾼다 — 그 시트를 가리키는 이름 정의도 함께(수식은 이 서식에서 그 시트를 안 본다) */
  renameSheet(oldName: string, newName: string): void {
    const s = this.sheet(oldName);
    s.el.setAttribute('name', newName);
    const q = (n: string) => `'${n.replace(/'/g, "''")}'!`;
    for (const dn of elems(this.wb, S_NS, 'definedName')) {
      dn.textContent = (dn.textContent ?? '').split(q(oldName)).join(q(newName));
    }
  }

  /** 그 시트의 인쇄 영역을 바꾼다 — 사진 짝을 더 썼으면 거기까지 찍혀야 한다 */
  setPrintArea(sheetName: string, range: string): void {
    const idx = this.sheets().findIndex((s) => s.name === sheetName);
    const dn = elems(this.wb, S_NS, 'definedName').find(
      (x) => x.getAttribute('name') === '_xlnm.Print_Area' && x.getAttribute('localSheetId') === String(idx)
    );
    if (dn) dn.textContent = `'${sheetName.replace(/'/g, "''")}'!${range}`;
  }

  /**
   * 줄 묶음(from~to)을 그 바로 아래에 times 번 이어 붙인다 — 칸 모양·높이·병합까지 그대로.
   * 사진대지의 사진 짝(25줄)이 서식에 여섯뿐인데 제출본은 인입라인만 18장까지 낸다(lib/survey/spec).
   * ★수식이 있는 줄은 베끼지 않는다★ — 상대 참조를 옮겨 적는 일까지 하지 않으려고, 있으면 멈춘다.
   * 붙일 자리에 이미 줄이 있으면 멈춘다(서식이 바뀐 것이다).
   */
  async appendRowBlock(sheetName: string, from: number, to: number, times: number): Promise<void> {
    if (times <= 0) return;
    const d = await this.doc(this.sheet(sheetName).path);
    const data = elems(d, S_NS, 'sheetData')[0];
    const rowNo = (r: Element) => Number(r.getAttribute('r'));
    const src = elems(data, S_NS, 'row').filter((r) => rowNo(r) >= from && rowNo(r) <= to);
    if (src.some((r) => elems(r, S_NS, 'f').length > 0)) throw new Error(`「${sheetName}」 ${from}~${to}행에 수식이 있어 늘릴 수 없습니다.`);
    const h = to - from + 1;
    const last = to + h * times;
    if (elems(data, S_NS, 'row').some((r) => rowNo(r) > to && rowNo(r) <= last)) {
      throw new Error(`「${sheetName}」 ${to}행 아래가 비어 있지 않아 사진 칸을 늘릴 수 없습니다 — 서식이 바뀌었는지 확인이 필요합니다.`);
    }
    const after = elems(data, S_NS, 'row').find((r) => rowNo(r) > last) ?? null;
    const shiftRef = (ref: string, off: number) => {
      const { col, row } = splitRef(ref);
      return `${colName(col)}${row + off}`;
    };
    const mc = elems(d, S_NS, 'mergeCells')[0];
    const merges = mc ? elems(mc, S_NS, 'mergeCell').filter((m) => {
      const [a, b] = (m.getAttribute('ref') ?? '').split(':').map(splitRef);
      return a.row >= from && b.row <= to;
    }) : [];
    for (let k = 1; k <= times; k++) {
      const off = h * k;
      for (const r of src) {
        const copy = r.cloneNode(true) as Element;
        copy.setAttribute('r', String(rowNo(r) + off));
        for (const c of elems(copy, S_NS, 'c')) c.setAttribute('r', shiftRef(c.getAttribute('r') ?? 'A1', off));
        data.insertBefore(copy, after);
      }
      for (const m of merges) {
        const copy = m.cloneNode(true) as Element;
        copy.setAttribute('ref', (m.getAttribute('ref') ?? '').split(':').map((x) => shiftRef(x, off)).join(':'));
        mc!.appendChild(copy);
      }
    }
    if (mc) mc.setAttribute('count', String(elems(mc, S_NS, 'mergeCell').length));
    const dim = elems(d, S_NS, 'dimension')[0];
    const ref = dim?.getAttribute('ref');
    if (dim && ref?.includes(':')) {
      const [a, b] = ref.split(':');
      const end = splitRef(b);
      if (end.row < last) dim.setAttribute('ref', `${a}:${colName(end.col)}${last}`);
    }
  }

  /** 손으로 넣은 쪽 나눔(가로) — 그 줄 다음에서 쪽이 넘어간다. 서식에 이미 있는 나눔 자리를 고친다 */
  async setRowBreaks(sheetName: string, rows: number[]): Promise<void> {
    const d = await this.doc(this.sheet(sheetName).path);
    const rb = elems(d, S_NS, 'rowBreaks')[0];
    if (!rb) throw new Error(`「${sheetName}」에 쪽 나눔 자리가 없습니다 — 서식이 바뀌었는지 확인이 필요합니다.`);
    const proto = elems(rb, S_NS, 'brk')[0];
    const max = proto?.getAttribute('max') ?? '16383';
    for (const b of elems(rb, S_NS, 'brk')) rb.removeChild(b);
    for (const r of rows) {
      const b = d.createElementNS(S_NS, 'brk');
      b.setAttribute('id', String(r));
      b.setAttribute('max', max);
      b.setAttribute('man', '1');
      rb.appendChild(b);
    }
    rb.setAttribute('count', String(rows.length));
    rb.setAttribute('manualBreakCount', String(rows.length));
  }

  /**
   * 칸 크기(EMU) — 열 폭(글자 단위)·행 높이(pt)를 쌓는다.
   *
   * ★열 폭 한 단위가 몇 EMU 인지는 서식의 그림에서 잰다★ — 엑셀은 열 폭을 기본 글꼴의 숫자 폭으로 픽셀로 바꾼다.
   * 7px 로 어림했더니 이 서식(숫자 폭 약 8px)에서 7% 좁게 잡혀, 칸에 꽉 채운다는 사진이 칸 비율보다 납작하게 잘린
   * 뒤 엑셀이 다시 늘렸다(표시 도형도 같이). 서식에 이미 있는 그림(엑셀이 저장한 것)이 몇 열에 걸쳐 몇 EMU 인지로
   * 한 단위를 얻는다(가운데 값). 그림이 없으면 8px. 시트마다 처음 한 번 잰다 — 우리가 넣은 그림으로 다시 재지 않게.
   */
  private perUnit = new Map<string, number>();
  private async unitOf(sheetPath: string, units: (c: number) => number): Promise<number> {
    const have = this.perUnit.get(sheetPath);
    if (have) return have;
    const dd = await this.drawingOf(sheetPath).then((p) => this.doc(p)).catch(() => null);
    const n = (e: Element | undefined, k: string) => Number(e ? elems(e, XDR_NS, k)[0]?.textContent : NaN);
    const est: number[] = [];
    for (const anc of dd ? elems(dd, XDR_NS, 'twoCellAnchor') : []) {
      const from = elems(anc, XDR_NS, 'from')[0];
      const to = elems(anc, XDR_NS, 'to')[0];
      const xfrm = elems(anc, A_NS, 'xfrm')[0];
      const ext = xfrm ? elems(xfrm, A_NS, 'ext')[0] : undefined;
      const fc = n(from, 'col'); const tc = n(to, 'col');
      if (!ext || !(tc > fc)) continue;
      let span = 0;
      for (let c = fc + 1; c <= tc; c++) span += units(c);
      const v = (Number(ext.getAttribute('cx')) + n(from, 'colOff') - n(to, 'colOff')) / span;
      if (Number.isFinite(v) && v > 0) est.push(v);
    }
    const unit = est.length ? est.sort((x, y) => x - y)[Math.floor(est.length / 2)] : 8 * EMU_PER_PX;
    this.perUnit.set(sheetPath, unit);
    return unit;
  }

  private async geometry(d: Document, sheetPath: string) {
    const fmt = elems(d, S_NS, 'sheetFormatPr')[0];
    const defW = Number(fmt?.getAttribute('defaultColWidth') ?? 9);
    const defH = Number(fmt?.getAttribute('defaultRowHeight') ?? 15);
    const cols = elems(d, S_NS, 'col').map((c) => ({
      min: Number(c.getAttribute('min')), max: Number(c.getAttribute('max')), w: Number(c.getAttribute('width') ?? defW),
    }));
    const rows = new Map<number, number>();
    for (const r of elems(d, S_NS, 'row')) {
      const ht = r.getAttribute('ht');
      if (ht) rows.set(Number(r.getAttribute('r')), Number(ht));
    }
    const units = (c: number) => cols.find((x) => c >= x.min && c <= x.max)?.w ?? defW;
    const unit = await this.unitOf(sheetPath, units);
    const colW = (c: number) => Math.round(units(c) * unit);
    const rowH = (r: number) => (rows.get(r) ?? defH) * EMU_PER_PT;
    return { colW, rowH };
  }

  /**
   * 사진을 칸 범위(「A6:L28」)에 넣는다 — 두 방식:
   *   contain  비율을 지켜 범위 안 가운데(92% — 칸 크기는 어림이라 넘치지 않게). 도면처럼 잘리면 안 되는 것
   *   fill     ★범위를 꽉 채운다★ (한백 지시 2026-10-01 「사진이 각 엑셀칸에 맞춰서 사이즈 조정」).
   *            제출본들은 칸 모서리에 맞춰 사진을 늘려 붙였다(2026 사진 451장 중 대부분이 A6→L28 처럼 칸에
   *            꼭 맞고, 가로세로가 1.25~2.2배 일그러졌다). 늘리지 않고 칸 비율로 자른다 — 사진 위 표시가
   *            있으면 그 자리가 남게 창을 옮긴다(img.focus). 자르기는 엑셀의 「자르기」(srcRect)라 원본이
   *            파일에 그대로 있고, 받은 사람이 엑셀에서 자른 자리를 다시 고를 수 있다.
   *            칸 모서리에 붙여 두어(twoCellAnchor) 칸 크기를 어림한 오차와 상관없이 칸에 맞는다.
   */
  async addPicture(sheetName: string, range: string, img: PreparedImage, mode: 'contain' | 'fill' = 'contain'): Promise<void> {
    const s = this.sheet(sheetName);
    const d = await this.doc(s.path);
    const [a, b] = range.split(':').map(splitRef);
    const { colW, rowH } = await this.geometry(d, s.path);
    let boxW = 0; for (let c = a.col; c <= b.col; c++) boxW += colW(c);
    let boxH = 0; for (let r = a.row; r <= b.row; r++) boxH += rowH(r);

    const drawingPath = await this.drawingOf(s.path);
    const dd = await this.doc(drawingPath);
    this.picN += 1;
    const media = this.nextPart('xl/media', 'survey', 'jpeg');
    this.zip.file(media, img.bytes);
    const rid = `rIdSurveyPic${this.picN}`;
    await this.addRel(drawingPath, rid, `${REL}/image`, `../media/${media.slice('xl/media/'.length)}`);
    const id = 5000 + this.picN;
    const ns = `xmlns:xdr="${XDR_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}"`;
    /*
     * 표시가 있으면 사진과 한 묶음(그룹)으로 — 묶음이 칸에 맞춰 늘면 안의 표시도 같이 는다(xlsx-marks 머리말).
     * 묶음 안 좌표는 사진이 보이는 틀 그대로(0~cx, 0~cy)다.
     */
    const pic = (cx: number, cy: number, crop: string, cut = { l: 0, t: 0, r: 0, b: 0 }) => {
      const p = `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="사진 ${this.picN}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/>${crop}<a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`;
      if (!img.marks?.length) return `${p}<xdr:clientData/>`;
      const shapes = marksXml(img.marks, img, { cx, cy, crop: cut }, img.markStyle ?? 'red', () => (this.shapeN += 1));
      const gid = (this.shapeN += 1);
      const xf = `<a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/>`;
      return `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="${gid}" name="사진 ${this.picN} · 표시"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm>${xf}</a:xfrm></xdr:grpSpPr>${p}${shapes}</xdr:grpSp><xdr:clientData/>`;
    };

    let xml: string;
    // 칸 테두리가 사진에 덮이지 않게 둘레를 2px 남긴다
    const inset = 2 * EMU_PER_PX;
    const w = crop(img.width / img.height, (boxW - 2 * inset) / (boxH - 2 * inset), img.focus);
    // 표시가 자른 창에 다 안 들면 자르지 않고 들인다 — 잘라 넣으면 표시 도형이 사진 밖으로 삐져나간다
    if (mode === 'fill' && fits(w, img.focus)) {
      const pct = (v: number) => Math.round(v * 100000);
      const src = `<a:srcRect l="${pct(w.l)}" t="${pct(w.t)}" r="${pct(w.r)}" b="${pct(w.b)}"/>`;
      xml = `<xdr:twoCellAnchor ${ns}><xdr:from><xdr:col>${a.col - 1}</xdr:col><xdr:colOff>${inset}</xdr:colOff><xdr:row>${a.row - 1}</xdr:row><xdr:rowOff>${inset}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${b.col - 1}</xdr:col><xdr:colOff>${Math.max(0, colW(b.col) - inset)}</xdr:colOff><xdr:row>${b.row - 1}</xdr:row><xdr:rowOff>${Math.max(0, Math.round(rowH(b.row)) - inset)}</xdr:rowOff></xdr:to>${pic(Math.round(boxW - 2 * inset), Math.round(boxH - 2 * inset), src, w)}</xdr:twoCellAnchor>`;
    } else {
      const scale = Math.min((boxW * 0.92) / img.width, (boxH * 0.92) / img.height);
      const cx = Math.round(img.width * scale);
      const cy = Math.round(img.height * scale);
      // 가운데 자리 — 시작 칸에서 얼마나 들어가는지를 칸을 넘어가며 센다
      let offX = Math.round((boxW - cx) / 2); let col = a.col;
      while (offX >= colW(col) && col < b.col) { offX -= colW(col); col += 1; }
      let offY = Math.round((boxH - cy) / 2); let row = a.row;
      while (offY >= rowH(row) && row < b.row) { offY -= rowH(row); row += 1; }
      xml = `<xdr:oneCellAnchor ${ns}><xdr:from><xdr:col>${col - 1}</xdr:col><xdr:colOff>${offX}</xdr:colOff><xdr:row>${row - 1}</xdr:row><xdr:rowOff>${offY}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/>${pic(cx, cy, '')}</xdr:oneCellAnchor>`;
    }
    const node = parse(xml).documentElement;
    dd.documentElement.appendChild(dd.importNode(node, true));
  }

  /**
   * 시트의 그림에서 시작 칸(0부터 센 열·행)이 맞는 도형을 걷는다 — 서식에 박힌 「예시」 도형을
   * 지울 때(fill-pluglink 도면). 걷은 수를 돌려준다.
   */
  async removeAnchors(sheetName: string, hit: (col: number, row: number) => boolean): Promise<number> {
    const s = this.sheet(sheetName);
    const dd = await this.doc(await this.drawingOf(s.path));
    let n = 0;
    for (const a of Array.from(dd.documentElement.childNodes) as Element[]) {
      if (a.nodeType !== 1) continue;
      const from = elems(a, XDR_NS, 'from')[0];
      if (!from) continue;
      const col = Number(elems(from, XDR_NS, 'col')[0]?.textContent);
      const row = Number(elems(from, XDR_NS, 'row')[0]?.textContent);
      if (hit(col, row)) { dd.documentElement.removeChild(a); n += 1; }
    }
    return n;
  }

  /** 시트의 그림에 도형(앵커 XML 한 덩이)을 덧붙인다 — 범례에 없는 기호를 더할 때(fill-pluglink) */
  async addAnchorXml(sheetName: string, anchorXml: string): Promise<void> {
    const s = this.sheet(sheetName);
    const dd = await this.doc(await this.drawingOf(s.path));
    const wrapped = anchorXml.replace(/^<xdr:(\w+)/, `<xdr:$1 xmlns:xdr="${XDR_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}"`);
    dd.documentElement.appendChild(dd.importNode(parse(wrapped).documentElement, true));
  }

  /** 시트의 그림 부품 경로 — 서식의 시트는 모두 그림(도형·가이드)을 갖고 있다 */
  private async drawingOf(sheetPath: string): Promise<string> {
    const f = this.zip.file(relsOf(sheetPath));
    if (!f) throw new Error('사진을 넣을 시트에 그림 자리가 없습니다.');
    const rels = parse(await f.async('string'));
    const r = elems(rels, PKG_REL_NS, 'Relationship').find((x) => (x.getAttribute('Type') ?? '').endsWith('/drawing'));
    if (!r) throw new Error('사진을 넣을 시트에 그림 자리가 없습니다.');
    return join(dirOf(sheetPath), r.getAttribute('Target') ?? '');
  }

  private async addRel(partPath: string, id: string, type: string, target: string): Promise<void> {
    const p = relsOf(partPath);
    const f = this.zip.file(p);
    const rels = f
      ? parse(await f.async('string'))
      : parse(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PKG_REL_NS}"/>`);
    const r = rels.createElementNS(PKG_REL_NS, 'Relationship');
    r.setAttribute('Id', id);
    r.setAttribute('Type', type);
    r.setAttribute('Target', target);
    rels.documentElement.appendChild(r);
    this.zip.file(p, ser(rels));
  }

  /**
   * 마무리 — 고친 XML 을 쓰고, 열 때 수식을 다시 계산하게 하고, 작성자 PC 의 경로를 걷는다.
   * calcChain 은 지운다: 칸을 바꾼 뒤 남은 계산 순서표는 엑셀이 「복구」를 띄우는 흔한 원인이다.
   */
  async save(): Promise<void> {
    for (const [p, d] of this.docs) this.zip.file(p, ser(d));

    const calcPr = elems(this.wb, S_NS, 'calcPr')[0];
    if (calcPr) calcPr.setAttribute('fullCalcOnLoad', '1');
    // 작성자 PC 의 폴더 경로(x15ac:absPath) — 받는 사람에게 갈 정보가 아니다
    for (const n of Array.from(this.wb.getElementsByTagName('*'))) {
      if (n.localName === 'absPath') {
        const alt = n.parentNode?.parentNode as Element | null; // mc:Choice → mc:AlternateContent
        (alt?.localName === 'AlternateContent' ? alt : n).parentNode?.removeChild(alt?.localName === 'AlternateContent' ? alt : n);
      }
    }
    if (this.zip.file('xl/calcChain.xml')) {
      this.zip.remove('xl/calcChain.xml');
      for (const r of elems(this.wbRels, PKG_REL_NS, 'Relationship')) {
        if ((r.getAttribute('Target') ?? '').endsWith('calcChain.xml')) r.parentNode?.removeChild(r);
      }
      for (const o of Array.from(this.ct.documentElement.childNodes) as Element[]) {
        if (o.nodeType === 1 && (o.getAttribute('PartName') ?? '').endsWith('calcChain.xml')) this.ct.documentElement.removeChild(o);
      }
    }
    const types = this.ct.documentElement;
    const hasJpeg = Array.from(types.childNodes).some(
      (n) => n.nodeType === 1 && (n as Element).getAttribute('Extension')?.toLowerCase() === 'jpeg'
    );
    if (!hasJpeg) {
      const def = this.ct.createElementNS(types.namespaceURI, 'Default');
      def.setAttribute('Extension', 'jpeg');
      def.setAttribute('ContentType', 'image/jpeg');
      types.insertBefore(def, types.firstChild);
    }
    this.zip.file('xl/workbook.xml', ser(this.wb));
    this.zip.file('xl/_rels/workbook.xml.rels', ser(this.wbRels));
    this.zip.file('[Content_Types].xml', ser(this.ct));
  }
}

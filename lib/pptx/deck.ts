/**
 * 있는 파워포인트(pptx) 고치기 — 슬라이드의 모양을 이름으로 찾아 글을 바꾸고, 그림을 갈고, 모양을 빼고 더한다.
 *
 * 사업자가 준 틀(타이런트 솔라15 · 에이치에너지 모햇)과 PDF 에서 지은 틀(루모라, lib/pptx/build)을 같은 길로 채운다.
 * 모양은 이름(cNvPr name)으로 찾는다 — 사업자가 틀을 바꿔 그 이름이 없으면 채우지 않고 멈춘다(엉뚱한 칸에 넣지 않게).
 * 견본이 바꿀 자리를 글로 적어 둔 틀(모햇 — 「[현장 주소]」 · 예시 숫자)은 이름 대신 글 덩이(paragraphs)로 찾아 그 글자만 고친다(editParagraph).
 * DOMParser · XMLSerializer 만 쓴다 — 브라우저에서 돈다(docx-kit 과 같다).
 */
import JSZip from 'jszip';
import { parseXml } from '@/lib/survey/xml-safe';
import { A_NS, P_NS, R_NS } from './xml';

const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const P14_NS = 'http://schemas.microsoft.com/office/powerpoint/2010/main';

const ser = (d: Document) => new XMLSerializer().serializeToString(d);
/** 바로 밑 자식 중 그 이름(드로잉 이름공간)의 것 — 표 칸 안에 표가 또 있지는 않지만 덩이 · 토막은 자식만 본다 */
const kids = (el: Element, local: string): Element[] =>
  Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === local && (n as Element).namespaceURI === A_NS);

/** 채워 넣는 글의 모양 — 크기(pt) · 색(「C00000」, # 없이). 안 주면 틀의 것 */
export type RunLook = { size?: number; color?: string };

/** 덩이 글의 한 자리 [start, end) 를 text 로 — 자리는 덩이 글(Paragraph.text)의 글자 차례 */
export type TextEdit = { start: number; end: number; text: string };

/**
 * 글 덩이 하나와 그 자리 — 견본이 「여기를 바꾸라」고 적은 자리(빈칸 · 예시 숫자)를 이름이 아니라 글로 찾을 때
 * (lib/solar/proposal/sample-fill). 표 칸이면 행 · 열(1부터)과 그 줄 첫 칸의 글(줄 이름 — 「대지면적」).
 */
export type Paragraph = {
  /** a:p */
  el: Element;
  /** 덩이를 품은 글 몸통(p:txBody · 표 칸의 a:txBody) */
  body: Element;
  /** 덩이가 든 모양(p:sp · 표의 p:graphicFrame) */
  shape: Element;
  cell: { row: number; col: number; rowLabel: string } | null;
  /** 덩이의 글 — 토막(a:r · a:fld)의 글을 차례대로, 줄바꿈(a:br)은 \n */
  text: string;
};

/** 덩이의 토막 글(a:t)들 — 차례대로. 줄바꿈(a:br)은 null(덩이 글에서 「\n」 한 글자 · 고칠 수 없다) */
function segmentsOf(p: Element): (Element | null)[] {
  const out: (Element | null)[] = [];
  for (const n of Array.from(p.childNodes)) {
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    if (el.namespaceURI !== A_NS) continue;
    if (el.localName === 'r' || el.localName === 'fld') {
      const t = kids(el, 't')[0];
      if (t) out.push(t);
    } else if (el.localName === 'br') out.push(null);
  }
  return out;
}
const paragraphText = (p: Element): string =>
  segmentsOf(p)
    .map((t) => (t ? (t.textContent ?? '') : '\n'))
    .join('');

/**
 * 토막 글들에 고칠 자리를 놓는다 [순수] — 바꿀 글은 자리가 시작되는 토막에 들어가고, 걸친 뒤 토막에서는 그 글자만 빠진다. 자리는 토막을
 * 이은 글의 글자 차례, null 은 줄바꿈(한 글자 · 걸치면 멈춘다). 고칠 자리끼리 겹치지 않아야 한다.
 * 견본이 숫자만 크게 쓴 「137.15」 | 「kW(예시) 기준 …」 같은 가름이 그대로 남는다(「480.35」 | 「kW 기준 …」).
 */
export function editRuns(runs: (string | null)[], edits: TextEdit[]): (string | null)[] {
  const out = [...runs];
  const len = (r: string | null) => (r === null ? 1 : r.length);
  const starts: number[] = [];
  let at = 0;
  for (const r of runs) {
    starts.push(at);
    at += len(r);
  }
  // 뒤에서부터 — 앞 자리의 글자 차례가 그대로다
  for (const ed of [...edits].sort((a, b) => b.start - a.start)) {
    const hit = runs.map((_, i) => i).filter((i) => starts[i] + len(runs[i]) > ed.start && starts[i] < ed.end);
    if (hit.some((i) => runs[i] === null)) throw new Error('줄바꿈을 걸친 글은 고칠 수 없습니다.');
    if (!hit.length) {
      // 토막 사이(끝)에 넣기 — 그 자리에서 끝나는 토막 뒤에 붙인다
      const i = runs.map((_, j) => j).filter((j) => runs[j] !== null && starts[j] + len(runs[j]) === ed.start).pop();
      if (i === undefined) throw new Error('고칠 자리를 찾지 못했습니다.');
      out[i] = (out[i] ?? '') + ed.text;
      continue;
    }
    hit.forEach((i, k) => {
      const txt = out[i] ?? '';
      const a = Math.max(ed.start, starts[i]) - starts[i];
      const b = Math.min(ed.end, starts[i] + len(runs[i])) - starts[i];
      out[i] = txt.slice(0, a) + (k === 0 ? ed.text : '') + txt.slice(b);
    });
  }
  return out;
}
/** 모양(sp · graphicFrame · pic · cxnSp) — 노드에서 위로 */
function shapeAbove(node: Node): Element | null {
  for (let n: Node | null = node.parentNode; n; n = n.parentNode) {
    const el = n as Element;
    if (n.nodeType === 1 && el.namespaceURI === P_NS && ['sp', 'graphicFrame', 'pic', 'cxnSp'].includes(el.localName)) return el;
  }
  return null;
}
/** EMU 칸(lIns 등) — 적힌 것이 없으면 파워포인트 기본 0.1인치 */
const emuAttr = (el: Element | undefined, name: string): number => {
  const v = el?.getAttribute(name);
  return v === null || v === undefined || v === '' ? 91_440 : Number(v);
};
/** 관계 파일의 줄(Relationship)들 */
const relsIn = (d: Document | Element): Element[] => Array.from(d.getElementsByTagNameNS(PKG_REL_NS, 'Relationship'));
/** 내용의 SHA-256(16진) — 브라우저 · node 둘 다의 Web Crypto */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
/** 'ppt/slides/slide2.xml' 기준 상대 경로 '../media/image3.png' → 'ppt/media/image3.png' */
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}
const relsPathOf = (part: string) => part.replace(/([^/]+)$/, '_rels/$1.rels');

/**
 * 차례에서 걷은 슬라이드를 묶음에서 지울 때 같이 지울 자리 — 그 장과 (있으면) 그 메모 장, 둘의 관계 파일, 둘만 쓰던 그림. [순수]
 * 레이아웃 · 마스터 · 다른 장도 쓰는 그림은 남긴다. 다른 부품이 그 장을 가리키면(다른 장의 하이퍼링크 등) 아무것도 지우지 않는다 —
 * 가리키는 곳이 사라지면 그쪽이 깨진다.
 * targets: 관계 파일 자리 → 그 대상 부품 자리들(차례에서 걷은 뒤의 묶음 — 프레젠테이션은 그 장을 더 가리키지 않는다).
 */
export function orphansOf(part: string, targets: ReadonlyMap<string, readonly string[]>): string[] {
  const own = [part, ...(targets.get(relsPathOf(part)) ?? []).filter((t) => /\/notesSlides\/[^/]+\.xml$/.test(t))];
  const ownRels = own.map(relsPathOf);
  const usedElsewhere = (path: string) => Array.from(targets).some(([relFile, ts]) => !ownRels.includes(relFile) && ts.includes(path));
  if (usedElsewhere(part)) return [];
  const media = new Set(own.flatMap((p) => targets.get(relsPathOf(p)) ?? []).filter((t) => t.startsWith('ppt/media/')));
  return [...own, ...ownRels.filter((r) => targets.has(r)), ...Array.from(media).filter((m) => !usedElsewhere(m))];
}

export class Slide {
  private dirty = false;
  constructor(
    private readonly deck: Deck,
    readonly part: string,
    readonly doc: Document,
    readonly rels: Document,
  ) {}

  /** 모양 묶음(spTree) — 새 모양은 여기 끝에 붙는다(맨 위에 그려진다) */
  get tree(): Element {
    const t = this.doc.getElementsByTagNameNS(P_NS, 'spTree')[0];
    if (!t) throw new Error(`${this.part} 에 모양 묶음이 없습니다.`);
    return t;
  }

  /** 이름이 name 인 모양(sp · pic · graphicFrame · grpSp) — 없으면 null */
  find(name: string): Element | null {
    const all = this.doc.getElementsByTagNameNS(P_NS, 'cNvPr');
    for (let i = 0; i < all.length; i++) {
      if (all[i].getAttribute('name') === name) return all[i].parentNode!.parentNode as Element;
    }
    return null;
  }

  shape(name: string): Element {
    const el = this.find(name);
    if (!el) throw new Error(`템플릿이 바뀌었습니다 — ${this.label}에 「${name}」 칸이 없습니다.`);
    return el;
  }

  get label(): string {
    const n = this.deck.slides.indexOf(this.part) + 1;
    return `${n}번째 슬라이드`;
  }

  /** 다음 모양 번호 — 한 슬라이드 안에서 겹치면 파워포인트가 「복구」를 묻는다 */
  nextId(): number {
    let max = 1;
    const all = this.doc.getElementsByTagNameNS(P_NS, 'cNvPr');
    for (let i = 0; i < all.length; i++) max = Math.max(max, Number(all[i].getAttribute('id')) || 0);
    return max + 1;
  }

  /**
   * 그 모양의 글을 바꾼다 — 첫 덩이의 덩이 모양(pPr)과 첫 토막의 글자 모양(rPr)을 그대로 두고 글만. 줄바꿈(\n)마다 덩이를 나눈다.
   * 틀의 견본 글(「000 kW」)이 지닌 글꼴 · 크기 · 색이 그대로 남는다.
   */
  setText(name: string, text: string, opts: RunLook = {}): void {
    this.rewrite(this.bodyOf(name), text, opts);
  }

  /** 이 장의 글 덩이 전부 — 글상자와 표 칸마다(묶음 안의 모양까지) 차례대로 */
  paragraphs(): Paragraph[] {
    const out: Paragraph[] = [];
    const ps = this.doc.getElementsByTagNameNS(A_NS, 'p');
    for (let i = 0; i < ps.length; i++) {
      const el = ps[i];
      const body = el.parentNode as Element | null;
      if (!body || body.localName !== 'txBody') continue;
      const shape = shapeAbove(body);
      if (!shape) continue;
      out.push({ el, body, shape, cell: this.placeInTable(body), text: paragraphText(el) });
    }
    return out;
  }

  /** 표 칸의 글 몸통이면 그 칸의 행 · 열과 줄 이름(그 줄 첫 칸의 글) */
  private placeInTable(body: Element): Paragraph['cell'] {
    const tc = body.parentNode as Element | null;
    if (!tc || tc.localName !== 'tc' || tc.namespaceURI !== A_NS) return null;
    const tr = tc.parentNode as Element;
    const tbl = tr.parentNode as Element;
    const first = kids(tr, 'tc')[0];
    const label = first ? kids(kids(first, 'txBody')[0] ?? first, 'p').map(paragraphText).join(' ') : '';
    return { row: kids(tbl, 'tr').indexOf(tr) + 1, col: kids(tr, 'tc').indexOf(tc) + 1, rowLabel: label };
  }

  /**
   * 덩이의 글을 자리로 고친다 — 토막(글자 모양)은 그대로 두고 그 글자들만. 바꿀 글은 자리가 시작되는 토막에 들어가고, 걸친 뒤 토막에서는
   * 그 글자만 빠진다(견본이 숫자만 크게 쓴 「137.15」 | 「kW(예시) 기준 …」 같은 가름이 그대로 남는다). 줄바꿈을 걸치면 멈춘다.
   */
  editParagraph(p: Element, edits: TextEdit[]): void {
    if (!edits.length) return;
    const segs = segmentsOf(p);
    let next: (string | null)[];
    try {
      next = editRuns(
        segs.map((t) => (t ? (t.textContent ?? '') : null)),
        edits,
      );
    } catch (e) {
      throw new Error(`${this.label} — ${(e as Error).message}`);
    }
    segs.forEach((t, i) => {
      if (t && t.textContent !== next[i]) t.textContent = next[i];
    });
    this.dirty = true;
  }

  /** 글 몸통을 통째로 다시 쓴다(setText 와 같다 — 첫 덩이 · 첫 토막의 모양) */
  rewriteBody(body: Element, text: string, opts: RunLook = {}): void {
    this.rewrite(body, text, opts);
  }

  /** 글 몸통 안 토막의 글자색 from 을 to 로(「FF0000」 — # 없이) */
  recolor(body: Element, from: string, to: string): void {
    for (const c of Array.from(body.getElementsByTagNameNS(A_NS, 'srgbClr'))) {
      const fill = c.parentNode as Element | null;
      const owner = fill?.parentNode as Element | null;
      if (fill?.localName !== 'solidFill' || !owner || !['rPr', 'endParaRPr'].includes(owner.localName)) continue;
      if ((c.getAttribute('val') ?? '').toUpperCase() === from.toUpperCase()) {
        c.setAttribute('val', to);
        this.dirty = true;
      }
    }
  }

  /** 글 몸통에 글이 들어갈 너비(pt) — 표 칸이면 열 너비(합친 칸은 합) − 칸 여백, 글상자면 모양 폭 − 좌우 여백 */
  innerWidthPt(body: Element): number {
    const tc = body.parentNode as Element | null;
    if (tc && tc.localName === 'tc' && tc.namespaceURI === A_NS) {
      const tr = tc.parentNode as Element;
      const tbl = tr.parentNode as Element;
      const cols = kids(kids(tbl, 'tblGrid')[0] ?? tbl, 'gridCol').map((c) => Number(c.getAttribute('w')) || 0);
      const at = kids(tr, 'tc').indexOf(tc);
      const span = Number(tc.getAttribute('gridSpan')) || 1;
      const w = cols.slice(at, at + span).reduce((a, b) => a + b, 0);
      const pr = kids(tc, 'tcPr')[0];
      return (w - emuAttr(pr, 'marL') - emuAttr(pr, 'marR')) / 12_700;
    }
    const shape = shapeAbove(body);
    const pr = kids(body, 'bodyPr')[0];
    return shape ? (this.boxOfEl(shape).w - emuAttr(pr, 'lIns') - emuAttr(pr, 'rIns')) / 12_700 : 0;
  }

  /**
   * 글 몸통이 너비(pt)에 들게 글자를 줄인다 — 덩이마다 measure(글, 크기)로 재어 가장 많이 줄여야 하는 비율로 몸통의 토막을 다 줄인다
   * (한 칸 안의 큰 글 · 작은 글의 차이는 그대로). 크기가 안 적힌 토막은 fallback(pt)으로 잰다. 넘치지 않으면 그대로.
   */
  fitBody(body: Element, widthPt: number, measure: (text: string, sizePt: number) => number, opts: { min: number; fallback: number }): void {
    const sizeOf = (r: Element): number => {
      const sz = Number(kids(r, 'rPr')[0]?.getAttribute('sz'));
      return sz ? sz / 100 : opts.fallback;
    };
    let factor = 1;
    for (const p of kids(body, 'p')) {
      const text = paragraphText(p);
      const runs = kids(p, 'r');
      if (!text.trim() || !runs.length) continue;
      const size = Math.max(...runs.map(sizeOf));
      let s = size;
      while (s > opts.min && measure(text, s) > widthPt) s -= 0.5;
      factor = Math.min(factor, s / size);
    }
    if (factor >= 1) return;
    for (const r of Array.from(body.getElementsByTagNameNS(A_NS, 'r'))) {
      let rp = kids(r, 'rPr')[0];
      if (!rp) {
        rp = this.doc.createElementNS(A_NS, 'a:rPr');
        r.insertBefore(rp, r.firstChild);
      }
      rp.setAttribute('sz', String(Math.round(Math.max(opts.min, Math.round(sizeOf(r) * factor * 2) / 2) * 100)));
    }
    this.dirty = true;
  }

  /** 모양의 글 몸통(p:txBody) */
  private bodyOf(name: string): Element {
    const body = this.shape(name).getElementsByTagNameNS(P_NS, 'txBody')[0];
    if (!body) throw new Error(`${this.label}의 「${name}」은 글을 받는 칸이 아닙니다.`);
    return body;
  }

  /** 글 몸통을 다시 쓴다 — 첫 덩이의 pPr · 첫 토막의 rPr(없으면 덩이 끝 모양)을 줄마다 */
  private rewrite(body: Element, text: string, opts: RunLook): void {
    const ps = kids(body, 'p');
    const first = ps[0];
    const pPr = first ? (kids(first, 'pPr')[0] ?? null) : null;
    const rPr = first ? (first.getElementsByTagNameNS(A_NS, 'rPr')[0] ?? kids(first, 'endParaRPr')[0] ?? null) : null;
    for (const p of ps) body.removeChild(p);
    for (const line of text.split('\n')) {
      const p = this.doc.createElementNS(A_NS, 'a:p');
      if (pPr) p.appendChild(pPr.cloneNode(true));
      p.appendChild(this.runOf(line, rPr, opts));
      body.appendChild(p);
    }
    this.dirty = true;
  }

  /** 글 토막 하나 — base(rPr · endParaRPr)의 글자 모양을 옮겨 싣고, 크기 · 색만 바꿀 수 있다 */
  private runOf(text: string, base: Element | null, look: RunLook): Element {
    const r = this.doc.createElementNS(A_NS, 'a:r');
    if (base || look.size || look.color) {
      const rp = this.doc.createElementNS(A_NS, 'a:rPr');
      for (const a of Array.from(base?.attributes ?? [])) rp.setAttribute(a.name, a.value);
      for (const c of Array.from(base?.childNodes ?? [])) rp.appendChild(c.cloneNode(true));
      // 글이 칸보다 길면 글자를 줄여 넣는다(받는 쪽이 정한 크기 — 1/100 pt)
      if (look.size) rp.setAttribute('sz', String(Math.round(look.size * 100)));
      if (look.color) {
        // 채움은 a:ln 바로 뒤, 다른 것보다 앞(스키마 차례) — 옛 채움을 걷고 그 자리에
        for (const tag of ['solidFill', 'noFill', 'gradFill', 'pattFill', 'grpFill']) for (const f of kids(rp, tag)) rp.removeChild(f);
        const fill = this.doc.createElementNS(A_NS, 'a:solidFill');
        const clr = this.doc.createElementNS(A_NS, 'a:srgbClr');
        clr.setAttribute('val', look.color);
        fill.appendChild(clr);
        const ln = kids(rp, 'ln')[0];
        rp.insertBefore(fill, ln ? ln.nextSibling : rp.firstChild);
      }
      r.appendChild(rp);
    }
    const t = this.doc.createElementNS(A_NS, 'a:t');
    t.textContent = text;
    r.appendChild(t);
    return r;
  }

  /** 새 그림을 이 슬라이드의 관계에 더하고 그 번호(rId)를 준다 */
  addMedia(bytes: Uint8Array, ext: 'jpeg' | 'png'): string {
    const path = this.deck.addMediaFile(bytes, ext);
    const root = this.rels.documentElement;
    const used = new Set(relsIn(root).map((r) => r.getAttribute('Id')));
    let n = used.size + 1;
    while (used.has(`rId${n}`)) n++;
    const rel = this.rels.createElementNS(PKG_REL_NS, 'Relationship');
    rel.setAttribute('Id', `rId${n}`);
    rel.setAttribute('Type', IMAGE_REL);
    rel.setAttribute('Target', `../media/${path.split('/').pop()}`);
    root.appendChild(rel);
    this.dirty = true;
    return `rId${n}`;
  }

  /** 모양을 뺀다 */
  remove(name: string): Element {
    return this.removeEl(this.shape(name));
  }

  /** 그 모양을 뺀다(글로 찾은 모양 — 이름이 아니라 요소로) */
  removeEl(el: Element): Element {
    el.parentNode!.removeChild(el);
    this.dirty = true;
    return el;
  }

  /** 그 모양 글의 크기(pt) — 첫 토막(없으면 덩이 끝)의 sz. 적힌 것이 없으면 null(물려받는 크기) */
  fontSizeOf(name: string): number | null {
    const sp = this.shape(name);
    for (const tag of ['rPr', 'endParaRPr']) {
      const el = sp.getElementsByTagNameNS(A_NS, tag)[0];
      const sz = el?.getAttribute('sz');
      if (sz) return Number(sz) / 100;
    }
    return null;
  }

  /** 모양의 자리 칸 — 왼쪽 위(off) · 크기(ext). 없으면 멈춘다 */
  private xfrmOfEl(el: Element): { off: Element; ext: Element } {
    // a:ext 는 이름표의 확장 칸(a:extLst/a:ext — 만든 번호)에도 있다 — 자리 칸(xfrm)의 자식만 본다
    const xfrm = el.getElementsByTagNameNS(A_NS, 'xfrm')[0] ?? el.getElementsByTagNameNS(P_NS, 'xfrm')[0];
    const kid = (local: string) => Array.from(xfrm?.childNodes ?? []).find((n): n is Element => n.nodeType === 1 && (n as Element).localName === local);
    const off = kid('off');
    const ext = kid('ext');
    if (!off || !ext) throw new Error(`${this.label}의 「${this.nameOf(el)}」에 자리가 없습니다.`);
    return { off, ext };
  }

  /** 모양의 이름(cNvPr name) */
  nameOf(el: Element): string {
    return el.getElementsByTagNameNS(P_NS, 'cNvPr')[0]?.getAttribute('name') ?? '';
  }

  /** 모양의 자리(EMU) — 그 자리에 새 것을 얹을 때 */
  boxOf(name: string): { x: number; y: number; w: number; h: number } {
    return this.boxOfEl(this.shape(name));
  }

  boxOfEl(el: Element): { x: number; y: number; w: number; h: number } {
    const { off, ext } = this.xfrmOfEl(el);
    return { x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), w: Number(ext.getAttribute('cx')), h: Number(ext.getAttribute('cy')) };
  }

  /**
   * XML 글로 지은 모양(lib/pptx/xml)을 붙인다 — 맨 위에(나중에 그려진다), 또는 before 라는 모양 바로 밑에(그 모양이 위로 온다).
   */
  append(xml: string, before?: string): void {
    const frag = parseXml(`<root xmlns:p="${P_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">${xml}</root>`);
    const ref = before ? this.shape(before) : null;
    for (const node of Array.from(frag.documentElement.childNodes)) {
      if (node.nodeType !== 1) continue;
      const el = this.doc.importNode(node, true);
      if (ref) ref.parentNode!.insertBefore(el, ref);
      else this.tree.appendChild(el);
    }
    this.dirty = true;
  }

  flush(zip: JSZip): void {
    if (!this.dirty) return;
    zip.file(this.part, ser(this.doc));
    zip.file(relsPathOf(this.part), ser(this.rels));
    this.dirty = false;
  }
}

export class Deck {
  /** 슬라이드 차례대로의 자리('ppt/slides/slide1.xml') */
  slides: string[] = [];
  size = { cx: 0, cy: 0 };
  private readonly opened = new Map<string, Slide>();
  private mediaSeq = 0;

  private constructor(readonly zip: JSZip) {}

  static async open(data: ArrayBuffer | Uint8Array): Promise<Deck> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch {
      throw new Error('파워포인트 파일(pptx)이 아닙니다.');
    }
    const deck = new Deck(zip);
    const presXml = await zip.file('ppt/presentation.xml')?.async('string');
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (!presXml || !relsXml) throw new Error('파워포인트 파일(pptx)이 아닙니다.');
    const pres = parseXml(presXml);
    const rels = parseXml(relsXml);
    const target = new Map(relsIn(rels).map((r) => [r.getAttribute('Id'), r.getAttribute('Target') ?? '']));
    const ids = pres.getElementsByTagNameNS(P_NS, 'sldId');
    for (let i = 0; i < ids.length; i++) deck.slides.push(resolve('ppt/presentation.xml', target.get(ids[i].getAttributeNS(R_NS, 'id') ?? ids[i].getAttribute('r:id')) ?? ''));
    const sz = pres.getElementsByTagNameNS(P_NS, 'sldSz')[0];
    deck.size = { cx: Number(sz?.getAttribute('cx')), cy: Number(sz?.getAttribute('cy')) };
    return deck;
  }

  /** n 번째 슬라이드(1부터) */
  async slide(n: number): Promise<Slide> {
    const part = this.slides[n - 1];
    if (!part) throw new Error(`템플릿이 바뀌었습니다 — ${n}번째 슬라이드가 없습니다(지금 ${this.slides.length}장).`);
    const hit = this.opened.get(part);
    if (hit) return hit;
    const xml = await this.zip.file(part)!.async('string');
    const relXml = (await this.zip.file(relsPathOf(part))?.async('string')) ?? `<Relationships xmlns="${PKG_REL_NS}"/>`;
    const s = new Slide(this, part, parseXml(xml), parseXml(relXml));
    this.opened.set(part, s);
    return s;
  }

  /** 매체 자리에 그림 파일을 더한다 — 이름은 겹치지 않게 hb-n */
  addMediaFile(bytes: Uint8Array, ext: 'jpeg' | 'png'): string {
    let path: string;
    do path = `ppt/media/hb-${++this.mediaSeq}.${ext}`;
    while (this.zip.file(path));
    this.zip.file(path, bytes);
    this.needsType.add(ext);
    return path;
  }
  private readonly needsType = new Set<string>();

  /** 열어서 고친 슬라이드를 묶음에 적어 둔다 — 묶음 전체의 관계를 읽기 전에(고친 관계가 아직 메모리에만 있으면 안 보인다) */
  private sync(): void {
    for (const s of this.opened.values()) s.flush(this.zip);
  }

  /** 묶음 안 모든 관계(.rels)의 대상 — 관계 파일 자리 → 대상 부품 자리들 */
  private async allTargets(): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (const f of this.zip.file(/\.rels$/)) {
      // 'ppt/slides/_rels/slide2.xml.rels' 의 주인은 'ppt/slides/slide2.xml' · 묶음 뿌리의 '_rels/.rels' 는 뿌리 기준
      const owner = f.name === '_rels/.rels' ? '' : f.name.replace(/_rels\/([^/]+)\.rels$/, '$1');
      const doc = parseXml(await f.async('string'));
      out.set(
        f.name,
        relsIn(doc)
          .filter((r) => r.getAttribute('TargetMode') !== 'External')
          .map((r) => resolve(owner, r.getAttribute('Target') ?? '')),
      );
    }
    return out;
  }

  /**
   * 그 그림(내용의 SHA-256, 16진)을 쓰는 슬라이드의 차례들(1부터) — 그림 한 장으로 된 틀의 장을 차례가 아니라 내용으로 찾는다
   * (사업자가 장을 더하거나 빼 차례가 밀려도 엉뚱한 장을 짚지 않게).
   */
  async slidesUsing(sha256: string): Promise<number[]> {
    this.sync();
    const memo = new Map<string, string>();
    const hits: number[] = [];
    for (let i = 0; i < this.slides.length; i++) {
      const part = this.slides[i];
      const relXml = await this.zip.file(relsPathOf(part))?.async('string');
      if (!relXml) continue;
      for (const r of relsIn(parseXml(relXml))) {
        if (r.getAttribute('Type') !== IMAGE_REL || r.getAttribute('TargetMode') === 'External') continue;
        const path = resolve(part, r.getAttribute('Target') ?? '');
        let h = memo.get(path);
        if (h === undefined) {
          const bytes = await this.zip.file(path)?.async('uint8array');
          h = bytes ? await sha256Hex(bytes) : '';
          memo.set(path, h);
        }
        if (h === sha256) {
          hits.push(i + 1);
          break;
        }
      }
    }
    return hits;
  }

  /**
   * 슬라이드를 뺀다(1부터) — 차례 목록 · 관계 · 구역 · 맞춤 쇼에서 걷고, 그 장의 파일 · 메모 장 · 이제 아무 장도 안 쓰는 그림까지
   * 묶음에서 지운다(남겨 두면 파일이 그만큼 무겁고, 주인 없는 부품을 「복구」로 묻는 프로그램이 있다). 다른 부품이 그 장을
   * 가리키면(다른 장의 하이퍼링크 등) 파일은 남긴다 — 가리키는 곳이 사라지면 그쪽이 깨진다.
   */
  async dropSlide(n: number): Promise<void> {
    const part = this.slides[n - 1];
    if (!part) throw new Error(`${n}번째 슬라이드가 없습니다(지금 ${this.slides.length}장).`);
    this.sync();
    const pres = parseXml(await this.zip.file('ppt/presentation.xml')!.async('string'));
    const presRels = parseXml(await this.zip.file('ppt/_rels/presentation.xml.rels')!.async('string'));
    const rel = relsIn(presRels).find((r) => resolve('ppt/presentation.xml', r.getAttribute('Target') ?? '') === part);
    if (!rel) throw new Error(`${n}번째 슬라이드의 관계가 없습니다.`);
    const rid = rel.getAttribute('Id');
    const ridOf = (el: Element) => el.getAttributeNS(R_NS, 'id') || el.getAttribute('r:id');
    let numId: string | null = null;
    for (const s of Array.from(pres.getElementsByTagNameNS(P_NS, 'sldId'))) {
      if (ridOf(s) !== rid) continue;
      numId = s.getAttribute('id');
      s.parentNode!.removeChild(s);
    }
    // 구역(p14:sectionLst)은 슬라이드 번호로, 맞춤 쇼(p:custShowLst)는 관계로 그 장을 가리킨다 — 남으면 파워포인트가 「복구」를 묻는다
    for (const s of Array.from(pres.getElementsByTagNameNS(P14_NS, 'sldId'))) if (numId && s.getAttribute('id') === numId) s.parentNode!.removeChild(s);
    for (const s of Array.from(pres.getElementsByTagNameNS(P_NS, 'sld'))) if (ridOf(s) === rid) s.parentNode!.removeChild(s);
    rel.parentNode!.removeChild(rel);
    this.zip.file('ppt/presentation.xml', ser(pres));
    this.zip.file('ppt/_rels/presentation.xml.rels', ser(presRels));
    this.slides.splice(n - 1, 1);
    this.opened.delete(part);
    // 파일 속성의 장 수 — 파워포인트는 저장할 때 다시 쓰지만, 파인더 · 미리보기가 이 값을 보인다
    const app = await this.zip.file('docProps/app.xml')?.async('string');
    if (app) this.zip.file('docProps/app.xml', app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${this.slides.length}</Slides>`));

    const gone = new Set(orphansOf(part, await this.allTargets()));
    if (!gone.size) return;
    for (const p of gone) this.zip.remove(p);
    const ct = parseXml(await this.zip.file('[Content_Types].xml')!.async('string'));
    for (const o of Array.from(ct.getElementsByTagNameNS(CT_NS, 'Override'))) {
      if (gone.has((o.getAttribute('PartName') ?? '').replace(/^\//, ''))) o.parentNode!.removeChild(o);
    }
    this.zip.file('[Content_Types].xml', ser(ct));
  }

  /** 고친 것을 묶어 파일로 — 브라우저는 Blob, 시험(node)은 Uint8Array */
  async save(): Promise<Blob | Uint8Array> {
    this.sync();
    if (this.needsType.size) {
      const ct = parseXml(await this.zip.file('[Content_Types].xml')!.async('string'));
      const have = new Set(Array.from(ct.getElementsByTagNameNS(CT_NS, 'Default')).map((d) => (d.getAttribute('Extension') ?? '').toLowerCase()));
      for (const ext of this.needsType) {
        if (have.has(ext)) continue;
        const d = ct.createElementNS(CT_NS, 'Default');
        d.setAttribute('Extension', ext);
        d.setAttribute('ContentType', ext === 'png' ? 'image/png' : 'image/jpeg');
        ct.documentElement.insertBefore(d, ct.documentElement.firstChild);
      }
      this.zip.file('[Content_Types].xml', ser(ct));
    }
    const opts = { compression: 'DEFLATE' as const };
    return typeof window !== 'undefined'
      ? this.zip.generateAsync({ ...opts, type: 'blob', mimeType: PPTX_MIME })
      : this.zip.generateAsync({ ...opts, type: 'uint8array' });
  }
}

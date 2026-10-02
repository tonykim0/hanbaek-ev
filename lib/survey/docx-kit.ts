/**
 * 워드(docx) 표 칸에 글자와 사진을 넣는 도구 — 실사보고서 생성기들이 같이 쓴다.
 *
 * 계약서 생성기(lib/fillDocx)는 이름표(SDT)가 박힌 칸을 채운다. 사진대지 서식에는 이름표가
 * 없다 — 표의 몇 번째 줄 몇 번째 칸이 그 자리다. 그래서 여기 도구는 「칸」을 받아 그 안을
 * 바꾼다. 어느 칸인지 찾는 것은 생성기의 일이다(서식마다 다르다).
 *
 * DOMParser·XMLSerializer 만 쓴다 — 브라우저에서 돌고, 시험에서는 xmldom 을 꽂는다.
 */
import type JSZip from 'jszip';
import { fillWindow } from './fit';
import { parseXml, xmlSafe } from './xml-safe';
import { packZip } from './pack';

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

/** 1 트윕 = 635 EMU (1인치 = 1440 트윕 = 914400 EMU) */
export const EMU_PER_TWIP = 635;

/** 생성기가 넘기는 사진 — 이미 줄여 JPEG 로 구운 것(lib/survey/prepare-image) */
export interface PreparedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  /** 사진 위 표시가 든 자리(비율 0~1) — 칸에 맞춰 자를 때 이 자리는 남긴다(xlsx-kit addPicture fill) */
  focus?: { x0: number; y0: number; x1: number; y1: number };
  /**
   * 굽지 않은 표시 — 엑셀(플러그링크)은 사진에 굽지 않고 엑셀 도형으로 얹는다(lib/survey/xlsx-marks).
   * 워드는 굽는다(이 칸이 비어 있다).
   */
  marks?: import('./annot').Annot[];
  markStyle?: import('./annot').NumStyle;
}

export const childrenNamed = (el: Element, local: string): Element[] =>
  Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).localName === local
  );

/** 표의 줄 · 줄의 칸 (중첩 표는 세지 않는다 — 자식만 본다) */
export const rowsOf = (tbl: Element) => childrenNamed(tbl, 'tr');
export const cellsOf = (tr: Element) => childrenNamed(tr, 'tc');

/** 요소 안 글자를 이어 붙인다 — 칸을 찾을 때 쓴다 */
export function textOf(el: Element): string {
  const ts = el.getElementsByTagNameNS(W_NS, 't');
  let s = '';
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent ?? '';
  return s;
}

/** 줄 높이(트윕) — 사진 줄은 높다(4500) */
export function rowHeight(tr: Element): number {
  const h = tr.getElementsByTagNameNS(W_NS, 'trHeight')[0];
  return h ? Number(h.getAttributeNS(W_NS, 'val') ?? h.getAttribute('w:val') ?? 0) : 0;
}

/** 칸 폭(트윕) */
export function cellWidth(tc: Element): number {
  const w = tc.getElementsByTagNameNS(W_NS, 'tcW')[0];
  return w ? Number(w.getAttributeNS(W_NS, 'w') ?? w.getAttribute('w:w') ?? 0) : 0;
}

function el(doc: Document, local: string): Element {
  return doc.createElementNS(W_NS, `w:${local}`);
}

/**
 * 문단의 글자 모양 — 새 글줄(run)이 칸의 글자 크기를 따르게. ★글이 가장 긴 글줄★의 모양(서식이 보여 주던 글의
 * 꼴), 없으면 문단 표시의 모양을 베낀다. 첫 글줄을 베꼈더니 그것이 밑줄 친 빈칸(「   거점」의 번호 자리)이라
 * 제목·대수 칸 글 전체에 밑줄이 그어졌다.
 */
function paragraphRunProps(p: Element): Element | null {
  const len = (r: Element) => Array.from(r.getElementsByTagNameNS(W_NS, 't')).map((t) => t.textContent ?? '').join('').trim().length;
  const textRun = childrenNamed(p, 'r').filter((r) => len(r) > 0).sort((a, b) => len(b) - len(a))[0];
  const runPr = textRun ? childrenNamed(textRun, 'rPr')[0] : undefined;
  if (runPr) return runPr.cloneNode(true) as Element;
  const pPr = childrenNamed(p, 'pPr')[0];
  const rPr = pPr ? childrenNamed(pPr, 'rPr')[0] : undefined;
  return rPr ? (rPr.cloneNode(true) as Element) : null;
}

/** 문단을 비운다 — 모양(pPr)만 남긴다 */
function emptyParagraph(p: Element): void {
  for (const k of Array.from(p.childNodes)) if ((k as Element).localName !== 'pPr') p.removeChild(k);
}

/**
 * 문단의 글을 통째로 바꾼다 — 글자 모양은 문단의 첫 글줄(없으면 문단 표시)의 것을 따른다.
 * ★문단을 통째로 비우고 새 글줄 하나를 짓는다★ — 글줄(r)의 글자만 비우면 서식의 빈칸 꼴(밑줄 친 입력란 sdt)·
 * 탭이 남아 「＿＿＿ 2 기」가 되고, 사진 칸에서는 탭 뒤로 사진이 다음 줄로 밀렸다(SK 측면이 전면보다 낮았다).
 * 줄바꿈(\n)은 같은 글줄 안의 줄바꿈(<w:br/>)으로 넣는다. 빈 글이면 문단만 비운다.
 */
export function setParagraphText(p: Element, text: string): void {
  const doc = p.ownerDocument;
  const rPr = paragraphRunProps(p);
  emptyParagraph(p);
  if (!text) return;
  const run = el(doc, 'r');
  if (rPr) {
    /*
     * 서식의 안내 칸은 노랗게 칠해져 있다(「여기에 적으세요」 — 형광 highlight 또는 글자 바탕 shd). 값을 넣었으면
     * 그 표시는 끝났다 — 남기면 자동으로 들어간 전주번호·차단기 스펙이 노란 바탕으로 나갔다.
     */
    for (const h of childrenNamed(rPr, 'highlight')) rPr.removeChild(h);
    for (const sh of childrenNamed(rPr, 'shd')) {
      const fill = (sh.getAttributeNS(W_NS, 'fill') || sh.getAttribute('w:fill') || '').toLowerCase();
      if (fill && fill !== 'auto' && fill !== 'ffffff') rPr.removeChild(sh);
    }
    run.appendChild(rPr);
  }
  xmlSafe(text).split('\n').forEach((line, i) => {
    if (i > 0) run.appendChild(el(doc, 'br'));
    const t = el(doc, 't');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = line;
    run.appendChild(t);
  });
  p.appendChild(run);
}

/**
 * 칸의 글자를 통째로 바꾼다 — 첫 문단에 적고(setParagraphText), 둘째 문단부터는 비운다(서식의 안내 글 —
 * 괄호 말이 남으면 값과 섞인다). 문단 수는 그대로 둔다 — 칸 높이가 서식대로 남는다.
 */
export function setCellText(tc: Element, text: string): void {
  const doc = tc.ownerDocument;
  const ps = childrenNamed(tc, 'p');
  const p = ps[0] ?? tc.appendChild(el(doc, 'p'));
  for (const extra of ps.slice(1)) emptyParagraph(extra);
  setParagraphText(p, text);
}

/** 문단 모양(pPr)의 자식 순서 — 스키마(CT_PPr)가 정한다. 어긋나면 워드가 무시하거나 검사기가 잡는다 */
const PPR_ORDER = [
  'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers',
  'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE',
  'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents',
  'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle',
  'rPr', 'sectPr', 'pPrChange',
];

/** 문단 모양에 한 가지를 둔다(있으면 그것) — 스키마 순서 자리에 */
export function pPrChild(p: Element, local: string): Element {
  const doc = p.ownerDocument;
  let pPr = childrenNamed(p, 'pPr')[0];
  if (!pPr) { pPr = el(doc, 'pPr'); p.insertBefore(pPr, p.firstChild); }
  const have = childrenNamed(pPr, local)[0];
  if (have) return have;
  const rank = PPR_ORDER.indexOf(local);
  const after = Array.from(pPr.childNodes).find((k) => k.nodeType === 1 && PPR_ORDER.indexOf((k as Element).localName) > rank);
  return pPr.insertBefore(el(doc, local), after ?? null);
}

/** 칸 문단을 가운데로 — 사진은 칸 가운데 선다 */
function centerParagraph(p: Element): void {
  pPrChild(p, 'jc').setAttributeNS(W_NS, 'w:val', 'center');
}

/** 쪽 나눔 문단 */
export function pageBreak(doc: Document): Element {
  const p = el(doc, 'p');
  const r = el(doc, 'r');
  const br = el(doc, 'br');
  br.setAttributeNS(W_NS, 'w:type', 'page');
  r.appendChild(br);
  p.appendChild(r);
  return p;
}

/**
 * 사진을 패키지에 싣는 자리 — 미디어 파일·관계(rels)·내용 종류를 한 번에 맞춘다.
 * 생성기가 하나 만들어 사진마다 add 를 부르고, 끝에 flush 로 관계 파일을 쓴다.
 */
export class ImageRegistry {
  private n = 0;
  private rels: Array<{ id: string; target: string }> = [];
  /** 그림 이름표(docPr id)는 문서 안에서 겹치면 안 된다 — 서식이 쓰는 번호와 멀리 둔다 */
  private docPrId = 90000;

  constructor(private zip: JSZip, private prefix = 'survey') {}

  add(img: PreparedImage): { relId: string; docPrId: number; name: string } {
    this.n += 1;
    const name = `${this.prefix}${this.n}.jpeg`;
    this.zip.file(`word/media/${name}`, img.bytes);
    const relId = `rIdSurvey${this.n}`;
    this.rels.push({ id: relId, target: `media/${name}` });
    this.docPrId += 1;
    return { relId, docPrId: this.docPrId, name };
  }

  async flush(): Promise<void> {
    if (this.rels.length === 0) return;
    const relPath = 'word/_rels/document.xml.rels';
    const relXml = await this.zip.file(relPath)!.async('string');
    const relDoc = new DOMParser().parseFromString(relXml, 'application/xml');
    const root = relDoc.documentElement;
    for (const r of this.rels) {
      const e = relDoc.createElementNS(PKG_REL_NS, 'Relationship');
      e.setAttribute('Id', r.id);
      e.setAttribute('Type', IMAGE_REL);
      e.setAttribute('Target', r.target);
      root.appendChild(e);
    }
    this.zip.file(relPath, new XMLSerializer().serializeToString(relDoc));

    const ctPath = '[Content_Types].xml';
    const ct = await this.zip.file(ctPath)!.async('string');
    if (!/Extension="jpeg"/i.test(ct)) {
      this.zip.file(ctPath, ct.replace(
        /(<Types[^>]*>)/,
        '$1<Default Extension="jpeg" ContentType="image/jpeg"/>'
      ));
    }
  }
}

/**
 * 칸에 사진 한 장 — ★칸을 꽉 채운다★(한백 「사진 넣으면 그 박스 안에 맞춰서」 2026-10-02). 칸 비율로 자르고
 * (늘리지 않는다), 사진 위 표시가 있으면 그 자리가 남게 창을 옮긴다(lib/survey/fit). 자르기는 워드의 「자르기」
 * (srcRect)라 원본이 파일에 남고 받은 사람이 워드에서 다시 고를 수 있다 — 엑셀 쪽(xlsx-kit)과 같다.
 * 예전에는 칸 안에 비율대로 들여서 위아래·양옆이 비었다(사진 대장 칸은 거의 정사각이라 4:3 사진이 떴다).
 * 칸의 글자(안내 괄호 말)는 지운다: 사진이 그 자리다.
 *
 * @param maxW·maxH 칸 안 쓸 수 있는 크기(트윕) — 칸 폭·줄 높이에서 여백을 뺀 값
 */
export function putImage(
  tc: Element,
  img: PreparedImage,
  reg: ImageRegistry,
  maxW: number,
  maxH: number
): void {
  setCellText(tc, '');
  const p = childrenNamed(tc, 'p')[0];
  centerParagraph(p);
  // 표시가 자른 창에 다 안 들면 자르지 않고 칸 안에 들인다 — 사진에 구운 번호·경로가 잘려 나가지 않게
  const w = fillWindow(img.width / img.height, maxW / maxH, img.focus);
  const k = w ? 1 : Math.min(maxW / img.width, maxH / img.height);
  const cx = Math.round((w ? maxW : img.width * k) * EMU_PER_TWIP);
  const cy = Math.round((w ? maxH : img.height * k) * EMU_PER_TWIP);
  const pct = (v: number) => Math.round(v * 100000);
  const srcRect = w ? `<a:srcRect l="${pct(w.l)}" t="${pct(w.t)}" r="${pct(w.r)}" b="${pct(w.b)}"/>` : '';
  const { relId, docPrId, name } = reg.add(img);

  /*
   * 그림 글줄은 문자열로 짓고 붙인다 — 네임스페이스 다섯이 얽힌 자리라 하나씩 만들면 길기만 하다.
   * 접두어마다 선언을 붙여 두어 문서 뿌리의 선언에 기대지 않는다.
   */
  const xml = `<w:r xmlns:w="${W_NS}" xmlns:r="${R_NS}"
    xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
    xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const frag = parseXml(xml).documentElement;
  p.appendChild(tc.ownerDocument.importNode(frag, true));
}

/** 사진 줄로 보는 높이(트윕) — 두 서식 다 사진 줄은 4500 남짓, 글자 줄은 1000 아래다 */
export const PHOTO_ROW_MIN = 3000;

/** 사진 칸 — 사진 줄(높은 줄)의 칸을 위에서 아래·왼쪽에서 오른쪽 순서로. h 는 그 줄 높이(트윕) */
export function photoCellsOf(rows: Element[]): Array<{ tc: Element; h: number }> {
  return rows.filter((r) => rowHeight(r) >= PHOTO_ROW_MIN).flatMap((r) => cellsOf(r).map((tc) => ({ tc, h: rowHeight(r) })));
}

/**
 * 본문을 갈아 끼우고 문서를 마무리해 묶는다 — 서식 본문은 버리고 쪽 설정(sectPr)만 남긴다. 사진 부품을 쓰고
 * (ImageRegistry.flush) 문서 보호를 푼다.
 */
export async function finishDocx(zip: JSZip, doc: Document, nodes: Element[], sectPr: Element | null, reg: ImageRegistry): Promise<Blob | Uint8Array> {
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  for (const k of Array.from(body.childNodes)) body.removeChild(k);
  for (const e of nodes) body.appendChild(e);
  if (sectPr) body.appendChild(sectPr);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  await reg.flush();
  await unlockDocument(zip);
  return packZip(zip, 'docx');
}

/**
 * 복제한 조각 — 문단의 w14:paraId·textId 는 문서 안에서 겹치면 안 된다(거점마다 복제하면 수백 개가 겹쳤다).
 * 지워 두면 워드가 저장할 때 새로 매긴다.
 */
export function freshClone(e: Element): Element {
  const c = e.cloneNode(true) as Element;
  for (const p of [c, ...Array.from(c.getElementsByTagNameNS(W_NS, 'p'))]) {
    for (const a of Array.from(p.attributes ?? [])) if (a.localName === 'paraId' || a.localName === 'textId') p.removeAttributeNode(a);
  }
  return c;
}

/** 서식의 문서 보호를 푼다 — 받은 사람이 고칠 수 있어야 한다(계약서 생성기와 같은 처리) */
export async function unlockDocument(zip: JSZip): Promise<void> {
  const f = zip.file('word/settings.xml');
  if (!f) return;
  const doc = parseXml(await f.async('string'));
  const ps = doc.getElementsByTagNameNS(W_NS, 'documentProtection');
  if (ps.length === 0) return;
  for (let i = ps.length - 1; i >= 0; i--) ps[i].parentNode?.removeChild(ps[i]);
  zip.file('word/settings.xml', new XMLSerializer().serializeToString(doc));
}

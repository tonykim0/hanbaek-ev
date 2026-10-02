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
import { crop } from './fit';

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

/** 문단의 글자 모양 — 새 글줄(run)이 칸의 글자 크기를 따르게 문단 표시의 모양을 베낀다 */
function paragraphRunProps(p: Element): Element | null {
  const pPr = childrenNamed(p, 'pPr')[0];
  const rPr = pPr ? childrenNamed(pPr, 'rPr')[0] : undefined;
  if (rPr) return rPr.cloneNode(true) as Element;
  const firstRun = childrenNamed(p, 'r')[0];
  const runPr = firstRun ? childrenNamed(firstRun, 'rPr')[0] : undefined;
  return runPr ? (runPr.cloneNode(true) as Element) : null;
}

/**
 * 칸의 글자를 통째로 바꾼다 — 첫 문단의 첫 글줄에 적고 나머지 글자는 비운다.
 * 글줄이 하나도 없는 빈 칸이면 문단 모양을 따라 새 글줄을 만든다.
 * 줄바꿈(\n)은 같은 글줄 안의 줄바꿈(<w:br/>)으로 넣는다.
 */
export function setCellText(tc: Element, text: string): void {
  const doc = tc.ownerDocument;
  const ps = childrenNamed(tc, 'p');
  const p = ps[0] ?? tc.appendChild(el(doc, 'p'));
  // 둘째 문단부터는 비운다 — 서식의 안내 글(괄호 말)이 남으면 값과 섞인다
  for (const extra of ps.slice(1)) {
    for (const t of Array.from(extra.getElementsByTagNameNS(W_NS, 't'))) t.textContent = '';
  }
  const runs = childrenNamed(p, 'r');
  for (const r of runs) for (const t of Array.from(r.getElementsByTagNameNS(W_NS, 't'))) t.textContent = '';
  let run = runs.find((r) => r.getElementsByTagNameNS(W_NS, 't').length > 0);
  if (!run) {
    run = el(doc, 'r');
    const rPr = paragraphRunProps(p);
    if (rPr) run.appendChild(rPr);
    p.appendChild(run);
  }
  /*
   * 서식의 안내 칸은 노란 형광으로 칠해져 있다(「여기에 적으세요」의 표시). 값을 넣었으면 그
   * 표시는 끝난 것이다 — 남기면 제출본에 형광이 그대로 나간다.
   */
  if (text) {
    for (const r of childrenNamed(p, 'r')) {
      const rPr = childrenNamed(r, 'rPr')[0];
      if (rPr) for (const h of childrenNamed(rPr, 'highlight')) rPr.removeChild(h);
    }
  }
  // 그 글줄의 글자 자리를 새로 짓는다(줄바꿈을 넣으려면 t 와 br 을 번갈아 둔다)
  for (const old of Array.from(run.childNodes)) {
    if ((old as Element).localName === 't' || (old as Element).localName === 'br') run.removeChild(old);
  }
  text.split('\n').forEach((line, i) => {
    if (i > 0) run!.appendChild(el(doc, 'br'));
    const t = el(doc, 't');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = line;
    run!.appendChild(t);
  });
}

/** 칸 문단을 가운데로 — 사진은 칸 가운데 선다 */
function centerParagraph(p: Element): void {
  const doc = p.ownerDocument;
  let pPr = childrenNamed(p, 'pPr')[0];
  if (!pPr) { pPr = el(doc, 'pPr'); p.insertBefore(pPr, p.firstChild); }
  let jc = childrenNamed(pPr, 'jc')[0];
  if (!jc) { jc = el(doc, 'jc'); pPr.appendChild(jc); }
  jc.setAttributeNS(W_NS, 'w:val', 'center');
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
  const cx = Math.round(maxW * EMU_PER_TWIP);
  const cy = Math.round(maxH * EMU_PER_TWIP);
  const w = crop(img.width / img.height, maxW / maxH, img.focus);
  const pct = (v: number) => Math.round(v * 100000);
  const srcRect = `<a:srcRect l="${pct(w.l)}" t="${pct(w.t)}" r="${pct(w.r)}" b="${pct(w.b)}"/>`;
  const { relId, docPrId, name } = reg.add(img);

  /*
   * 그림 글줄은 문자열로 짓고 붙인다 — 네임스페이스 다섯이 얽힌 자리라 하나씩 만들면 길기만 하다.
   * 접두어마다 선언을 붙여 두어 문서 뿌리의 선언에 기대지 않는다.
   */
  const xml = `<w:r xmlns:w="${W_NS}" xmlns:r="${R_NS}"
    xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
    xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/>${srcRect}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const frag = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
  p.appendChild(tc.ownerDocument.importNode(frag, true));
}

/** 서식의 문서 보호를 푼다 — 받은 사람이 고칠 수 있어야 한다(계약서 생성기와 같은 처리) */
export async function unlockDocument(zip: JSZip): Promise<void> {
  const f = zip.file('word/settings.xml');
  if (!f) return;
  const doc = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  const ps = doc.getElementsByTagNameNS(W_NS, 'documentProtection');
  if (ps.length === 0) return;
  for (let i = ps.length - 1; i >= 0; i--) ps[i].parentNode?.removeChild(ps[i]);
  zip.file('word/settings.xml', new XMLSerializer().serializeToString(doc));
}

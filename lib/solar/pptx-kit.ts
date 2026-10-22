/**
 * 파워포인트(pptx) 슬라이드의 글자를 바꾼다 — 제안서 생성기가 쓴다.
 *
 * 서식을 다시 짓지 않는다. pptx 는 XML 묶음이고, 바꾸는 것은 글자뿐이다 — 그림·도형·표·
 * 배치는 손대지 않으므로 서식이 그대로 나온다(xlsx-kit 이 엑셀에 하는 것과 같은 생각).
 *
 * ★이름표를 안 쓰고 글자를 찾는다★ — 서식이 한백 것이 아니라 에이치에너지에서 받은 것이고,
 * 이미 실제 값(「(주)무창」·「352.95」)이 적힌 채로 왔다. 거기에 {{고객사}} 같은 이름표를
 * 박으려면 69MB 서식을 고쳐야 하는데, 그러면 서식을 새로 받을 때마다 같은 일을 또 한다.
 * 구글 슬라이드의 replaceAllText 도 같은 방식이다 — 나중에 그쪽으로 옮겨도 규약이 같다.
 *
 * ★글자는 run 여럿에 쪼개져 있다★ — 파워포인트·구글 슬라이드는 한 문단을 쓰다가 글꼴이
 * 바뀌거나 맞춤법 검사가 지나가기만 해도 run 을 가른다. 「352.95kW」가 세 조각일 수 있다.
 * 그래서 두 단계로 바꾼다:
 *   ① run 하나 안에서 바뀌면 그 자리에서 바꾼다 — ★글자 모양이 그대로 남는다★.
 *   ② 그래도 남아 있으면 조각을 넘나드는 것이다 — 문단을 한 run 으로 합쳐 바꾼다.
 *      이때 첫 run 의 모양을 쓴다(docx-kit setParagraphText 와 같은 처리).
 * ①로 끝나는 경우가 대부분이라 굵은 숫자·색 글자가 살아남는다.
 *
 * DOMParser·XMLSerializer 만 쓴다 — 브라우저에서 돌고, 시험에서는 xmldom 을 꽂는다.
 */
import type JSZip from 'jszip';
import { parseXml } from '../survey/xml-safe';
import { packZip } from '../survey/pack';

export const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** 바꿀 것 — 찾는 글자 → 넣을 글자. 긴 것부터 찾는다(아래 orderOf) */
export type Replacements = Record<string, string>;

/**
 * ★긴 열쇠부터 바꾼다★ — 「352.95kW」와 「352.95」가 같이 있으면 짧은 것이 먼저 걸려
 * 「<새용량>kW」가 되어야 할 자리가 엉킨다. 길이 내림차순이면 긴 쪽이 먼저 소비된다.
 */
export const orderOf = (r: Replacements): string[] =>
  Object.keys(r).filter((k) => k.length > 0).sort((a, b) => b.length - a.length);

/** 한 줄에 모든 열쇠를 적용한다 */
export function applyAll(text: string, r: Replacements, keys = orderOf(r)): string {
  let out = text;
  for (const k of keys) {
    if (out.includes(k)) out = out.split(k).join(r[k]);
  }
  return out;
}

const childrenNamed = (el: Element, local: string): Element[] =>
  Array.from(el.childNodes).filter(
    (n): n is Element => n.nodeType === 1 && (n as Element).localName === local
  );

/** 문단의 run 들 — a:r 만. a:br·a:fld 는 글자를 안 들고 있거나 건드리면 안 된다 */
const runsOf = (p: Element): Element[] => childrenNamed(p, 'r');

const runText = (run: Element): string => {
  const ts = childrenNamed(run, 't');
  return ts.map((t) => t.textContent ?? '').join('');
};

/** 문단의 글자 전체 — 조각을 이어 붙인 것 */
export function paragraphText(p: Element): string {
  return runsOf(p).map(runText).join('');
}

/**
 * 문단 하나를 바꾼다 — 바꾼 것이 있으면 true.
 * ①run 안에서 되면 그 자리에서, ②조각을 넘나들면 합쳐서.
 */
export function fillParagraph(p: Element, r: Replacements, keys = orderOf(r)): boolean {
  const runs = runsOf(p);
  if (runs.length === 0) return false;
  const before = paragraphText(p);
  if (!keys.some((k) => before.includes(k))) return false;

  /* ① run 안에서 — 글자 모양이 그대로 남는 쪽을 먼저 시도한다 */
  let touched = false;
  for (const run of runs) {
    const ts = childrenNamed(run, 't');
    for (const t of ts) {
      const was = t.textContent ?? '';
      const now = applyAll(was, r, keys);
      if (now !== was) {
        t.textContent = now;
        /* 앞뒤 공백이 뜻을 갖는 자리라 지워지지 않게 못 박는다 */
        t.setAttribute('xml:space', 'preserve');
        touched = true;
      }
    }
  }

  /* ② 조각을 넘나드는 것이 남았으면 문단을 합친다 */
  const mid = paragraphText(p);
  if (keys.some((k) => mid.includes(k))) {
    const first = runs[0];
    const rPr = childrenNamed(first, 'rPr')[0] ?? null;
    const doc = p.ownerDocument;

    for (const run of runs) p.removeChild(run);
    const run = doc.createElementNS(A_NS, 'a:r');
    if (rPr) run.appendChild(rPr);
    const t = doc.createElementNS(A_NS, 'a:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = applyAll(mid, r, keys);
    run.appendChild(t);
    /*
     * ★자리를 지킨다★ — 문단 끝 a:endParaRPr 앞에 넣는다. 뒤에 붙이면 파워포인트가
     * 문단 끝 모양을 글자로 읽어 줄이 하나 더 생긴 것처럼 보인다.
     */
    const end = childrenNamed(p, 'endParaRPr')[0];
    if (end) p.insertBefore(run, end);
    else p.appendChild(run);
    touched = true;
  }
  return touched;
}

/* ── 표 ────────────────────────────────────────────────────────────────────
 * ★숫자 표는 글자 찾기로 바꾸지 않는다★ — 3년차 어느 칸과 7년차 다른 칸의 숫자가 우연히
 * 같으면 엉뚱한 자리가 바뀐다. 20년 손익표는 160칸이라 그런 충돌이 반드시 생긴다.
 * 자리(몇 번째 줄 몇 번째 칸)로 찾아 쓴다 — docx-kit 이 워드 표에 하는 것과 같은 생각이다.
 */

export const tablesOf = (doc: Document): Element[] =>
  Array.from(doc.getElementsByTagNameNS(A_NS, 'tbl'));

export const rowsOf = (tbl: Element): Element[] => {
  const grid = childrenNamed(tbl, 'tr');
  return grid.length > 0 ? grid : Array.from(tbl.getElementsByTagNameNS(A_NS, 'tr'));
};

export const cellsOf = (tr: Element): Element[] => childrenNamed(tr, 'tc');

/** 칸의 글자 — 조각을 이어 붙인다 */
export const cellText = (tc: Element): string => {
  const ts = tc.getElementsByTagNameNS(A_NS, 't');
  let s = '';
  for (let i = 0; i < ts.length; i += 1) s += ts[i].textContent ?? '';
  return s;
};

/**
 * 칸의 글자를 통째로 바꾼다 — ★첫 문단에 적고 나머지 문단은 비운다★.
 * 문단 수는 그대로 둔다(칸 높이가 서식대로 남는다). 첫 run 의 모양을 쓴다 —
 * 표의 글꼴·크기·가운데 맞춤이 그 모양에 들어 있다.
 */
export function setCellText(tc: Element, text: string): void {
  const doc = tc.ownerDocument;
  const body = childrenNamed(tc, 'txBody')[0];
  if (!body) return;
  const ps = childrenNamed(body, 'p');
  if (ps.length === 0) return;

  const first = ps[0];
  const rPr = childrenNamed(runsOf(first)[0] ?? first, 'rPr')[0] ?? null;

  for (const p of ps) {
    for (const run of runsOf(p)) p.removeChild(run);
  }
  const run = doc.createElementNS(A_NS, 'a:r');
  if (rPr) run.appendChild(rPr);
  const t = doc.createElementNS(A_NS, 'a:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  run.appendChild(t);
  const end = childrenNamed(first, 'endParaRPr')[0];
  if (end) first.insertBefore(run, end);
  else first.appendChild(run);
}

/** XML 한 장을 바꾼다 — 바꾼 문단 수 */
export function fillSlideXml(xml: string, r: Replacements): { xml: string; hits: number } {
  const keys = orderOf(r);
  if (keys.length === 0) return { xml, hits: 0 };
  const doc = parseXml(xml);
  const ps = doc.getElementsByTagNameNS(A_NS, 'p');
  let hits = 0;
  /* 살아 있는 목록이라 뒤에서 앞으로 — 문단을 고치는 중에 차례가 밀리지 않게 */
  for (let i = ps.length - 1; i >= 0; i -= 1) {
    if (fillParagraph(ps[i], r, keys)) hits += 1;
  }
  if (hits === 0) return { xml, hits: 0 };
  return { xml: new XMLSerializer().serializeToString(doc), hits };
}

/** 슬라이드·슬라이드 노트만 본다 — 서식(layout·master)은 안 건드린다 */
const FILLABLE = /^ppt\/(slides|notesSlides)\/(slide|notesSlide)\d+\.xml$/;

export interface FillResult {
  /** 브라우저에서는 Blob, 시험(node)에서는 Uint8Array — packZip 이 가른다 */
  file: Blob | Uint8Array;
  /** 바꾼 문단 수 — 0 이면 열쇠가 하나도 안 걸렸다(서식이 다른 것이다) */
  hits: number;
  /** 손댄 XML 장 수 */
  parts: number;
}

/**
 * 서식 한 벌을 채워 새 pptx 를 만든다.
 *
 * ★0 건이면 부르는 쪽이 알아야 한다★ — 열쇠가 하나도 안 걸렸다는 것은 서식이 바뀌었거나
 * 엉뚱한 파일을 넣었다는 뜻이다. 그대로 내려주면 사람이 샘플 값이 그대로 든 제안서를
 * 고객에게 보낸다. 그래서 hits 를 돌려주고 화면이 막는다.
 */
export async function fillPptx(zip: JSZip, r: Replacements): Promise<FillResult> {
  const names = Object.keys(zip.files).filter((n) => FILLABLE.test(n));
  let hits = 0;
  let parts = 0;
  for (const n of names) {
    const was = await zip.file(n)!.async('string');
    const { xml, hits: n2 } = fillSlideXml(was, r);
    if (n2 > 0) {
      zip.file(n, xml);
      hits += n2;
      parts += 1;
    }
  }
  return { file: await packZip(zip, 'pptx'), hits, parts };
}

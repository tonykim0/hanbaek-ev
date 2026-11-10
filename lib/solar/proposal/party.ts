/**
 * 계약자 구분(개인사업자 · 법인)으로 견본의 글을 거른다. [순수]
 *
 * 한백 2026-11-10 「에이치에너지는 개인은 참여지원금을 안줘서, 이거에 대해서도 미리 필터링이 필요해. 계약자가 개인사업자인지
 * 법인사업자인지」. 모햇 견본은 두 계약자를 한 판에 함께 쓴다 — 지원금 줄 · 문장과 「개인사업자는 …」 칸이 나란히 있다. 사업자의
 * 영업정책이 참여지원금을 법인에게만 주므로, 제안서는 그 계약자의 글만 남긴다(DOM 쪽은 sample-fill filterParty).
 *
 * 어느 계약자의 글인지는 견본의 말로 가른다: 「지원금」이 든 글과 「법인」만 든 글은 법인의 글, 「개인」(「개인사업자」 · 「개인
 * 임대인」 — 모두에게 받는 「개인정보」는 빼고)만 든 글은 개인사업자의 글, 둘 다 없거나 둘 다 들면(「개인/법인 무관」) 함께 보는
 * 글이다. 지원금이 먼저다 — 「개인사업자는 지원금 대상이 아니다」는 지원금을 말하는 글이라 법인 제안서에만 남는다(개인사업자
 * 제안서는 지원금을 아예 말하지 않는다).
 * 거르는 단위는 표의 줄(줄 이름으로 — DOM 쪽) · 문장 · 구절(「, …」 · 「 + …」) · 괄호다. 문장의 첫 구절이 다른 계약자의 것이면
 * 문장째, 아니면 그 구절 · 괄호만 걷는다. 머리 표(「※ 」)는 남긴다.
 */
import type { TextEdit } from '@/lib/pptx/deck';

export type Party = 'personal' | 'corporate';
export const PARTIES: Party[] = ['personal', 'corporate'];
export const PARTY_LABEL: Record<Party, string> = { personal: '개인사업자', corporate: '법인' };

const otherOf = (p: Party): Party => (p === 'personal' ? 'corporate' : 'personal');

const SUBSIDY = /지원금/;
const CORPORATE = /법인/;
const PERSONAL = /개인(?!정보)/;

/** 글 하나가 어느 계약자의 것인가 — 함께 보는 글이면 null */
export function partyOf(text: string): Party | null {
  if (SUBSIDY.test(text)) return 'corporate';
  const corp = CORPORATE.test(text);
  const pers = PERSONAL.test(text);
  if (corp === pers) return null;
  return corp ? 'corporate' : 'personal';
}

/** 머리 표 — 앞 빈칸과 「※ 」 · 「* 」 · 「- 」 · 「• 」(남긴다) */
const MARKER = /^\s*(?:[※*•·-]\s*)?/;
export const markerOf = (text: string): string => text.match(MARKER)![0];

type Span = { start: number; end: number };

/** 괄호 밖의 자리마다 — 괄호 깊이를 세며 걷는다(글 속 「(…)」 · 「（…）」) */
function topLevel(text: string, from: number, to: number, hit: (i: number) => boolean): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === '(' || c === '（') depth++;
    else if ((c === ')' || c === '）') && depth > 0) depth--;
    else if (depth === 0 && hit(i)) out.push(i);
  }
  return out;
}

/** 문장 — 괄호 밖의 「.」 뒤가 빈칸이거나 글 끝인 곳에서 끊는다(「1.1억」의 점은 아니다). 끝의 빈칸은 그 문장에 붙인다 */
function sentencesOf(text: string, from: number): Span[] {
  const ends = topLevel(text, from, text.length, (i) => text[i] === '.' && (i + 1 === text.length || /\s/.test(text[i + 1])));
  const out: Span[] = [];
  let start = from;
  for (const e of ends) {
    let end = e + 1;
    while (end < text.length && /\s/.test(text[end])) end++;
    out.push({ start, end });
    start = end;
  }
  if (start < text.length && text.slice(start).trim()) out.push({ start, end: text.length });
  return out;
}

/** 구절 — 괄호 밖의 「, 」 · 「 + 」에서 끊는다. 둘째 구절부터는 끊은 표를 앞에 품는다(걷으면 표째 걷힌다) */
function clausesOf(text: string, s: Span): Span[] {
  const cuts = topLevel(text, s.start, s.end, (i) => (text[i] === ',' && text[i + 1] === ' ') || (text[i] === ' ' && text[i + 1] === '+' && text[i + 2] === ' '));
  const out: Span[] = [];
  let start = s.start;
  for (const c of cuts) {
    out.push({ start, end: c });
    start = c;
  }
  out.push({ start, end: s.end });
  return out;
}

/** 구절 안의 괄호(가장 바깥) — 앞 빈칸 하나를 품는다 */
function parensOf(text: string, s: Span): Span[] {
  const out: Span[] = [];
  let depth = 0;
  let open = -1;
  for (let i = s.start; i < s.end; i++) {
    const c = text[i];
    if (c === '(' || c === '（') {
      if (depth === 0) open = i;
      depth++;
    } else if ((c === ')' || c === '）') && depth > 0) {
      depth--;
      if (depth === 0) out.push({ start: open > s.start && text[open - 1] === ' ' ? open - 1 : open, end: i + 1 });
    }
  }
  return out;
}

/** 괄호를 뺀 글 — 구절이 누구의 것인지는 괄호 밖 말로 본다(「(5년 선납 법인) 지원금 …」은 괄호 밖 「지원금」) */
function coreOf(text: string, s: Span): string {
  let out = '';
  let at = s.start;
  for (const p of parensOf(text, s)) {
    out += text.slice(at, p.start);
    at = p.end;
  }
  return out + text.slice(at, s.end);
}

/**
 * 덩이 글에서 다른 계약자의 글을 걷는 고칠 자리 — 머리 표는 남긴다. empty 면 남는 글이 없다(표 칸이면 「-」, 글상자면 덩이째 —
 * 부르는 쪽이 정한다). 글 끝까지 걷으면 앞 빈칸도 같이 걷는다.
 */
export function partyEdits(text: string, keep: Party): { edits: TextEdit[]; empty: boolean } {
  const other = otherOf(keep);
  const cut: Span[] = [];
  for (const s of sentencesOf(text, markerOf(text).length)) {
    const clauses = clausesOf(text, s);
    if (partyOf(coreOf(text, clauses[0])) === other) {
      cut.push(s);
      continue;
    }
    for (const [i, c] of clauses.entries()) {
      if (i > 0 && partyOf(coreOf(text, c)) === other) {
        cut.push(c);
        continue;
      }
      for (const p of parensOf(text, c)) if (partyOf(text.slice(p.start, p.end)) === other) cut.push(p);
    }
  }
  if (!cut.length) return { edits: [], empty: false };
  // 글 끝까지 걷으면 남는 글의 끝 빈칸까지
  const last = cut.reduce((a, b) => (b.end > a.end ? b : a));
  if (last.end === text.length) while (last.start > 0 && /\s/.test(text[last.start - 1])) last.start--;
  const edits = cut.map((c) => ({ start: c.start, end: c.end, text: '' }));
  const left = cut
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((t, c) => t.slice(0, c.start) + t.slice(c.end), text);
  return { edits, empty: !left.slice(markerOf(left).length).trim() };
}

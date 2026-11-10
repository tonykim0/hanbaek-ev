/**
 * 견본 채우기 — 사업자 견본(pptx)의 빈칸 · 예시 숫자를 글로 찾아 이 현장 값으로 바꾼다. [브라우저]
 * 무엇이 바꿀 자리인지는 견본이 정한다(lib/solar/proposal/sample — 빈칸 「[현장 주소]」 · 예시 숫자 「…kW(예시)」). 생성기는 값만 대고,
 * 견본에 글로 적히지 않은 것 — 그림 · 표를 얹는 자리(「가배치 도면」)와 영업사 줄 — 만 따로 한다(fill-henergy).
 * 사업자가 견본의 문구를 고치거나 칸을 옮겨도 새 파일을 올리기만 하면 된다. 생성기를 고칠 때는 견본에 처음 보는 값이 생겼을 때뿐이고,
 * 그때는 틀린 제안서를 내지 않고 멈춘다:
 *   모르는 빈칸     채울 자리가 있는 장의 처음 보는 대괄호 · 어디든 빈 대괄호(「[계약기간]」 → 그 값을 댈 줄을 더한다)
 *   못 바꾸는 금액   예시 숫자가 있는 장에서 지금 조건 · 셈으로 다시 낼 수 없는 금액(조건이 견본과 다르거나 견본에 새로 생긴 셈)
 *   모듈 출력       견본의 「…Wp」가 조건의 모듈 출력과 다를 때
 */
import type { Deck, Paragraph, Slide, TextEdit } from '@/lib/pptx/deck';
import { estWidthPt, FIT_SAFE } from './fill-common';
import { markerOf, PARTY_LABEL, partyEdits, partyOf, type Party } from './party';
import { blankEdit, blanksIn, exampleEdits, exampleKwOf, FIELD_LABEL, fieldOf, swapTableOf, wattsIn, type Amounts, type Blank, type FieldKey, type FieldValue } from './sample';

export type { FieldValue };

export type SampleSpec = {
  /**
   * 빈칸의 값 — unit 은 견본이 그 빈칸 뒤에 적은 단위(없으면 '' — 값에 단위를 붙인다).
   * 모르면 null(그 칸은 「-」), 이 상품이 대지 않는 값이면 undefined(모르는 빈칸으로 멈춘다).
   */
  value: (key: FieldKey, unit: string) => FieldValue | null | undefined;
  /** 견본에 꼭 있어야 하는 빈칸 — 없으면 견본이 크게 바뀐 것이라 멈춘다 */
  required: FieldKey[];
  /** 이 현장의 용량(kW) · 그 용량으로 셈한 금액들(같은 셈을 견본의 예시 용량으로도 부른다) */
  kw: number;
  amounts: (kw: number) => Amounts;
  /** 조건의 모듈 출력(W) — 견본의 「…Wp」와 같아야 한다 */
  moduleWatt: number;
};

/** 채운 칸 — 생성기가 그 자리를 보고 더 할 일(표지 밑 영업사 줄 등) */
export type FilledBody = { slide: Slide; body: Element; shape: Element; keys: FieldKey[] };

/** 견본의 「채울 자리」 빨강 — 채우면 검정으로. 강조 빨강(C00000 — 용량 · 임대수익)은 그대로 */
const MARK_RED = 'FF0000';
const INK = '000000';
/** 칸에 들게 줄일 때 — 가장 작게 · 크기가 안 적힌 글의 어림 */
const FIT = { min: 10, fallback: 18 };

const listOf = (xs: string[]) => {
  const u = [...new Set(xs)];
  return u.slice(0, 4).join(' · ') + (u.length > 4 ? ` 외 ${u.length - 4}개` : '');
};

/** 견본의 빈칸 · 예시 숫자를 채운다 — 고치기 전에 다 보고, 멈출 거리가 있으면 아무것도 고치지 않고 멈춘다 */
export async function fillSample(deck: Deck, spec: SampleSpec): Promise<FilledBody[]> {
  const slides: Slide[] = [];
  for (let n = 1; n <= deck.slides.length; n++) slides.push(await deck.slide(n));
  checkWatt(slides, spec.moduleWatt);
  const swaps = planExamples(slides, spec);
  const blanks = planBlanks(slides, spec);
  return apply(swaps, blanks);
}

/**
 * 계약자 구분으로 견본의 글을 거른다(lib/solar/proposal/party) — 채우기 전에. 다른 계약자의 표 줄(줄 이름으로)은 줄째, 문장 · 구절 ·
 * 괄호는 그 글만 걷는다. 표 칸이 다 걷히면 「-」, 글상자의 덩이가 다 걷히면 덩이째 빼고 머리 표(「※ 」)는 이어 쓴 다음 덩이(앞이
 * 빈칸으로 들여 쓴 덩이)로 옮긴다 — 글상자가 통째로 걷히면 모양째. 거른 뒤에도 다른 계약자의 글이 남으면(줄바꿈을 걸친 글처럼 못
 * 걷은 글) 틀린 제안서를 내지 않고 멈춘다.
 */
export async function filterParty(deck: Deck, keep: Party): Promise<void> {
  const other: Party = keep === 'personal' ? 'corporate' : 'personal';
  const left: string[] = [];
  for (let n = 1; n <= deck.slides.length; n++) {
    const slide = await deck.slide(n);
    const rows = new Set<Element>();
    for (const p of slide.paragraphs()) if (p.cell && partyOf(p.cell.rowLabel) === other) rows.add(slide.rowOf(p.body)!);
    for (const tr of rows) slide.removeRow(tr);

    const bodies = new Map<Element, Paragraph[]>();
    for (const p of slide.paragraphs()) bodies.set(p.body, [...(bodies.get(p.body) ?? []), p]);
    for (const [body, ps] of bodies) {
      const plans = ps.map((p) => ({ p, ...partyEdits(p.text, keep) }));
      if (!plans.some((x) => x.edits.length)) continue;
      if (plans.every((x) => x.empty || !x.p.text.trim())) {
        if (ps[0].cell) slide.rewriteBody(body, '-');
        else slide.removeEl(ps[0].shape);
        continue;
      }
      let carry: string | null = null;
      for (const { p, edits, empty } of plans) {
        const pending: string | null = carry;
        carry = null;
        if (empty) {
          slide.removeEl(p.el);
          carry = pending ?? markerOf(p.text).trim();
          continue;
        }
        const es = [...edits];
        const lead = markerOf(p.text);
        // 이어 쓴 덩이(앞을 빈칸으로 들여 썼다) — 걷힌 앞 덩이의 머리 표를 받는다
        if (pending && lead.length && !lead.trim()) es.push({ start: 0, end: lead.length, text: `${pending} ` });
        slide.editParagraph(p.el, es);
      }
    }
    for (const p of slide.paragraphs())
      if ((p.cell && partyOf(p.cell.rowLabel) === other) || partyEdits(p.text, keep).edits.length) left.push(`${slide.label} 「${p.text.trim().slice(0, 30)}」`);
  }
  if (left.length) throw new Error(`템플릿에 ${PARTY_LABEL[other]} 글이 남았습니다 — ${listOf(left)}. 계약자 구분(${PARTY_LABEL[keep]})으로 거르도록 생성기를 고쳐야 합니다.`);
}

/** 그 장에서 글이 pattern 인 글상자(표 아닌 · 40자 안) — 그림 · 표를 얹을 자리(「가배치 도면」 · 「한전ON … 조회 화면」) */
export async function findSlot(deck: Deck, pattern: RegExp): Promise<{ slide: Slide; shape: Element } | null> {
  for (let n = 1; n <= deck.slides.length; n++) {
    const s = await deck.slide(n);
    const byShape = new Map<Element, string[]>();
    for (const p of s.paragraphs()) if (!p.cell) byShape.set(p.shape, [...(byShape.get(p.shape) ?? []), p.text]);
    for (const [shape, texts] of byShape) {
      const t = texts.join(' ').replace(/\s+/g, ' ').trim();
      if (t.length <= 40 && pattern.test(t)) return { slide: s, shape };
    }
  }
  return null;
}

function checkWatt(slides: Slide[], watt: number): void {
  for (const s of slides)
    for (const p of s.paragraphs())
      for (const w of wattsIn(p.text))
        if (w !== watt) throw new Error(`템플릿의 모듈 출력(${s.label} 「${w}Wp」)이 「템플릿 · 조건」의 모듈 출력(${watt}W)과 다릅니다 — 조건을 고치거나 맞는 템플릿을 올리세요.`);
}

/** 예시 숫자를 바꿀 자리 — 예시 숫자가 있는 장(바꾼 것이 하나라도 있는 장)에서 못 바꾸는 금액이 있으면 멈춘다 */
function planExamples(slides: Slide[], spec: SampleSpec): { slide: Slide; p: Paragraph; edits: TextEdit[] }[] {
  const all = slides.map((slide) => ({ slide, ps: slide.paragraphs() }));
  const exKw = exampleKwOf(
    all.flatMap((x) => x.ps.map((p) => p.text)),
    spec.amounts,
  );
  if (exKw === null) throw new Error('템플릿에서 예시 용량(「…kW(예시)」)을 찾지 못했습니다 — 임대료 쪽 숫자를 바꿀 수 없어 멈춥니다. 생성기를 고쳐야 합니다.');
  const table = swapTableOf(exKw, spec.kw, spec.amounts);
  const work: { slide: Slide; p: Paragraph; edits: TextEdit[] }[] = [];
  const unknown: string[] = [];
  for (const { slide, ps } of all) {
    const results = ps.map((p) => ({ p, ...exampleEdits(p.text, table) }));
    if (!results.some((r) => r.matched > 0)) continue;
    for (const r of results) {
      for (const u of r.unknown) unknown.push(`${slide.label} 「${u}」`);
      if (r.edits.length) work.push({ slide, p: r.p, edits: r.edits });
    }
  }
  if (unknown.length)
    throw new Error(
      `템플릿의 예시 숫자를 지금 조건으로 다시 셈하지 못했습니다 — ${listOf(unknown)}. 「템플릿 · 조건」의 숫자가 이 템플릿과 같은지 보세요(같다면 템플릿에 새로 생긴 숫자라 생성기를 고쳐야 합니다).`,
    );
  return work;
}

type BlankPlan = { slide: Slide; p: Paragraph; b: Blank; key: FieldKey; value: FieldValue | null };

/** 빈칸마다 값 — 모르는 빈칸 · 없는 필수 빈칸이면 멈춘다 */
function planBlanks(slides: Slide[], spec: SampleSpec): BlankPlan[] {
  const plans: BlankPlan[] = [];
  const strange: string[] = [];
  for (const slide of slides) {
    const items = slide.paragraphs().flatMap((p) =>
      blanksIn(p.text).map((b) => {
        const key = fieldOf(b, `${p.cell?.rowLabel ?? ''} ${p.text.slice(0, b.start)}`);
        const value = key ? spec.value(key, b.unit) : undefined;
        return { p, b, key, value };
      }),
    );
    const known = items.filter((i): i is typeof i & { key: FieldKey; value: FieldValue | null } => i.key !== null && i.value !== undefined);
    for (const i of items) {
      if (i.key !== null && i.value !== undefined) continue;
      // 빈 대괄호는 늘 채울 자리다 · 이름 있는 대괄호는 채울 자리가 있는 장에서만 — 다른 장의 「[전국 기본풍속]」은 그림 제목이다
      if (i.b.name === '' || known.length) strange.push(`${slide.label} 「${i.p.text.slice(i.b.start, i.b.unitEnd)}」`);
    }
    for (const i of known) plans.push({ slide, ...i });
  }
  if (strange.length) throw new Error(`템플릿에 모르는 빈칸이 있습니다 — ${listOf(strange)}. 그 값을 넣도록 생성기를 고쳐야 합니다.`);
  const missing = spec.required.filter((k) => !plans.some((x) => x.key === k));
  if (missing.length) throw new Error(`템플릿이 바뀌었습니다 — ${missing.map((k) => `「${FIELD_LABEL[k]}」`).join(' · ')} 빈칸을 찾지 못했습니다.`);
  return plans;
}

/**
 * 고친다 — 덩이마다 예시 숫자 · 빈칸의 고칠 자리를 모아 한 번에(앞의 고침이 뒤의 자리를 밀지 않게). 빈칸이 든 칸(글 몸통)은
 * 모르는 값이 하나라도 있으면 통째로 「-」, 채울 자리 빨강은 검정으로, 넘치면 글자를 줄인다.
 */
function apply(swaps: { slide: Slide; p: Paragraph; edits: TextEdit[] }[], plans: BlankPlan[]): FilledBody[] {
  const byBody = new Map<Element, BlankPlan[]>();
  for (const x of plans) byBody.set(x.p.body, [...(byBody.get(x.p.body) ?? []), x]);
  const dashed = new Set([...byBody].filter(([, list]) => list.some((x) => x.value === null)).map(([body]) => body));
  const edits = new Map<Element, { slide: Slide; edits: TextEdit[] }>();
  const add = (slide: Slide, p: Paragraph, es: TextEdit[]) => {
    if (dashed.has(p.body)) return;
    const cur = edits.get(p.el) ?? { slide, edits: [] };
    cur.edits.push(...es);
    edits.set(p.el, cur);
  };
  for (const w of swaps) add(w.slide, w.p, w.edits);
  // 모르는 값이 있는 칸은 통째로 「-」라 고칠 자리를 짓지 않는다
  for (const x of plans) if (x.value !== null) add(x.slide, x.p, [blankEdit(x.b, x.value)]);
  for (const [p, { slide, edits: es }] of edits) slide.editParagraph(p, es);

  const filled: FilledBody[] = [];
  for (const [body, list] of byBody) {
    const { slide } = list[0];
    if (dashed.has(body)) slide.rewriteBody(body, '-');
    slide.recolor(body, MARK_RED, INK);
    fitTo(slide, body, slide.innerWidthPt(body), FIT.min);
    filled.push({ slide, body, shape: list[0].p.shape, keys: list.map((x) => x.key) });
  }
  return filled;
}

/** 글 몸통을 너비(pt)의 90% 에 들게 줄인다(fill-common fitText 와 같은 어림 · 여유) */
export function fitTo(slide: Slide, body: Element, widthPt: number, min: number): void {
  slide.fitBody(body, widthPt * FIT_SAFE, estWidthPt, { min, fallback: FIT.fallback });
}

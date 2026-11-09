/**
 * 견본 읽기 — 사업자 견본(제안서 SAMPLE)이 「여기를 바꾸라」고 적어 둔 자리를 글에서 찾는다. [순수]
 * (한백 2026-11-09 「템플릿이 있으면 거기서 바뀌어야하는 영역과 그렇지 않은 영역을 구분하고 그에 따라 자동으로 입력되게 하는거라고
 *  생각했는데」 — 그전에는 바꿀 칸을 생성기가 칸 이름 · 줄 차례로 짚고 그 칸의 문장을 코드가 통째로 다시 써서, 사업자가 견본 문구를
 *  고쳐 오면(같은 날 「복구됨」 → 「_최종」의 비교표) 옛 문구로 덮었다)
 *
 * 견본이 바꿀 자리를 적는 모양은 둘이다:
 *   빈칸      「[현장 주소]」 · 「[    ] ㎡」 — 대괄호 안의 이름으로, 빈 대괄호면 뒤의 단위(면적은 그 줄의 이름)로 어느 값인지 가른다(fieldOf).
 *   예시 숫자  「…kW(예시) 기준 … 20년간 약 …억원」 — 견본이 예시 용량으로 셈해 적은 금액이다. 같은 셈을 예시 용량 · 이 현장 용량으로
 *            두 번 해서 견본의 숫자만 이 현장 숫자로 바꾼다(swapTableOf · exampleEdits). 문장은 견본 그대로다.
 * 그 밖의 글은 건드리지 않는다. 바꾸지 못하는 금액(조건이 견본과 다르거나 견본에 새로 생긴 셈)은 멈추는 쪽이다 — 틀린 금액이 조용히
 * 나가지 않게. 자리를 찾고 고치는 일은 sample-fill(브라우저 · pptx)이 한다.
 */
import type { TextEdit } from '@/lib/pptx/deck';
import { kwText, roughWonText, wonText } from './calc';

/* ------------------------------------------------------------------ 빈칸 */

/** 빈칸이 받는 값 — 상품마다 대는 값이 다르다(없는 값의 빈칸은 「모르는 빈칸」으로 멈춘다) */
export type FieldKey =
  | 'customer'
  | 'address'
  | 'zoning'
  | 'landCategory'
  | 'landArea'
  | 'buildingArea'
  | 'buildingUse'
  | 'approvedOn'
  | 'substation'
  | 'spareMw'
  | 'gridCondition'
  | 'capacity'
  | 'panels'
  | 'tilt';

/** 멈출 때 쓰는 이름 */
export const FIELD_LABEL: Record<FieldKey, string> = {
  customer: '고객명',
  address: '현장 주소',
  zoning: '용도지역',
  landCategory: '지목',
  landArea: '대지면적',
  buildingArea: '건축면적',
  buildingUse: '건물용도',
  approvedOn: '사용승인일',
  substation: '변전소명',
  spareMw: '변전소 여유용량(MW)',
  gridCondition: '접속 조건',
  capacity: '설치용량(kW)',
  panels: '모듈 장수',
  tilt: '모듈 각도',
};

export type Blank = {
  /** 대괄호의 자리 [start, end) */
  start: number;
  end: number;
  /** 대괄호 안의 이름(앞뒤 빈칸은 걷는다) — 빈 대괄호면 '' */
  name: string;
  /** 대괄호 바로 뒤의 단위(「㎡」 · 「MW」 · 「kW」 · 「EA」 · 「도」) — 없으면 '' */
  unit: string;
  /** 단위까지의 끝 — 값이 단위를 먹을 때(「[  ]도」 → 「지붕면 부착」) */
  unitEnd: number;
};

const UNIT_AFTER = /^\s*(㎡|m²|m2|MW|kW|EA|장|매|도|°)(?![a-zA-Z])/;

/** 글의 대괄호 — 그림 제목(「[전국 기본풍속]」)도 나온다. 채울 자리인지는 fieldOf 와 sample-fill 이 가른다 */
export function blanksIn(text: string): Blank[] {
  return [...text.matchAll(/\[([^[\]\n]*)\]/g)].map((m) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const u = text.slice(end).match(UNIT_AFTER);
    return { start, end, name: m[1].trim(), unit: u ? u[1] : '', unitEnd: u ? end + u[0].length : end };
  });
}

/** 빈칸에 넣을 글 — 대괄호 자리만 바꾼다. eatUnit 이면 뒤의 단위까지(「[  ]도」 → 「지붕면 부착」) */
export type FieldValue = string | { text: string; eatUnit: true };

/** 빈칸을 값으로 바꿀 자리 */
export const blankEdit = (b: Blank, v: FieldValue): TextEdit =>
  typeof v === 'string' ? { start: b.start, end: b.end, text: v } : { start: b.start, end: b.unitEnd, text: v.text };

/**
 * 빈칸이 어느 값의 자리인가 — 이름이 있으면 이름으로(「[(주)고객사명]」 · 「[용도지역]」 · 「[YYYY.MM.DD]」), 빈 대괄호면 뒤의 단위로.
 * 면적(㎡)은 둘이라 context(그 줄의 이름 · 빈칸 앞 글)로 대지 · 건축을 가른다. 모르면 null.
 */
export function fieldOf(b: Blank, context: string): FieldKey | null {
  const n = b.name.replace(/\s+/g, '');
  if (n) {
    if (/고객/.test(n)) return 'customer';
    if (/주소|소재지/.test(n)) return 'address';
    if (/용도지역/.test(n)) return 'zoning';
    if (/지목/.test(n)) return 'landCategory';
    if (/용도/.test(n)) return 'buildingUse';
    if (/YYYY|사용승인|승인일|날짜|일자/i.test(n)) return 'approvedOn';
    if (/변전소/.test(n)) return 'substation';
    if (/접속/.test(n)) return 'gridCondition';
    if (/대지면적|토지면적/.test(n)) return 'landArea';
    if (/건축면적|건물면적/.test(n)) return 'buildingArea';
    if (/용량/.test(n)) return 'capacity';
    if (/장수|수량|매수/.test(n)) return 'panels';
    if (/경사|각도/.test(n)) return 'tilt';
    return null;
  }
  switch (b.unit) {
    case '㎡':
    case 'm²':
    case 'm2': {
      const c = context.replace(/\s+/g, '');
      if (/대지|토지/.test(c)) return 'landArea';
      if (/건축|건물/.test(c)) return 'buildingArea';
      return null;
    }
    case 'MW':
      return 'spareMw';
    case 'kW':
      return 'capacity';
    case 'EA':
    case '장':
    case '매':
      return 'panels';
    case '도':
    case '°':
      return 'tilt';
    default:
      return null;
  }
}

/* -------------------------------------------------------------- 예시 숫자 */

/** 견본의 셈이 내는 금액들 — 이름 → 원. 같은 셈을 예시 용량 · 이 현장 용량으로 부른다 */
export type Amounts = Record<string, number>;

/** 금액 표시 — 「1,234,000 원」 같은 원 단위(won) · 「1.2억원」 · 「567만원」 같은 어림(rough). 「…원/kW」 같은 단가는 아니다 */
export type MoneyToken = { kind: 'won' | 'rough'; start: number; numEnd: number; end: number; value: number; raw: string; unit: string };
/** 용량 표시 「137.15kW」 — 뒤에 「(예시)」 · 「 예시」가 붙으면 그 자리 */
export type KwToken = { start: number; numEnd: number; end: number; value: number; raw: string; marker: { start: number; end: number; text: string } | null };

const NUM = String.raw`(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?`;
/** 단가(「12,000원/kW」 · 「1.2만원/KW」)는 뒤의 「/」로 뺀다 — 용량에 따라 바뀌지 않는다 */
const MONEY = new RegExp(String.raw`${NUM}(\s*)(억\s?원|만\s?원|원)(?!\s*\/)`, 'g');
const KW = new RegExp(String.raw`${NUM}(\s*)[kK][wW](?![a-zA-Z])(\s*\(\s*예시\s*\)|\s*예시)?`, 'g');
/** 금액처럼 보이는 것 전부 — 위 꼴이 아닌 금액(「1억 1천만원」)을 놓치지 않고 짚으려고 */
const LOOSE_MONEY = /(?<![\d.,])\d[\d,.]*\s*(?:억|만|천|원)(?!\s*\/)/g;

export function moneyIn(text: string): MoneyToken[] {
  return [...text.matchAll(MONEY)].map((m) => {
    const start = m.index ?? 0;
    const num = m[1] + (m[2] ?? '');
    const unit = m[4].replace(/\s/g, '');
    return { kind: unit === '원' ? 'won' : 'rough', start, numEnd: start + num.length, end: start + m[0].length, value: Number(num.replace(/,/g, '')), raw: m[0], unit };
  });
}

export function kwIn(text: string): KwToken[] {
  return [...text.matchAll(KW)].map((m) => {
    const start = m.index ?? 0;
    const num = m[1] + (m[2] ?? '');
    const end = start + m[0].length;
    const marker = m[4] ? { start: end - m[4].length, end, text: m[4] } : null;
    return { start, numEnd: start + num.length, end, value: Number(num.replace(/,/g, '')), raw: m[0], marker };
  });
}

/** 견본의 모듈 출력 「…Wp」들 — 조건의 모듈 출력과 같아야 한다(다르면 장수 × 출력이 견본 글과 어긋난다) */
export const wattsIn = (text: string): number[] => [...text.matchAll(/(?<![\d.,])(\d{2,4})\s*Wp(?![a-zA-Z])/g)].map((m) => Number(m[1]));

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const roughKey = (raw: string) => raw.replace(/\s/g, '');

export type SwapTable = {
  exKw: number;
  kw: number;
  /** 견본 금액(원) → 이 현장 금액. null 은 두 셈이 같은 견본 금액을 내 어느 것인지 모르는 것 */
  won: Map<number, number | null>;
  /** 「567만원」 · 「1.2억원」 → 이 현장의 같은 꼴(「2,010만원」 · 「4.8억원」) */
  rough: Map<string, string | null>;
};

/** 예시 용량 · 이 현장 용량으로 같은 셈을 해 견본 금액 → 이 현장 금액의 표를 짓는다 */
export function swapTableOf(exKw: number, kw: number, amounts: (kw: number) => Amounts): SwapTable {
  const ex = amounts(exKw);
  const re = amounts(kw);
  const won = new Map<number, number | null>();
  const rough = new Map<string, string | null>();
  const put = <K, V>(m: Map<K, V | null>, k: K, v: V) => m.set(k, m.has(k) && m.get(k) !== v ? null : v);
  for (const key of Object.keys(ex)) {
    put(won, Math.round(ex[key]), Math.round(re[key]));
    put(rough, roughWonText(ex[key]), roughWonText(re[key]));
  }
  return { exKw, kw, won, rough };
}

const swapOf = (m: MoneyToken, t: SwapTable): number | string | null | undefined => (m.kind === 'won' ? t.won.get(m.value) : t.rough.get(roughKey(m.raw)));

/**
 * 견본의 예시 용량 — 견본에 적힌 용량(…kW) 중 견본 금액을 가장 많이 설명하는 것. 금액이 하나도 안 맞으면(조건이 견본과 다를 때)
 * 「(예시)」가 붙은 것을 고른다 — 그래야 「다시 셈하지 못했습니다」로 어느 숫자가 안 맞는지 짚는다. 용량이 없으면 null.
 */
export function exampleKwOf(texts: string[], amounts: (kw: number) => Amounts): number | null {
  const kws = texts.flatMap(kwIn);
  const money = texts.flatMap(moneyIn);
  let best: { kw: number; score: number; marked: boolean } | null = null;
  for (const v of new Set(kws.map((k) => k.value))) {
    const t = swapTableOf(v, v, amounts);
    const score = money.filter((m) => swapOf(m, t) != null).length;
    const marked = kws.some((k) => same(k.value, v) && k.marker !== null);
    if (!best || score > best.score || (score === best.score && marked && !best.marked)) best = { kw: v, score, marked };
  }
  return best && (best.score > 0 || best.marked) ? best.kw : null;
}

/**
 * 한 덩이 글의 예시 숫자를 이 현장 숫자로 바꿀 자리 — 용량은 숫자만(「(예시)」는 걷고 「 예시」는 「 기준」으로), 금액은 숫자만
 * (어림이 억 ↔ 만으로 넘어가면 단위까지). unknown 은 바꾸지 못한 금액 · 용량(예시 숫자가 있는 장에서만 멈출 거리다),
 * matched 는 바꾼 수(그 장이 예시 숫자가 있는 장인지).
 */
export function exampleEdits(text: string, t: SwapTable): { edits: TextEdit[]; unknown: string[]; matched: number } {
  const edits: TextEdit[] = [];
  const unknown: string[] = [];
  let matched = 0;
  for (const k of kwIn(text)) {
    if (!same(k.value, t.exKw)) {
      unknown.push(k.raw.trim());
      continue;
    }
    matched++;
    edits.push({ start: k.start, end: k.numEnd, text: kwText(t.kw) });
    if (k.marker) edits.push({ start: k.marker.start, end: k.marker.end, text: k.marker.text.includes('(') ? '' : ' 기준' });
  }
  const money = moneyIn(text);
  for (const m of money) {
    const v = swapOf(m, t);
    if (v == null || (m.kind === 'won' && !Number.isInteger(m.value))) {
      unknown.push(m.raw.trim());
      continue;
    }
    matched++;
    if (typeof v === 'number') {
      edits.push({ start: m.start, end: m.numEnd, text: wonText(v) });
      continue;
    }
    const [, num, unit] = v.match(/^([\d,.]+)(.+)$/) ?? ['', v, ''];
    edits.push(unit === m.unit ? { start: m.start, end: m.numEnd, text: num } : { start: m.start, end: m.end, text: v });
  }
  const starts = new Set(money.map((m) => m.start));
  for (const m of text.matchAll(LOOSE_MONEY)) if (!starts.has(m.index ?? -1)) unknown.push(m[0].trim());
  return { edits, unknown, matched };
}

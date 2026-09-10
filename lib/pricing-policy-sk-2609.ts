/**
 * SK일렉링크 2026-09-01 정책 — 케이스 정의. [한백 전용]
 *
 * 원문: 한백 지시 2026-09-10 (「단가표가 또 업데이트되었어. SK일렉링크」), 적용은 ★9월 1일부터★
 * (한백 확인 2026-09-10 「지금 내가 주는 조건은 9월 1일부터 적용」). `scripts/print-sk-2609-sql.ts`
 * 가 이 파일을 읽어 마이그레이션 SQL 을 만든다.
 *
 * ── 받는 총액과 한백 마진 (한백이 준 것) ──────────────────────────────────
 *   보조 한전불입  7년 250 · 10년 260   마진 7년 20 · 10년 30   ★7년 한전불입이 새로 가능해졌다★
 *   보조 모자분리  7년 +20 · 10년 +30  (260 → 280 / 290)   마진 7년 20 · 10년 30
 *   자체투자       7년 220 · 10년 230   마진 20   ★제자리교체·신규위치 구분 없이★
 *   기설치 연동    7년 220 · 10년 230   마진 40   (150 에서 인상)
 *
 * ── 분해 — 시공비는 유형마다 정해진 값, 나머지가 영업비 ─────────────────────
 *   SK 는 다른 운영사의 「시공 100 고정」 프레임이 아니다(연동은 공사가 없어 0).
 *   보조 시공비는 ★수전방식과 무관하게 같다★ — 노션 매트릭스가 하반기 한전불입만 120 으로
 *   적어 두었던 것은 잘못이었다(한백 확인 2026-09-10 「한전불입 10년 하반기도 시공비가 100이어야
 *   해」— 그 수정은 별도 SQL). 9/1 부터 ★보조·자투 시공비는 110★ (한백 지시 「9/1부터는 110으로」 ·
 *   「자투 7/10 영업비 90/100 시공비 110 마진 20」). 자투는 하반기 90 에서 올라온다.
 *   7년과 10년의 마진이 갈리므로 기존 「7·10년 한 칸」 케이스는 두 칸으로 나눈다.
 *
 * ── 기존 7/20 케이스는 그대로 둔다 ─────────────────────────────────────────
 *   7/20~8/31 계약분이 참조한다 — 「수정」하면 그 현장 계획액이 소급된다. 새 케이스로 세우고,
 *   후보 화면은 늦게 시작한 것을 위에 올린다(lib/pricing-match byStart). 종료일은 시스템에
 *   자리가 없어 7/20 케이스의 설치조건 문장(~09-30)이 그대로 말한다.
 *
 * ── id 는 손으로 정한다 ────────────────────────────────────────────────────
 *   pricingRuleId 는 축+사업연도만 보므로 같은 축의 다음 정책이 같은 id 를 낸다(감사 H4 —
 *   pl-2609 에서 11건 중 5건이 조용히 안 들어갈 뻔했다). SK 케이스 id 는 원래 손 이름이다
 *   (sk-h2-*). 9/1 판은 `sk-2609-` 로 시작해 어느 축과도 겹칠 수 없게 한다.
 */
import type { NewPricingRule, SettlementStepRule } from '@/types/project';

/**
 * ★끝도 적는다 — 「2026년 9월 1일 ~ 12월 31일」★ (한백 지시 2026-09-10 「SK일렉링크도
 * 플러그링크처럼 구간별로 날짜를 표시해줘야지」). 시작일만 적혀 있으면 열려 있는 것처럼
 * 읽히고, 어느 계약일에 어느 케이스가 맞는지 사람이 해석해야 한다 — 계약일과 견줄 수 있는
 * 구간이어야 한다. 플러그링크가 먼저 그렇게 갔다(PL_START · migrations/0057).
 *
 * 12/31 은 연 단위 정책 관행이다 — SK 문서가 9/1 정책의 종료일을 말한 적은 없다(부속합의서의
 * 9/30 은 7/20 정책의 것이었고 9/1 정책이 덮었다). 10월에 새 단가가 오면 그때 고친다.
 *
 * 정렬·시기 탭·중복 판정은 앞 날짜를 읽는다(lib/pricing-match startKey → 2026-09-01).
 */
export const SK_2609_START = '2026년 9월 1일 ~ 12월 31일';

/* ── 시공비 — 유형마다 하나 ── */
/** 보조(환경부) — 수전방식 무관. 하반기 100 → 9/1 부터 110 (한백 지시 2026-09-10) */
export const SK_2609_SUB_CONS = 1_100_000;
/** 자체투자 — 하반기 90 → 9/1 부터 110 (한백 지시 2026-09-10 「자투 7/10 영업비 90/100 시공비 110 마진 20」) */
export const SK_2609_INV_CONS = 1_100_000;
/** 연동 — 공사가 없다(lib/pricing-policy-link-h2 와 같은 프레임) */
export const SK_2609_LINK_CONS = 0;

/* ── 마진 ── */
const MARGIN_20 = 200_000;
const MARGIN_30 = 300_000;
const MARGIN_40 = 400_000;

/* ── 조건 칸 — 7/20 케이스(lib/pricing-policy-sk-h2)의 문장을 잇고 기간만 9/1 로 ── */
const SK_REGION = '수도권 · 6개 광역시 · 시 단위의 상면';
const SK_PERIOD = '적용: 2026-09-01 ~ 12-31 계약일 기준(접수된 설치 계약서의 계약일)';
const SK_TARGET = '아파트 · 주거형 오피스텔 · 지식산업센터 · 일반 상업시설·기타 부지(병원·골프장 등)';
const SK_INSTALL_SUB = `대상: ${SK_TARGET} · 지역: ${SK_REGION} · ${SK_PERIOD}`;
const SK_INSTALL_INV = `모자분리 조건 · 대상: ${SK_TARGET} · 지역: ${SK_REGION} · ${SK_PERIOD}`;
const SK_INSTALL_LINK = `모자분리 조건 · 7년 계약 이상 · 지역: ${SK_REGION} · ${SK_PERIOD}`;

const SK_MISC = [
  '· 시공 전 사전 설치도면·견적서를 제출해 서면 승인 — 승인되지 않은 시공비는 청구 불가',
  '· 단가는 협약자 등급에 따라 차등 적용될 수 있음(재산정 요청 가능)',
  '· 협약자 귀책 재시공 비용은 협약자 부담 · 당사 시방서 기준 준수',
  '· 대금: 세금계산서 확인 후 익월 25일 현금 지급(공휴일이면 전일)',
  '· 용어(모자분리·상면 등) 정의는 당사 교부 시방서·정책서에 따름',
].join('\n');
/* 연동만의 조건 — 공통 대금 줄은 sk 기타와 겹치니 안 적는다(link-h2 와 같은 판단) */
const SK_LINK_MISC = '· 급속충전기 연동에 대한 수수료는 제외';

/* ── 정산 — 보조는 착공 80만 → 잔액(sk-2step), 자투·연동은 준공 일시금(lump-100) ── */
export const SK_SUB_STEPS: SettlementStepRule[] = [
  { trigger: '착공', basis: { kind: '고정', unit: 800_000 } },
  { trigger: '준공마감', basis: { kind: '잔액' } },
];
export const SK_LUMP_STEPS: SettlementStepRule[] = [
  { trigger: '준공마감', basis: { kind: '비율', ratio: 1 } },
];

const BASE = {
  cpo: 'SK일렉링크' as const,
  powerType: '모자분리' as const,
  channel: '턴키' as const,
  bizYear: 2026,
  startDate: SK_2609_START,
  bldgTypes: ['공동주택', '상업시설'] as const,
  supervisionBearer: '운영사',
  safetyFeeBearer: '한백 대납(회수)',
  supplyItems: null,
  promo: null,
  promoExtend: null,
  chargeRate: null,
  otherSupport: null,
  coexistTerms: null,
  note: null,
};

/** 총액에서 시공비·마진을 뺀 나머지 — 영업비. 음수가 나오면 정의가 틀린 것이라 던진다 */
function salesOf(total: number, cons: number, margin: number): number {
  const sales = total - cons - margin;
  if (sales <= 0) throw new Error(`영업비가 ${sales / 10_000}만 — 총 ${total / 10_000}만에서 시공 ${cons / 10_000}만·마진 ${margin / 10_000}만을 빼면 남는 것이 없습니다.`);
  return sales;
}

/** 케이스 한 칸 — id 는 손 이름(sk-2609-…) */
export interface Sk2609Rule extends NewPricingRule {
  id: string;
  /** 검산용 — 받는 총액 */
  total: number;
}

function sub(power: '모자분리' | '한전불입', years: 7 | 10, total: number, margin: number): Sk2609Rule {
  const slug = power === '모자분리' ? 'mother' : 'kepco';
  return {
    ...BASE,
    id: `sk-2609-y${years}-${slug}-new`,
    caseName: `SK일렉링크 (${SK_2609_START}) | 전체 | ${years}년 신규 | ${power}`,
    bizType: '환경부',
    powerType: power,
    replType: '환경부 신규',
    termYears: [years],
    bldgTypes: [...BASE.bldgTypes],
    salesUnit: salesOf(total, SK_2609_SUB_CONS, margin),
    consUnit: SK_2609_SUB_CONS,
    margin,
    installTerms: SK_INSTALL_SUB,
    miscTerms: SK_MISC,
    settlementSteps: SK_SUB_STEPS,
    total,
  };
}

/*
 * 자체투자 — ★제자리교체·신규위치 구분이 없어졐다★ (한백 2026-09-10). 대표값은 제자리교체다
 * (types/project replTypesOf — 안 가르는 운영사는 신규위치를 제자리교체로 눕힌다). 그래서 SK 를
 * SPLITS_SELF_REPL 에서 빼는 코드 변경이 같이 간다 — 케이스만 하나로 만들고 축을 그대로 두면
 * 신규위치로 접수된 라인이 후보를 못 찾는다.
 */
function inv(years: 7 | 10, total: number): Sk2609Rule {
  return {
    ...BASE,
    id: `sk-2609-y${years}-mother-inplace-both`,
    caseName: `SK일렉링크 (${SK_2609_START}) | 전체 | ${years}년 자체투자 | 모자분리`,
    bizType: '자체투자',
    replType: '자체투자 (제자리교체)',
    termYears: [years],
    bldgTypes: [...BASE.bldgTypes],
    salesUnit: salesOf(total, SK_2609_INV_CONS, MARGIN_20),
    consUnit: SK_2609_INV_CONS,
    margin: MARGIN_20,
    installTerms: SK_INSTALL_INV,
    miscTerms: SK_MISC,
    settlementSteps: SK_LUMP_STEPS,
    total,
  };
}

function link(years: 7 | 10, total: number): Sk2609Rule {
  return {
    ...BASE,
    id: `sk-2609-y${years}-mother-link-both`,
    caseName: `SK일렉링크 (${SK_2609_START}) | 전체 | ${years}년 기설치 연동 | 모자분리`,
    bizType: '기설치 연동',
    replType: '기설치 연동',
    termYears: [years],
    bldgTypes: [...BASE.bldgTypes],
    salesUnit: salesOf(total, SK_2609_LINK_CONS, MARGIN_40),
    consUnit: SK_2609_LINK_CONS,
    margin: MARGIN_40,
    supervisionBearer: null,
    safetyFeeBearer: null,
    installTerms: SK_INSTALL_LINK,
    miscTerms: SK_LINK_MISC,
    settlementSteps: SK_LUMP_STEPS,
    total,
  };
}

/** 9/1 케이스 여덟 — 순서는 매트릭스가 그리는 순서(보조 → 자투 → 연동) */
export function sk2609Rules(): Sk2609Rule[] {
  return [
    sub('모자분리', 7, 2_800_000, MARGIN_20),
    sub('모자분리', 10, 2_900_000, MARGIN_30),
    sub('한전불입', 7, 2_500_000, MARGIN_20),
    sub('한전불입', 10, 2_600_000, MARGIN_30),
    inv(7, 2_200_000),
    inv(10, 2_300_000),
    link(7, 2_200_000),
    link(10, 2_300_000),
  ];
}

/**
 * 기존 7/20 한전불입 케이스의 시공비 정정 — 120 → 100 (한백 확인 2026-09-10).
 *
 * 노션 매트릭스가 하반기 인상분 20만을 모자분리는 영업비에, 한전불입은 시공비에 넣어
 * 두었다. 시공비는 수전방식과 무관해야 하므로 한전불입도 100 이다 — 협력사 몫(220)은 그대로,
 * 영업사·시공사 사이의 나눔만 바뀐다. ★참조 라인에 소급된다★ — 반영 전에 참조·잠금을 본다
 * (scripts/check-sk-cases.ts). 잠긴 현장이 참조하면 그 확정을 먼저 풀어야 한다(저장소 규칙).
 */
export const SK_H2_KEPCO_FIX = {
  id: 'sk-h2-y10-kepco-new',
  before: { salesUnit: 1_000_000, consUnit: 1_200_000 },
  after: { salesUnit: 1_200_000, consUnit: 1_000_000 },
} as const;

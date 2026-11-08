/**
 * 제안서의 숫자 — 설치용량(kW) 하나와 그 틀의 조건(DB)에서 나온다. [순수]
 *
 * 셈의 모양은 사업자가 준 자료의 것을 그대로 옮겼다(2026-11-06 — 자료의 견본 숫자를 이 셈으로 다시 내 원 단위까지 맞췄다):
 *   솔라15        1~15년 임대료(기본형 kW × 임대료 · 5년 선납형 1년차 선지급 + 6~15년 kW × 임대료) → 16~35년 건물주 100%
 *                 발전수익 kW × 발전시간 × 365 × (SMP + REC × 가중치) × (1 − 열화)^(n−1). 운영비는 빼지 않는다(자료 각주 그대로).
 *                 표는 억원 소수 둘째, 합계는 안 반올린 값으로 센다(삽입용 엑셀이 그렇다).
 *   솔라쉐어 2.0  5년치 선지급 1년차 kW × (기본 + 이벤트) × 5 · 6~20년 kW × 기본 임대료 / 매년 지급 1년차 kW × (기본 + 이벤트) ·
 *                 2~20년 kW × 기본 임대료. 만원 단위 소수 한 자리(아래는 버림) · 억으로 묶는다(고객용 틀의 표기).
 *   루모라 임대   kW × 단가(1 · 5 · 10년 선납 — 선납 할인 없음) · 20년. 연차표는 백만원 반올림, 합계는 실제 금액(자료 각주).
 * 값(단가 · 가정)은 저장소에 없다 — products.ts 머리말.
 */
import type { Terms } from './products';

/** from 년차부터 to 년차까지의 합(1부터 · 받는 돈이 없는 해 null 은 0) */
const sumYears = (years: readonly (number | null)[], from: number, to: number): number =>
  years.slice(from - 1, to).reduce<number>((s, v) => s + (v ?? 0), 0);

/** 패널 장수 × 모듈 출력 → kW (소수 둘째 — 「194.95 kW」처럼 자료가 그렇게 적는다) */
export const capacityKw = (panels: number, watt: number): number => Math.round(panels * watt * 100 / 1000) / 100;

/** 「1,234.56」 — 소수는 있을 때만 */
export const kwText = (kw: number): string => kw.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ 솔라15 */

export type Solar15Variant = 'basic' | 'prepay';
export const SOLAR15_YEARS = 35;
export const SOLAR15_RENT_YEARS = 15;
export const SOLAR15_PREPAY_YEARS = 5;

export type Solar15 = {
  variant: Solar15Variant;
  kw: number;
  /** 1~35년 건물주 몫(억원) — 선납형의 2~5년은 null(「-」) */
  years: (number | null)[];
  sum1to15: number;
  sum16to20: number;
  sum1to20: number;
  sum21to35: number;
  sum35: number;
  /** 35년 총 수익 ÷ 35 ÷ 12 (만원) */
  monthlyManwon: number;
  /** SMP + REC × 가중치 (원/kWh) */
  unitPrice: number;
};

export function solar15(kw: number, t: Terms, variant: Solar15Variant): Solar15 {
  const eok = (won: number) => won / 1e8;
  const unitPrice = t.smp + t.rec * t.recWeight;
  const years: (number | null)[] = [];
  for (let n = 1; n <= SOLAR15_YEARS; n++) {
    if (n <= SOLAR15_RENT_YEARS) {
      if (variant === 'basic') years.push(eok(kw * t.rentPerKw));
      else if (n === 1) years.push(eok(kw * t.prepayPerKw));
      else if (n <= SOLAR15_PREPAY_YEARS) years.push(null);
      else years.push(eok(kw * t.prepayRentPerKw));
    } else {
      years.push(eok(kw * t.hoursPerDay * 365 * unitPrice * (1 - t.degradationPct / 100) ** (n - 1)));
    }
  }
  const sum = (a: number, b: number) => sumYears(years, a, b);
  const sum35 = sum(1, 35);
  return {
    variant,
    kw,
    years,
    sum1to15: sum(1, 15),
    sum16to20: sum(16, 20),
    sum1to20: sum(1, 20),
    sum21to35: sum(21, 35),
    sum35,
    monthlyManwon: (sum35 * 1e8) / 35 / 12 / 1e4,
    unitPrice,
  };
}

/** 억원 소수 둘째 — 「0.40」 · 「63.57」 */
export const eok2 = (v: number): string => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------- 솔라쉐어 2.0 */

export const SHARE_YEARS = 20;
export const SHARE_PREPAY_YEARS = 5;

export type ShareOption = { year1: number; y2to5: number; y6to20: number; total: number };
export type Share = { kw: number; prepay: ShareOption; annual: ShareOption };

export function solarShare(kw: number, t: Terms): Share {
  const base = kw * t.rentPerKw;
  const prepayYear1 = kw * (t.prepayBasePerKw + t.prepayEventPerKw) * SHARE_PREPAY_YEARS;
  const later = base * (SHARE_YEARS - SHARE_PREPAY_YEARS);
  const annualYear1 = kw * (t.rentPerKw + t.annualEventPerKw);
  const annual2to5 = base * (SHARE_PREPAY_YEARS - 1);
  return {
    kw,
    prepay: { year1: prepayYear1, y2to5: 0, y6to20: later, total: prepayYear1 + later },
    annual: { year1: annualYear1, y2to5: annual2to5, y6to20: later, total: annualYear1 + annual2to5 + later },
  };
}

/**
 * 「6,823.2 만 원」 · 「1억 1,697 만 원」 — 만원 소수 한 자리(아래는 버림), 억으로 묶는다. 고객용 틀(솔라쉐어 2.0)의 표기다.
 * 소수가 0 이면 안 적는다(「3,704 만 원」).
 */
export function manwonText(won: number): string {
  const tenth = Math.floor(won / 1000); // 0.1 만원 단위
  const eok = Math.floor(tenth / 100_000);
  const rest = (tenth - eok * 100_000) / 10;
  const restText = rest.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  if (eok === 0) return `${restText} 만 원`;
  return rest === 0 ? `${eok}억 원` : `${eok}억 ${restText} 만 원`;
}

/* --------------------------------------------------------------- 루모라 임대 */

export const LUMORA_YEARS = 20;
export const LUMORA_PREPAYS = [1, 5, 10] as const;
export type LumoraPrepay = (typeof LUMORA_PREPAYS)[number];

export type LumoraOption = {
  prepay: LumoraPrepay;
  /** 원/kW·년 */
  price: number;
  /** 한 해 임대료(원) */
  annual: number;
  /** 처음 한 번에 받는 돈(원) = 한 해 × 선납 년수 */
  upfront: number;
  /** 20년 합계(원) */
  total: number;
  /** 1~20년에 받는 돈(원) — 선납 기간의 나머지 해는 null(「-」) */
  years: (number | null)[];
};

export type Lumora = {
  kw: number;
  options: Record<LumoraPrepay, LumoraOption>;
  /** 1년 선납의 달 환산(원) */
  monthly: number;
  /** 누적으로 1년 선납이 10년 선납을 처음 앞서는 해 — 없으면 null */
  crossover: { year: number; before: number; one: number; ten: number } | null;
};

export function lumoraRent(kw: number, t: Terms): Lumora {
  const priceOf: Record<LumoraPrepay, number> = { 1: t.price1, 5: t.price5, 10: t.price10 };
  const opt = (prepay: LumoraPrepay): LumoraOption => {
    const price = priceOf[prepay];
    const annual = kw * price;
    const years: (number | null)[] = [];
    for (let n = 1; n <= LUMORA_YEARS; n++) years.push(n === 1 ? annual * prepay : n <= prepay ? null : annual);
    return { prepay, price, annual, upfront: annual * prepay, total: annual * LUMORA_YEARS, years };
  };
  const options = { 1: opt(1), 5: opt(5), 10: opt(10) } as Record<LumoraPrepay, LumoraOption>;
  const cum = (o: LumoraOption, n: number) => sumYears(o.years, 1, n);
  let crossover: Lumora['crossover'] = null;
  for (let n = 2; n <= LUMORA_YEARS; n++) {
    if (cum(options[1], n) > cum(options[10], n)) {
      crossover = { year: n, before: cum(options[10], n - 1), one: cum(options[1], n), ten: cum(options[10], n) };
      break;
    }
  }
  return { kw, options, monthly: options[1].annual / 12, crossover };
}

/** 「8억 4,000만원」 · 「4,200만원」 · 「2억원」 — 만원 반올림(루모라 덱의 표기) */
export function eokManText(won: number): string {
  const man = Math.round(won / 1e4);
  const eok = Math.floor(man / 10_000);
  const rest = man - eok * 10_000;
  if (eok === 0) return `${rest.toLocaleString('ko-KR')}만원`;
  return rest === 0 ? `${eok}억원` : `${eok}억 ${rest.toLocaleString('ko-KR')}만원`;
}

/**
 * 연차표 칸 — 백만원, 소수 첫째 자리 반올림(1MW 면 「42」, 491kW 면 「20.6」), 없는 해는 「-」. 자료는 정수로 반올림했는데
 * 1MW 견본이라 그것으로 맞았다 — 작은 현장에서 「21」 스무 칸의 합(420)이 합계(413)와 어긋나 보여 한 자리를 둔다.
 */
export const millionText = (won: number | null): string =>
  won === null ? '-' : (Math.round(won / 1e5) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 });

/* ------------------------------------------- 자가소비형 — 솔라쉐어바로 · 구독형 리스 */

/**
 * 자가소비형 — 고객이 발전량 전부를 사업자 단가(원/kWh, 20년 고정)로 사고, 자가소비한 만큼 한전 요금을 덜 내고, 남는 전기는 판다.
 * 고객 값 셋: 1년차 자가소비량(파워플래너 15분 사용량과 발전 모양을 맞대어 센다) · 한전 단가(태양광이 대체하는 시간대의 평균
 * 전력량요금 — 영업사가 요금제 이름과 함께 넣는다, 한백 2026-11-07) · 연간 사용량(파워플래너 — RE100 비율).
 * 셈의 모양은 사업자 견본 그대로다(2026-11-07 — 견본 숫자를 이 셈으로 다시 내 맞췄다):
 *   솔라쉐어바로  자가소비량은 해마다 1년차 값(발전량이 그보다 줄면 발전량) — 견본 연차표가 그렇다.
 *   구독형 리스   자가소비는 발전량 × 1년차 자가소비율 · 요금 시나리오 셋(동결 · 기본 · 인상 확대) · RE100(같은 물량의 REC 구매 대비).
 */
export const SELF_USE_YEARS = 20;

export type SelfUseSite = {
  /** 1년차 자가소비량(kWh) */
  selfKwh: number;
  /** 한전 단가(원/kWh) */
  tariff: number;
  /** 연간 사용량(kWh) */
  usageKwh: number;
};

/** 해마다 발전량(kWh) = kW × 발전시간 × 365 × (1 − 감소율)^(n−1) */
const genOf = (kw: number, t: Terms, n: number) => kw * t.hoursPerDay * 365 * (1 - t.degradationPct / 100) ** (n - 1);
const grow = (pct: number, n: number) => (1 + pct / 100) ** (n - 1);

function sumOf<T extends Record<string, number>>(rows: T[]): T {
  const out: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + v;
  return out as T;
}

export type BaroYear = {
  /** 발전량(kWh) */
  gen: number;
  /** 자가소비량(kWh) */
  self: number;
  /** 초과발전량(kWh) */
  excess: number;
  /** 전력구매비용(원) = 발전량 × 설비임대단가 */
  cost: number;
  /** 기존 전력량요금(원) = 자가소비량 × 한전 단가 × (1 + 인상률)^(n−1) */
  bill: number;
  /** 초과발전량 전기판매수익(원) = 초과발전량 × SMP */
  sale: number;
  /** 전기요금 연 이득(원) = 기존 전력량요금 + 판매수익 − 전력구매비용 */
  gain: number;
};
export type Baro = { kw: number; years: BaroYear[]; total: BaroYear; /** 1년차 초과발전 비율(%) */ excessPct: number };

export function solarShareBaro(kw: number, t: Terms, site: Pick<SelfUseSite, 'selfKwh' | 'tariff'>): Baro {
  const years: BaroYear[] = [];
  for (let n = 1; n <= SELF_USE_YEARS; n++) {
    const gen = genOf(kw, t, n);
    const self = Math.min(site.selfKwh, gen);
    const excess = gen - self;
    const cost = gen * t.ppaPrice;
    const bill = self * site.tariff * grow(t.tariffIncreasePct, n);
    const sale = excess * t.smp;
    years.push({ gen, self, excess, cost, bill, sale, gain: bill + sale - cost });
  }
  return { kw, years, total: sumOf(years), excessPct: (years[0].excess / years[0].gen) * 100 };
}

export type LeaseYear = {
  gen: number;
  self: number;
  excess: number;
  /** 한전요금(태양광 공급분, 원) = 자가소비 × 한전 단가 × (1 + 인상률)^(n−1) */
  bill: number;
  /** 구독료(원) = 발전량 × 구독료 */
  fee: number;
  /** 초과발전 판매수익(원) = 초과 × (SMP + REC) */
  sale: number;
  /** 전기요금 절감액(원) = 한전요금 − 구독료 + 판매수익 */
  saving: number;
  /** (선택) REGO 판매 수익(원) = 발전량 × REGO 단가 — 판 물량은 RE100 실적으로 안 친다 */
  rego: number;
  /** 같은 물량을 REC 로 살 때의 값(원) = 발전량 × REC 단가 */
  rec: number;
};
export type LeaseScenario = { pct: number; savings: number[]; total: number };
export type Lease = {
  kw: number;
  /** 기본 인상률의 연차 */
  years: LeaseYear[];
  total: LeaseYear;
  /** 자가소비율(%) = 1년차 자가소비량 / 1년차 발전량(100 이 넘으면 100) */
  selfPct: number;
  /** 요금 시나리오 — 동결(0%) · 기본 · 인상 확대 */
  scenarios: { freeze: LeaseScenario; base: LeaseScenario; high: LeaseScenario };
  /** 사용량 대비 1년차 발전량(%) — RE100 이행 비율 */
  re100Pct: number;
  /** 탄소 감축(tCO₂) = 발전량(MWh) × 배출계수 — 1년차 · 20년 */
  carbonT: number;
  carbonT20: number;
};

export function lumoraLease(kw: number, t: Terms, site: SelfUseSite): Lease {
  const gen1 = genOf(kw, t, 1);
  const ratio = Math.min(1, site.selfKwh / gen1);
  const yearsAt = (pct: number): LeaseYear[] => {
    const rows: LeaseYear[] = [];
    for (let n = 1; n <= SELF_USE_YEARS; n++) {
      const gen = genOf(kw, t, n);
      const self = gen * ratio;
      const excess = gen - self;
      const bill = self * site.tariff * grow(pct, n);
      const fee = gen * t.subscriptionPrice;
      const sale = excess * t.excessPrice;
      rows.push({ gen, self, excess, bill, fee, sale, saving: bill - fee + sale, rego: gen * t.regoPrice, rec: gen * t.recPrice });
    }
    return rows;
  };
  const scenario = (pct: number): LeaseScenario => {
    const savings = yearsAt(pct).map((y) => y.saving);
    return { pct, savings, total: savings.reduce((s, v) => s + v, 0) };
  };
  const years = yearsAt(t.tariffIncreasePct);
  const total = sumOf(years);
  return {
    kw,
    years,
    total,
    selfPct: ratio * 100,
    scenarios: { freeze: scenario(0), base: scenario(t.tariffIncreasePct), high: scenario(t.tariffIncreaseHighPct) },
    re100Pct: site.usageKwh > 0 ? (gen1 / site.usageKwh) * 100 : 0,
    carbonT: (gen1 / 1000) * t.emissionFactor,
    carbonT20: (total.gen / 1000) * t.emissionFactor,
  };
}

/* ------------------------------------------------------------------- 공통 */

/**
 * 줄 간격을 정한 해의 높이(음영각, 도) — 우리 배치는 동지 오전 10시~오후 2시에 앞줄 그림자가 뒷줄에 닿지 않게 띄운다(lib/solar/layout).
 * 남북 단면에서 본 해의 각도 = atan(1 / 높이 1 의 남북 그림자). 북위 37° 에서 약 25°(루모라 덱 예시의 24° 와 같은 말이다).
 */
export const profileAngleDeg = (shadowPerHeight: number): number => Math.round((Math.atan(1 / shadowPerHeight) * 180) / Math.PI);

/** 「2026년 12월」에서 몇 달 뒤 — 사업 일정(계약월 + 3 · 4 · 7개월) */
export function monthAfter(year: number, month: number, add: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + add;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

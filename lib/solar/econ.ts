/**
 * 솔라쉐어바로 경제성 — ★순수 계산만 한다★.
 *
 * 제안서 19번 슬라이드의 20년 손익표가 이것이다. 사람이 엑셀로 만들어 붙이던 표고,
 * 값 일곱 개만 넣으면 전부 유도된다 — 제안서에서 손이 가장 많이 가던 자리다.
 *
 * ★식은 샘플 제안서에서 역산했다★ (무창 352.95kW, 2026-10-22). 지어낸 식이 아니라
 * 실제로 나간 표의 숫자를 한 줄씩 맞춰 본 것이고, 시험이 그 표를 그대로 못 박는다.
 *
 *   발전량(y)   = 설비용량 × 발전시간 × 365 × (1 − 효율감소)^(y−1)
 *   자가소비(y) = min(발전량, 연 소비가능 발전량)      ← 현장 전력사용량 분석에서 온다
 *   초과(y)     = 발전량 − 자가소비
 *   A 구매비용  = ★발전량 전체★ × 임대단가            ← 자가소비분이 아니다(샘플이 그렇다)
 *   B 기존요금  = 자가소비 × 기존단가 × (1 + 인상률)^(y−1)
 *   C 판매수익  = 초과 × 상계단가                      ← ★이쪽은 안 오른다★
 *   이득        = B + C − A
 *
 * ★상계단가는 샘플에서 역산한 값이다★ — 112.73원/kWh. 한전 요금상계거래의 정산 단가인데
 * 정책 문서를 못 봤다. 기본값으로 두되 화면에서 고칠 수 있어야 한다(틀리면 C 와 누적이 통째로 움직인다).
 */

export interface EconInput {
  /** 설비용량 (kW) */
  capacityKw: number;
  /** 일 발전시간 (h) — P90 기준값을 쓴다 */
  hoursPerDay: number;
  /** 연 소비가능 발전량 (kWh) — 현장 전력사용량 분석 결과 */
  selfUseKwh: number;
  /** 설비임대단가 (원/kWh) — 계약기간 고정 */
  leaseRate: number;
  /** 기존 전력량 단가 (원/kWh) */
  gridRate: number;
  /** 초과발전 상계단가 (원/kWh) */
  offsetRate: number;
  /** 전기요금 연 인상률 — 0.04 = 4% */
  escalation: number;
  /** 설비효율 연 감소율 — 0.004 = 0.4% */
  decay: number;
  /** 계약기간 (년) */
  years: number;
}

/** 표 한 줄 — 금액은 ★원★ 단위다. 천원으로 줄이는 것은 보여줄 때의 일이다. */
export interface EconYear {
  year: number;
  genKwh: number;
  selfKwh: number;
  excessKwh: number;
  /** A — 솔라쉐어바로 전력구매비용 */
  leaseCost: number;
  /** B — 기존 전력량요금 */
  gridCost: number;
  /** C — 초과발전량 전기판매수익 */
  saleIncome: number;
  /** B + C − A */
  benefit: number;
}

export interface Econ {
  rows: EconYear[];
  /** 첫해 이득 (원) */
  firstYear: number;
  /** 계약기간 누적 이득 (원) */
  total: number;
  /** 첫해 초과발전 비율 — 0.3041 = 30.41% */
  excessRatio: number;
  /** 첫해 발전량 (kWh) */
  firstGenKwh: number;
}

/** 샘플 제안서가 쓴 값 — 화면의 기본값 */
export const ECON_DEFAULTS = {
  leaseRate: 140,
  offsetRate: 112.73,
  escalation: 0.04,
  decay: 0.004,
  years: 20,
  hoursPerDay: 3.6,
} as const;

export function econOf(input: EconInput): Econ {
  const {
    capacityKw, hoursPerDay, selfUseKwh, leaseRate, gridRate,
    offsetRate, escalation, decay, years,
  } = input;

  const gen1 = capacityKw * hoursPerDay * 365;
  const rows: EconYear[] = [];

  for (let y = 1; y <= Math.max(0, Math.floor(years)); y += 1) {
    const genKwh = gen1 * (1 - decay) ** (y - 1);
    /* 소비할 수 있는 만큼만 자가소비다 — 발전이 적은 해에는 발전량이 상한이 된다 */
    const selfKwh = Math.min(genKwh, selfUseKwh);
    const excessKwh = genKwh - selfKwh;

    const leaseCost = genKwh * leaseRate;
    const gridCost = selfKwh * gridRate * (1 + escalation) ** (y - 1);
    const saleIncome = excessKwh * offsetRate;

    rows.push({
      year: y,
      genKwh,
      selfKwh,
      excessKwh,
      leaseCost,
      gridCost,
      saleIncome,
      benefit: gridCost + saleIncome - leaseCost,
    });
  }

  const total = rows.reduce((n, r) => n + r.benefit, 0);
  return {
    rows,
    firstYear: rows[0]?.benefit ?? 0,
    total,
    excessRatio: gen1 > 0 ? (rows[0]?.excessKwh ?? 0) / gen1 : 0,
    firstGenKwh: gen1,
  };
}

/* ── 제안서에 그대로 실리는 글자 ───────────────────────────────────────────── */

/** 「7.09억 원」 — 2번·19번 슬라이드의 누적 이득 표기 */
export function eokLabel(won: number): string {
  return `${(Math.round(won / 1_000_000) / 100).toFixed(2)}억 원`;
}

/** 「738만원」 — 2번 슬라이드의 첫해 이득 표기 */
export function manLabel(won: number): string {
  return `${Math.round(won / 10_000).toLocaleString('ko-KR')}만원`;
}

/** 「30.41%」 */
export function pctLabel(ratio: number): string {
  return `${(Math.round(ratio * 10_000) / 100).toFixed(2)}%`;
}

/** 표의 금액 칸 — 단위가 천원이다(19번 슬라이드 머리에 「단위 : 천원」) */
export const thousand = (won: number): number => Math.round(won / 1000);

/** 「322,730 kWh」처럼 세 자리마다 쉼표 */
export const kwh = (n: number): string => Math.round(n).toLocaleString('ko-KR');

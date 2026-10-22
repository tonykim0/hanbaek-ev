/**
 * 20년 손익표 — ★실제로 나간 제안서의 표를 그대로 못 박는다★.
 *
 * 기준은 샘플 제안서(무창 352.95kW, 19번 슬라이드)다. 식을 지어낸 것이 아니라 그 표의
 * 숫자에서 역산했으므로, 시험이 그 표와 어긋나면 식이 틀린 것이다 — 이 표가 제안서에
 * 그대로 실리고 고객이 그 수를 보고 계약한다.
 */
import { describe, expect, it } from 'vitest';
import {
  ECON_DEFAULTS, econOf, eokLabel, manLabel, pctLabel, thousand, type EconInput,
} from '@/lib/solar/econ';

/** 무창 현장 — 제안서 19번 슬라이드의 「발전소 정보」 칸 그대로 */
const MUCHANG: EconInput = {
  capacityKw: 352.95,
  hoursPerDay: 3.6,
  selfUseKwh: 322_730,
  leaseRate: 140,
  gridRate: 174.8,
  offsetRate: 112.73,
  escalation: 0.04,
  decay: 0.004,
  years: 20,
};

describe('샘플 제안서의 표와 한 줄씩 맞춘다', () => {
  const e = econOf(MUCHANG);

  it('1년차 — 발전량·자가소비·초과가 제안서와 같다', () => {
    const r = e.rows[0];
    expect(Math.round(r.genKwh)).toBe(463_776);
    expect(Math.round(r.selfKwh)).toBe(322_730);
    expect(Math.round(r.excessKwh)).toBe(141_046);
  });

  it('1년차 — A·B·C·이득이 제안서와 같다 (천원)', () => {
    const r = e.rows[0];
    expect(thousand(r.leaseCost)).toBe(64_929);
    expect(thousand(r.gridCost)).toBe(56_413);
    expect(thousand(r.saleIncome)).toBe(15_900);
    expect(thousand(r.benefit)).toBe(7_385);
  });

  it('2년차 — 설비는 0.4% 줄고 전기요금은 4% 오른다', () => {
    const r = e.rows[1];
    expect(Math.round(r.genKwh)).toBe(461_921);
    expect(thousand(r.leaseCost)).toBe(64_669);
    expect(thousand(r.gridCost)).toBe(58_670);
    expect(thousand(r.saleIncome)).toBe(15_691);
    expect(thousand(r.benefit)).toBe(9_692);
  });

  it('5년차까지 이득이 제안서와 같다', () => {
    expect(e.rows.slice(0, 5).map((r) => thousand(r.benefit)))
      .toEqual([7_385, 9_692, 12_089, 14_580, 17_168]);
  });

  it('★자가소비량은 안 줄어든다★ — 설비가 늙어도 쓸 수 있는 만큼은 그대로다', () => {
    for (const r of e.rows) expect(Math.round(r.selfKwh)).toBe(322_730);
  });

  it('★상계단가는 안 오른다★ — 오르는 것은 한전 요금뿐이다', () => {
    const a = e.rows[0].saleIncome / e.rows[0].excessKwh;
    const b = e.rows[9].saleIncome / e.rows[9].excessKwh;
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('제안서 머리에 실리는 수', () => {
  const e = econOf(MUCHANG);

  it('첫해 이득 738만원', () => {
    expect(manLabel(e.firstYear)).toBe('738만원');
  });

  it('초과발전 30.41%', () => {
    expect(pctLabel(e.excessRatio)).toBe('30.41%');
  });

  it('20년 누적 7.09억 원', () => {
    expect(eokLabel(e.total)).toBe('7.09억 원');
  });
});

describe('값이 모자라거나 이상할 때', () => {
  it('계약기간이 0이면 줄이 없고 합이 0이다 — 빈 표를 그리지 않는다', () => {
    const e = econOf({ ...MUCHANG, years: 0 });
    expect(e.rows).toEqual([]);
    expect(e.total).toBe(0);
    expect(e.firstYear).toBe(0);
  });

  it('★발전량이 쓸 수 있는 양보다 적으면 초과가 0이다★ — 작은 설비에 음수가 안 생긴다', () => {
    const e = econOf({ ...MUCHANG, capacityKw: 50 });
    expect(e.rows[0].excessKwh).toBe(0);
    expect(e.rows[0].saleIncome).toBe(0);
    expect(e.excessRatio).toBe(0);
  });

  it('설비용량이 0이면 전부 0이고 나눗셈이 터지지 않는다', () => {
    const e = econOf({ ...MUCHANG, capacityKw: 0 });
    expect(e.excessRatio).toBe(0);
    expect(e.rows[0].benefit).toBe(0);
  });

  it('기본값은 샘플이 쓴 값이다 — 화면이 이것으로 열린다', () => {
    expect(ECON_DEFAULTS.leaseRate).toBe(MUCHANG.leaseRate);
    expect(ECON_DEFAULTS.escalation).toBe(MUCHANG.escalation);
    expect(ECON_DEFAULTS.decay).toBe(MUCHANG.decay);
    expect(ECON_DEFAULTS.years).toBe(MUCHANG.years);
  });
});

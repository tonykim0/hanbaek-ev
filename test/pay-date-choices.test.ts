/**
 * 지급일 후보 — 감사 2026-09-04 M20. 트리거가 오래된 줄에 이미 지난 날짜를 후보로 내지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { payDateChoiceLabel, payDateChoices } from '@/lib/payout-board';

describe('payDateChoices', () => {
  it('최근 충족분은 익월 10·25일', () => {
    expect(payDateChoices('2026-09-05', '2026-09-09')).toEqual(['2026-10-10', '2026-10-25']);
  });
  it('두 달 넘게 지난 충족분은 앞으로 올 10·25일 둘', () => {
    expect(payDateChoices('2026-06-20', '2026-09-09')).toEqual(['2026-09-10', '2026-09-25']);
    expect(payDateChoices('2026-06-20', '2026-09-15')).toEqual(['2026-09-25', '2026-10-10']);
    expect(payDateChoices('2026-06-20', '2026-09-26')).toEqual(['2026-10-10', '2026-10-25']);
  });
  it('당일은 아직 낼 수 있는 날이다', () => {
    expect(payDateChoices('2026-08-01', '2026-09-10')).toEqual(['2026-09-10', '2026-09-25']);
  });
  it('연말을 넘긴다', () => {
    expect(payDateChoices('2026-12-03', '2026-12-05')).toEqual(['2027-01-10', '2027-01-25']);
  });
  it('표시 — 같은 달과 갈린 달', () => {
    expect(payDateChoiceLabel(['2026-10-10', '2026-10-25'])).toBe('10월 10·25일');
    expect(payDateChoiceLabel(['2026-09-25', '2026-10-10'])).toBe('9월 25일 · 10월 10일');
  });
});

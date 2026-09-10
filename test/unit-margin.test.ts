/**
 * 1기당 한백 마진 — 한백 지시 2026-09-10.
 *
 * 쓸모는 「이 사업이 한 기당 얼마 남기나」다. 그래서 위아래의 범위가 같아야 하고
 * (단가 붙은 라인만), 대수로 나눌 값이 아닌 것(점검수수료)은 빠져야 한다.
 */
import { describe, expect, it } from 'vitest';
import { unitMarginOf } from '@/lib/settlement';

const site = (marginTotal: number, pricedQty: number, safetyFee: number | null = null) =>
  ({ marginTotal, pricedQty, safetyFee });

describe('1기당 마진', () => {
  it('마진 합을 대수 합으로 나눈다 — 현장이 여럿이면 가중평균이다', () => {
    expect(unitMarginOf([site(600_000, 3), site(400_000, 2)]))
      .toEqual({ perUnit: 200_000, qty: 5 });
  });

  it('★단가 미지정 라인은 위아래 모두에서 빠진다★ — qty 로 나누면 적게 나온다', () => {
    // 5기 계약 중 3기만 단가가 붙었다: 마진 60만은 그 3기의 것이다
    const rows = [site(600_000, 3)];
    expect(unitMarginOf(rows)).toEqual({ perUnit: 200_000, qty: 3 });
    // 계약 총 대수 5로 나눴다면 12만 — 어느 케이스에도 없는 값이다
    expect(600_000 / 5).toBe(120_000);
  });

  it('★점검수수료는 뺀다★ — 현장마다 한 번 받는 돈이라 대수로 나눌 값이 아니다', () => {
    // 마진 60만(3기) + 수수료 30만이 marginTotal 에 같이 들어 있다
    expect(unitMarginOf([site(900_000, 3, 300_000)]))
      .toEqual({ perUnit: 200_000, qty: 3 });
  });

  it('수수료가 섞이면 대수 적은 현장이 부풀어 보인다 — 그래서 뺀다', () => {
    const withFee = [site(900_000, 3, 300_000), site(400_000, 2)];
    expect(unitMarginOf(withFee)).toEqual({ perUnit: 200_000, qty: 5 });
    // 안 뺐다면 26만 — 실제 케이스 마진(20만)과 다른 수가 된다
    expect(Math.round((900_000 + 400_000) / 5)).toBe(260_000);
  });

  it('★셀 대수가 없으면 null★ — 0 으로 적으면 「마진이 0」으로 읽힌다', () => {
    expect(unitMarginOf([])).toBeNull();
    expect(unitMarginOf([site(0, 0)])).toBeNull();
    // 단가가 하나도 안 붙었으면 마진도 0이지만, 그건 「모른다」이지 「0」이 아니다
    expect(unitMarginOf([site(0, 0, 300_000)])).toBeNull();
  });

  it('나누어떨어지지 않으면 원 단위로 반올림한다', () => {
    expect(unitMarginOf([site(1_000_000, 3)])).toEqual({ perUnit: 333_333, qty: 3 });
  });
});

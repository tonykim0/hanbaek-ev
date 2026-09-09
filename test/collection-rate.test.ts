/**
 * 수금률은 실제로 받은 돈으로 센다 (감사 2026-09-04 M30).
 * 협의로 계획액과 다르게 받는 현장이 있다 — 익산 예다음아르띠에는 케이스 150만/기, 실제 190만/기.
 */
import { describe, expect, it } from 'vitest';
import { collectionRate } from '@/lib/settlement';

type Steps = Parameters<typeof collectionRate>[0];
const step = (planAmount: number, state: string, collectedAmount: number | null = null) =>
  ({ planAmount, state, collectedAmount }) as unknown as Steps[number];

describe('collectionRate', () => {
  it('실수금액이 있으면 그것으로 센다', () => {
    expect(collectionRate([step(1_500_000, 'collected', 1_900_000), step(500_000, 'waiting')])).toBe(95);
  });
  it('실수금액이 비어 있으면 계획액대로 받은 것이다', () => {
    expect(collectionRate([step(1_500_000, 'collected'), step(500_000, 'waiting')])).toBe(75);
  });
  it('계획이 0이면 비율이 없다', () => {
    expect(collectionRate([step(0, 'waiting')])).toBeNull();
  });
});

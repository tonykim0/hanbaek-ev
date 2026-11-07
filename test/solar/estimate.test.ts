import { describe, expect, it } from 'vitest';
import { areaLabel, capacityOf, estimate } from '@/lib/solar/estimate';

describe('capacityOf', () => {
  it('300평 지붕(991㎡) ≈ 90kW — 10kW 단위로 내림', () => expect(capacityOf(991.7, 'roof')).toBe(90));
  it('땅 13,000㎡ = 1,000kW', () => expect(capacityOf(13_000, 'ground')).toBe(1000));
  it('너무 작으면 0', () => expect(capacityOf(50, 'roof')).toBe(0));
});

describe('estimate', () => {
  it('용량과 그 근거 — 연 발전량은 걷었다(2026-11-08)', () => {
    const e = estimate({ area: 1000, mode: 'roof' })!;
    expect(e.capacityKw).toBe(100);
    expect(e.assumptions.map((a) => a.label)).toEqual(['용량']);
    expect('yearlyKwh' in e).toBe(false);
  });
  it('용량이 0 이면 추정 없음', () => expect(estimate({ area: 10, mode: 'roof' })).toBeNull());
});

describe('areaLabel — 지붕 면적 · 건축면적 · 필지 면적의 글', () => {
  it('㎡ 와 평을 같이, 둘 다 정수로', () => {
    expect(areaLabel(3522.4)).toBe('3,522㎡ (1,066평)');
    expect(areaLabel(991.7)).toBe('992㎡ (300평)');
    expect(areaLabel(0)).toBe('0㎡ (0평)');
  });
});

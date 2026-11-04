import { describe, expect, it } from 'vitest';
import { areaLabel, capacityOf, estimate } from '@/lib/solar/estimate';

describe('capacityOf', () => {
  it('300평 지붕(991㎡) ≈ 90kW — 10kW 단위로 내림', () => expect(capacityOf(991.7, 'roof')).toBe(90));
  it('땅 13,000㎡ = 1,000kW', () => expect(capacityOf(13_000, 'ground')).toBe(1000));
  it('너무 작으면 0', () => expect(capacityOf(50, 'roof')).toBe(0));
});

describe('estimate', () => {
  it('PVGIS 값이 있으면 그것으로 발전량', () => {
    const e = estimate({ area: 1000, mode: 'roof', kwhPerKwYear: 1290 })!;
    expect(e.capacityKw).toBe(100);
    expect(e.yearlyKwh).toBe(129_000);
    expect(e.assumptions.map((a) => a.label)).toEqual(['용량', '발전량']);
  });
  it('PVGIS 가 없으면 하루 3.6시간', () => {
    expect(estimate({ area: 1000, mode: 'roof' })!.yearlyKwh).toBe(Math.round(100 * 3.6 * 365));
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

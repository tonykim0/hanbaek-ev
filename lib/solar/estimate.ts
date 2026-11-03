import { AREA_PER_KW, FALLBACK_HOURS_PER_DAY } from './assumptions';
import type { Estimate, Mode } from './types';

/** 면적 → 용량(kW). 10kW 아래는 버린다(소수점 용량은 견적에 의미가 없다). */
export function capacityOf(area: number, mode: Mode): number {
  return Math.floor(area / AREA_PER_KW[mode] / 10) * 10;
}

export function estimate(input: {
  area: number;
  mode: Mode;
  /** PVGIS 연 발전량(1kW 당). 없으면 하루 3.6시간으로 셈한다 */
  kwhPerKwYear?: number | null;
}): Estimate | null {
  return estimateCapacity({
    capacityKw: capacityOf(input.area, input.mode),
    mode: input.mode,
    kwhPerKwYear: input.kwhPerKwYear,
    capacityNote: `${input.mode === 'roof' ? '건축면적' : '땅 면적'} ${AREA_PER_KW[input.mode]}㎡ 당 1kW`,
    usableArea: input.area,
  });
}

/** 용량이 정해진 뒤의 셈 — 지도에서 지붕을 골라 패널 장수로 용량을 정할 때도 이것을 부른다 */
export function estimateCapacity(input: {
  capacityKw: number;
  mode: Mode;
  kwhPerKwYear?: number | null;
  /** 계산 가정의 「용량」 줄 — 무엇으로 용량을 정했나 */
  capacityNote: string;
  usableArea: number;
}): Estimate | null {
  const capacityKw = Math.round(input.capacityKw * 10) / 10;
  if (capacityKw <= 0) return null;

  const perKw = input.kwhPerKwYear ?? FALLBACK_HOURS_PER_DAY * 365;
  const yearlyKwh = Math.round(capacityKw * perKw);

  return {
    usableArea: Math.round(input.usableArea),
    capacityKw,
    yearlyKwh,
    assumptions: [
      { label: '용량', value: input.capacityNote },
      {
        label: '발전량',
        value: input.kwhPerKwYear
          ? `PVGIS-ERA5 (2005~2023) 1kW 당 연 ${Math.round(perKw).toLocaleString()}kWh · 하루 ${(perKw / 365).toFixed(2)}시간`
          : `하루 ${FALLBACK_HOURS_PER_DAY}시간 (PVGIS 응답 없음 — 업계 어림값)`,
      },
    ],
  };
}

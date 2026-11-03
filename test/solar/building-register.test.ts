import { describe, expect, it } from 'vitest';
import { roofKind, roofLabel, summarizeRegister, type RegisterBuilding } from '@/lib/solar/building-register';
import { buildingsOf } from '@/lib/solar/sources/bldg';

describe('roofLabel — 햇빛길과 같은 표기', () => {
  it('「기타…」 코드면 기타 칸을 붙인다', () => expect(roofLabel('기타지붕', '판넬')).toBe('기타지붕(판넬)'));
  it('코드 이름만 있으면 그것', () => expect(roofLabel('(철근)콘크리트', '')).toBe('(철근)콘크리트'));
  it('기타 칸만 있으면 그것', () => expect(roofLabel(null, 'LTS구조')).toBe('LTS구조'));
  it('둘 다 없으면 null', () => expect(roofLabel(' ', null)).toBeNull());
  it('기타 칸에 코드 이름이 이미 있으면 그대로 (충주 생산동)', () => expect(roofLabel('기타지붕', '기타지붕(판넬)')).toBe('기타지붕(판넬)'));
  it('모양을 덧붙인 기타 칸 (충주 사무동)', () => expect(roofLabel('(철근)콘크리트', '평지붕')).toBe('(철근)콘크리트 평지붕'));
});

const b = (archArea: number | null, roof: string | null, useApr: string | null = null): RegisterBuilding => ({
  dong: null,
  main: true,
  archArea,
  structure: '일반철골구조',
  roof,
  height: 8.8,
  use: '공장',
  useApr,
});

describe('summarizeRegister', () => {
  it('건축면적 합 · 가장 큰 동 · 지붕 갈래는 넓은 순 (충주 영덕리 2074)', () => {
    const s = summarizeRegister([b(584.69, '(철근)콘크리트 평지붕'), b(981.43, '기타지붕(판넬)', '20241128'), b(977.8, '기타지붕(판넬)'), b(977.8, '기타지붕(판넬)')]);
    expect(s.area).toBeCloseTo(3521.72);
    expect(s.count).toBe(4);
    expect(s.biggest?.useApr).toBe('20241128');
    expect(s.kinds.map((k) => [k.kind, Math.round(k.area), k.count])).toEqual([
      ['판넬·금속', 2937, 3],
      ['콘크리트', 585, 1],
    ]);
    expect(s.slate).toBe(false);
  });
  it('부속건축물은 면적에 안 센다 (풍세로 706: 주 7동 3,496.52㎡ · 부속 4동 231.43㎡)', () => {
    const s = summarizeRegister([{ ...b(3496.52, '(철근)콘크리트') }, { ...b(231.43, '기와'), main: false }]);
    expect(s.area).toBeCloseTo(3496.52);
    expect(s.attached).toEqual({ count: 1, area: 231.43 });
  });
  it('슬레이트 지붕을 짚는다', () => expect(summarizeRegister([b(300, '슬레이트')]).slate).toBe(true));
  it('면적이 빈 동은 0 으로 센다', () => expect(summarizeRegister([b(null, null), b(100, null)]).area).toBe(100));
});

describe('roofKind — 설치 방식이 갈리는 갈래', () => {
  it.each([
    ['기타지붕(샌드위치판넬)', '판넬·금속'],
    ['기타지붕(칼라A/L쉬트)', '판넬·금속'],
    ['기타지붕(LTS구조)', '판넬·금속'],
    ['(철근)콘크리트 슬래브', '콘크리트'],
    ['기타지붕(슬라브)', '콘크리트'],
    ['(철근)콘크리트 슬래브,기와', '기와'],
    ['슬레이트', '슬레이트'],
    ['기타지붕', '기타'],
  ])('%s → %s', (label, kind) => expect(roofKind(label)).toBe(kind));
});

describe('buildingsOf — 표제부 응답 한 줄', () => {
  it('글자로 오는 숫자 · 빈 칸 · 부속건축물', () => {
    const [x] = buildingsOf([
      { dongNm: '', mainAtchGbCdNm: '부속건축물', archArea: '3521.72', strctCdNm: '일반철골구조', roofCdNm: '기타지붕', etcRoof: '판넬', heit: '8.8', mainPurpsCdNm: '공장', useAprDay: '20240115' },
    ]);
    expect(x).toEqual({
      dong: null,
      main: false,
      archArea: 3521.72,
      structure: '일반철골구조',
      roof: '기타지붕(판넬)',
      height: 8.8,
      use: '공장',
      useApr: '20240115',
    });
  });
  it('건축면적 0 은 없는 값', () => expect(buildingsOf([{ archArea: '0' }])[0].archArea).toBeNull());
});

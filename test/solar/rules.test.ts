import { describe, expect, it } from 'vitest';
import {
  bottleneckOf,
  judgeBuildingAge,
  judgeGrid,
  judgeLandCategory,
  judgePermit,
  judgeRoofSetback,
  judgeSetback,
  judgeZones,
  landCategoryOf,
} from '@/lib/solar/rules';
import type { GridRow } from '@/lib/solar/types';

describe('judgeZones', () => {
  const z = (name: string, relation = '포함') => ({ name, relation });
  it('개발제한구역 — 지상형은 불가, 지붕형은 걸리지 않음', () => {
    expect(judgeZones([z('개발제한구역')], 'ground')[0].level).toBe('banned');
    expect(judgeZones([z('개발제한구역')], 'roof')).toEqual([]);
  });
  it('접함은 그 땅의 지역이 아니다', () => {
    expect(judgeZones([z('개발제한구역', '접함')], 'ground')).toEqual([]);
  });
  it('저촉은 걸린다', () => {
    expect(judgeZones([z('농업진흥구역', '저촉')], 'ground')[0].level).toBe('banned');
  });
  it('계획관리지역은 규칙에 없다 — 막지 않는다', () => {
    expect(judgeZones([z('계획관리지역')], 'ground')).toEqual([]);
  });
  it('국가유산 주변은 지붕형도 조건부', () => {
    expect(judgeZones([z('역사문화환경보존지역')], 'roof')[0].level).toBe('conditional');
  });
  it('하천구역은 소하천구역과 하천구역만 — 「수변구역」의 하천에 걸리지 않는다', () => {
    expect(judgeZones([z('수변구역')], 'ground')[0].level).toBe('conditional');
    expect(judgeZones([z('하천구역')], 'ground')[0].level).toBe('hard');
  });
});

describe('지목', () => {
  it('지번 끝 글자', () => {
    expect(landCategoryOf('142-1 답')).toBe('답');
    expect(landCategoryOf('산 12임')).toBe('임');
    expect(landCategoryOf('142-1')).toBeNull();
  });
  it('농지·임야는 조건부, 공장용지는 통과', () => {
    expect(judgeLandCategory('답')!.level).toBe('conditional');
    expect(judgeLandCategory('임')!.level).toBe('conditional');
    expect(judgeLandCategory('장')!.level).toBe('ok');
  });
});

/** 변전소·주변압기·배전선로 여유로 줄 하나 — 접수는 0, 한도는 여유와 같게 */
const row = (sub: number | null, tr: number | null, fd: number | null): GridRow => {
  const l = (v: number | null) => ({ spareKw: v, acceptedKw: 0, limitKw: v });
  const all = [sub, tr, fd];
  return {
    substation: '풍세',
    transformer: '2',
    feeder: '가송',
    spareKw: all.every((v) => v !== null) ? Math.min(...(all as number[])) : null,
    layers: { substation: l(sub), transformer: l(tr), feeder: l(fd) },
  };
};

describe('judgeGrid', () => {
  it('여유 ≥ 용량이면 적합 — 가장 빠듯한 단계를 같이 말한다', () => {
    expect(judgeGrid(row(104353, 33690, 11123), 350, '44')).toEqual({ level: 'ok', why: '여유 11,123kW — 가장 빠듯한 배전선로 기준' });
  });
  it('여유 < 용량이면 조건부', () => {
    const j = judgeGrid(row(104353, 300, 11123), 350, '44');
    expect(j.level).toBe('conditional');
    expect(j.why).toMatch(/^주변압기 여유 300kW/);
  });
  it('변전소·주변압기가 0 이면 한전 보강을 기다린다 (나주SA)', () => {
    expect(judgeGrid(row(0, 0, 1723), 350, '44')).toEqual({ level: 'hard', why: '변전소·주변압기 여유 0 — 한전 보강이 끝나야 접속' });
  });
  it('배전선로만 0 이면 선로 보강 — 비용은 사업자', () => {
    const j = judgeGrid(row(104353, 33690, 0), 350, '44');
    expect(j.level).toBe('hard');
    expect(j.why).toMatch(/^배전선로 여유 0.*사업자/);
  });
  it('자료 없으면 확인 못함', () => expect(judgeGrid(null, 100, '44').level).toBe('unknown'));
  it('한 단계라도 비면 확인 못함', () => expect(judgeGrid(row(500, null, 500), 100, '44').level).toBe('unknown'));
  it('호남은 여유가 있어도 조건부 — 새 사업 접수는 2027년 1월부터 (새 코드 12·52, 옛 코드 46)', () => {
    for (const sido of ['12', '52', '46']) {
      const j = judgeGrid(row(500, 500, 500), 100, sido);
      expect(j.level).toBe('conditional');
      expect(j.why).toMatch(/2027년 1월/);
    }
  });
  it('호남이라도 여유 0 이면 부적합 그대로', () => expect(judgeGrid(row(0, 0, 500), 100, '46').level).toBe('hard'));
  it('제주는 아직 계통관리변전소', () => expect(judgeGrid(row(500, 500, 500), 100, '50').why).toMatch(/^제주 — 계통관리변전소/));
});

describe('bottleneckOf', () => {
  it('여유가 가장 작은 단계', () => expect(bottleneckOf(row(104353, 300, 11123))).toBe('transformer'));
  it('모르는 단계가 있으면 모름', () => expect(bottleneckOf(row(1, null, 1))).toBeNull());
});

describe('judgeSetback — 200m 안 5호 미만이면 법상 이격 대상이 아니다', () => {
  it('4호 통과', () => expect(judgeSetback(4).level).toBe('ok'));
  it('5호 조건부', () => expect(judgeSetback(5).level).toBe('conditional'));
});

describe('judgeBuildingAge', () => {
  const now = new Date('2026-11-02');
  it('30년 넘으면 안전진단', () => expect(judgeBuildingAge('19950301', now)!.level).toBe('conditional'));
  it('새 건물 통과', () => expect(judgeBuildingAge('20150301', now)!.level).toBe('ok'));
  it('날짜 없으면 판단 안 함', () => expect(judgeBuildingAge(null, now)).toBeNull());
});

describe('judgePermit — 3MW 를 경계로 허가권자가 갈린다 (전기사업법 제7조 · 시행령 제62조)', () => {
  it('3MW 이하는 시·도지사', () => expect(judgePermit(2053, '44')?.why).toMatch(/시·도지사/));
  it('3MW 넘으면 기후에너지환경부장관 · 전기위원회', () => expect(judgePermit(6838, '44')?.why).toMatch(/기후에너지환경부장관.*전기위원회/));
  it('제주 태양광은 제주특별자치도지사', () => expect(judgePermit(500, '50')?.why).toMatch(/제주특별자치도지사/));
  it('용량을 모르면 칸이 없다', () => expect(judgePermit(null, '44')).toBeNull());
});

describe('judgeRoofSetback — 지붕형도 제27조의3 ① 지역에서는 이격이 걸릴 수 있다', () => {
  const z = (name: string, relation = '포함') => ({ name, relation });
  it('자연취락지구 안이면 조건부', () => expect(judgeRoofSetback([z('자연취락지구')]).level).toBe('conditional'));
  it('역사문화환경보존지역 안이면 조건부', () => expect(judgeRoofSetback([z('역사문화환경보존지역', '저촉')]).level).toBe('conditional'));
  it('접하기만 하면 해당없음', () => expect(judgeRoofSetback([z('자연취락지구', '접함')]).level).toBe('skip'));
  it('다른 「보호구역」·관광지구는 ① 지역이 아니다', () => {
    for (const name of ['상수원보호구역', '농업보호구역', '군사기지 및 군사시설 보호구역', '관광지구'])
      expect(judgeRoofSetback([z(name)]).level).toBe('skip');
  });
  it('지역 자료가 없으면 해당없음', () => expect(judgeRoofSetback(null).level).toBe('skip'));
});

import { describe, expect, it } from 'vitest';
import { withCapacity } from '@/lib/solar/capacity-checks';
import { judgeDevPermit, judgeLandCategory, judgeTerrain } from '@/lib/solar/rules';
import type { Report } from '@/lib/solar/types';

describe('judgeTerrain — 토지특성의 지형높이 · 도로접면', () => {
  it('평지 · 소로한면은 걸리는 것 없음', () => expect(judgeTerrain({ height: '평지', road: '소로한면' })).toEqual([]));
  it('급경사는 경사도 기준을, 맹지는 진입도로를 짚는다', () => {
    const hits = judgeTerrain({ height: '급경사', road: '맹지' });
    expect(hits.map((h) => h.level)).toEqual(['conditional', 'conditional']);
    expect(hits[0].why).toContain('15°');
    expect(hits[1].why).toContain('진입도로');
  });
  it('고지 · 세로(불)도 짚는다', () => expect(judgeTerrain({ height: '고지', road: '세로(불)' })).toHaveLength(2));
  it('완경사 · 세로(가)는 걸리지 않는다', () => expect(judgeTerrain({ height: '완경사', road: '세로(가)' })).toEqual([]));
});

describe('judgeDevPermit — 개발행위허가 규모(시행령 제55조) · 소규모 환경영향평가(별표 4)', () => {
  it('계획관리지역 9,999㎡ — 규모 안 · 소규모 환경영향평가 대상 아님', () => {
    const j = judgeDevPermit(['계획관리지역'], 9_999, '필지 면적');
    expect(j.level).toBe('ok');
    expect(j.why).toContain('규모 안');
  });
  it('계획관리지역 1만㎡ — 소규모 환경영향평가 협의(이상이면)', () => {
    const j = judgeDevPermit(['계획관리지역'], 10_000, '필지 면적');
    expect(j.level).toBe('conditional');
    expect(j.why).toContain('소규모 환경영향평가');
    expect(j.why).not.toContain('규모(');
  });
  it('관리지역 3만㎡ — 개발행위허가 규모를 넘어 심의 · 재해영향평가', () => {
    const j = judgeDevPermit(['생산관리지역'], 30_000, '그린 네모 2개');
    expect(j.why).toContain('30,000㎡ 미만)를 넘음');
    expect(j.why).toContain('재해영향평가');
    expect(j.facts.find((f) => f.label === '개발 면적')?.value).toBe('30,000㎡ (그린 네모 2개)');
  });
  it('보전관리지역은 5천㎡부터 소규모 환경영향평가', () => expect(judgeDevPermit(['보전관리지역'], 5_000, '필지').level).toBe('conditional'));
  it('용도지역이 둘이면 한도가 작은 쪽 — 자연녹지(1만) · 보전녹지(5천)', () => {
    const j = judgeDevPermit(['자연녹지지역', '보전녹지지역'], 6_000, '필지');
    expect(j.why).toContain('보전녹지지역 개발행위허가 규모(5,000㎡ 미만)');
  });
  it('도시지역(일반공업지역)은 소규모 환경영향평가 대상 지역이 아니다', () => {
    const j = judgeDevPermit(['일반공업지역'], 16_930, '필지');
    expect(j.level).toBe('ok');
    expect(j.facts.find((f) => f.label === '소규모 환경영향평가')?.value).toBe('대상 지역 아님');
  });
  it('용도지역을 모르면 못 봄', () => expect(judgeDevPermit(['가축사육제한구역'], 1_000, '필지').level).toBe('unknown'));
});

describe('judgeLandCategory — 산지는 산지일시사용허가 · 평균경사도 15°', () => {
  it('임야', () => expect(judgeLandCategory('임')?.why).toBe('지목 임야 — 산지일시사용허가 필요 · 평균경사도 15° 이하'));
});

describe('withCapacity — 그린 네모의 넓이로 개발 인허가를 다시', () => {
  const report = {
    checks: [{ key: 'dev', title: '개발 인허가', status: 'ok', summary: '개발행위허가(시·군) — 규모 안' }],
    grid: null,
    inputs: { sido: '44', zones: ['계획관리지역'] },
  } as unknown as Report;
  it('네모가 1만㎡를 넘으면 소규모 환경영향평가로 바뀐다', () => {
    const r = withCapacity(report, 800, { m2: 12_000, basis: '그린 네모 1개' });
    const dev = r.checks.find((c) => c.key === 'dev')!;
    expect(dev.status).toBe('conditional');
    expect(r.verdict.level).toBe('conditional');
  });
  it('넓이를 안 주면 그대로', () => expect(withCapacity(report, 800).checks.find((c) => c.key === 'dev')?.status).toBe('ok'));
});

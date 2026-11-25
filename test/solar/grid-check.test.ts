/**
 * 계통 칸의 말(lib/solar/capacity-checks gridCheckOf) — 한전에 물었다가 못 받은 것과 한전에 기록이 없는 것은 다른 말이다.
 * 2026-11-24~25 한전 개방포털이 접속을 받지 않아 부지 검토마다 「한전 여유용량 자료 없음」이 떴다(기록이 없다는 말로 읽힌다).
 */
import { describe, expect, it } from 'vitest';
import { gridCheckOf, gridViewOf } from '@/lib/solar/capacity-checks';

describe('gridCheckOf', () => {
  it('한전이 답하지 않았으면(시간 초과 · 연결 실패) 「한전 서버 응답 없음」 — 사유는 사실 줄에', () => {
    for (const error of ['[한전] 응답 없음 (10초)', '[한전] TypeError: fetch failed']) {
      const c = gridCheckOf(null, error, '44');
      expect(c.status).toBe('unknown');
      expect(c.summary).toBe('한전 서버 응답 없음 — 여유용량 못 받음');
      expect(c.facts).toEqual([{ label: '한전 자료', value: error }]);
    }
  });

  it('그 밖의 한전 실패(HTTP 500 · 키 없음)는 「한전 조회 실패」', () => {
    expect(gridCheckOf(null, '[한전] HTTP 500 오류', '44').summary).toBe('한전 조회 실패 — 여유용량 못 받음');
    expect(gridCheckOf(null, '[한전] KEPCO_KEY 없음', '44').summary).toBe('한전 조회 실패 — 여유용량 못 받음');
  });

  it('못 받았으면 지역 사정이 있어도 결론 줄은 「못 받음」 — 사정은 사실 줄 · 상태는 조건부 그대로', () => {
    const c = gridCheckOf(null, '[한전] 응답 없음 (10초)', '50');
    expect(c.status).toBe('conditional');
    expect(c.summary).toBe('한전 서버 응답 없음 — 여유용량 못 받음');
    expect(c.facts?.map((f) => f.label)).toEqual(['한전 자료', '지역 사정']);
  });

  it('한전이 답했는데 기록이 없으면 「한전 기록 없음」 그대로', () => {
    const view = gridViewOf({ rows: [], via: null }, 100, '44');
    expect(gridCheckOf(view, null, '44').summary).toBe('한전 기록 없음 — 이 번지·둘레 150m·같은 동 모두');
  });

  it('묻지도 않은 것(필지번호 없음)은 「한전 여유용량 자료 없음」 그대로', () => {
    const c = gridCheckOf(null, '필지번호 없음', '44');
    expect(c.summary).toBe('한전 여유용량 자료 없음');
  });
});

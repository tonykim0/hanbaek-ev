import { describe, expect, it } from 'vitest';
import { judge } from '@/lib/solar/verdict';
import type { Check, CheckStatus } from '@/lib/solar/types';

const c = (key: string, status: CheckStatus): Check => ({ key, title: key, status, summary: key });

describe('judge', () => {
  it('전부 통과면 적합, 사유 없음', () => {
    expect(judge([c('a', 'ok'), c('b', 'ok')])).toMatchObject({ level: 'ok', because: [] });
  });
  it('가장 나쁜 상태가 판정이고 그 검사들이 사유다', () => {
    const v = judge([c('a', 'ok'), c('b', 'hard'), c('c', 'conditional'), c('d', 'hard')]);
    expect(v.level).toBe('hard');
    expect(v.because.map((x) => x.key)).toEqual(['b', 'd']);
  });
  it('설치 불가가 하나라도 있으면 설치 불가', () => {
    expect(judge([c('a', 'unknown'), c('b', 'banned')]).level).toBe('banned');
  });
  it('자료 없는 검사는 통과로 치지 않는다 — 적합 대신 조건부', () => {
    const v = judge([c('a', 'ok'), c('b', 'unknown')]);
    expect(v.level).toBe('conditional');
    expect(v.because.map((x) => x.key)).toEqual(['b']);
  });
  it('해당 없는 검사는 판정에 안 낀다', () => {
    expect(judge([c('a', 'ok'), c('b', 'skip')])).toMatchObject({ level: 'ok', unknown: [] });
  });
});

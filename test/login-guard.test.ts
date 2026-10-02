/**
 * 로그인 문 두 곳 — 2026-10-02 보안 점검에서 걸린 것.
 *
 *   ① 전수 대입 잠금이 30분마다 0으로 돌아가던 것 (lib/auth/throttle failsInWindow)
 *   ② 로그인 뒤 `//가짜.com` 으로 보낼 수 있던 것 (lib/auth/next-path)
 */
import { describe, expect, it } from 'vitest';
import { failsInWindow, lockMsFor, MAX_LOCK_MS, WINDOW_MS, type Row } from '@/lib/auth/throttle';
import { safeNextPath } from '@/lib/auth/next-path';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 2, 0, 0, 0);

/** 공격자 흉내 — 잠금이 풀리는 순간마다 한 번씩 틀린다. 그 동안 몇 번 시도했나 */
function attemptsWithin(ms: number): number {
  let row: Row | undefined;
  let now = T0;
  let tries = 0;
  while (now - T0 < ms) {
    if (row?.lockedUntil && row.lockedUntil.getTime() > now) {
      now = row.lockedUntil.getTime();
      continue;
    }
    tries++;
    const fails = failsInWindow(row, now) + 1;
    const lock = lockMsFor(fails, 4);
    row = {
      key: 'id:x',
      fails,
      firstFailAt: fails === 1 ? new Date(now) : row!.firstFailAt,
      lockedUntil: lock === null ? null : new Date(now + lock),
    };
  }
  return tries;
}

describe('로그인 잠금', () => {
  it('두드리는 동안에는 센 것이 안 풀린다 — 첫 실패에서 창이 지나도', () => {
    // 첫 실패에서 31분 뒤, 잠금은 막 끝났다 — 예전 코드는 여기서 0으로 돌아갔다
    const row: Row = {
      key: 'id:x',
      fails: 9,
      firstFailAt: new Date(T0),
      lockedUntil: new Date(T0 + 31 * MIN),
    };
    expect(failsInWindow(row, T0 + 31 * MIN)).toBe(9);
  });

  it('마지막 실패(잠금 끝)에서 하루 조용하면 처음부터 센다', () => {
    const row: Row = {
      key: 'id:x',
      fails: 9,
      firstFailAt: new Date(T0),
      lockedUntil: new Date(T0 + HOUR),
    };
    expect(failsInWindow(row, T0 + HOUR + WINDOW_MS - 1)).toBe(9);
    expect(failsInWindow(row, T0 + HOUR + WINDOW_MS + 1)).toBe(0);
  });

  it('잠금 전의 오타는 첫 실패에서 잰다', () => {
    const row: Row = { key: 'id:x', fails: 3, firstFailAt: new Date(T0), lockedUntil: null };
    expect(failsInWindow(row, T0 + WINDOW_MS + 1)).toBe(0);
  });

  it('잠금은 4번까지 없고, 배로 늘다가 6시간에서 멈춘다', () => {
    expect(lockMsFor(4, 4)).toBeNull();
    expect(lockMsFor(5, 4)).toBe(MIN);
    expect(lockMsFor(6, 4)).toBe(2 * MIN);
    expect(lockMsFor(30, 4)).toBe(MAX_LOCK_MS);
    expect(MAX_LOCK_MS).toBe(6 * HOUR);
  });

  it('한 계정에 하루 스무 번을 못 넘고, 그다음 날부터는 하루 다섯 번 안쪽이다', () => {
    const day1 = attemptsWithin(24 * HOUR);
    const week = attemptsWithin(7 * 24 * HOUR);
    expect(day1).toBeLessThan(20);
    expect((week - day1) / 6).toBeLessThanOrEqual(5);
  });
});

describe('로그인 뒤 돌아갈 자리', () => {
  it.each([
    ['/projects', '/projects'],
    ['/receivables?cpo=SK일렉링크', '/receivables?cpo=SK일렉링크'],
    ['/projects/HB-2026-125', '/projects/HB-2026-125'],
  ])('콘솔 안 경로는 그대로 — %s', (input, out) => {
    expect(safeNextPath(input)).toBe(out);
  });

  it.each([
    [null],
    [''],
    ['//evil.example'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['/\t/evil.example'],
    ['/\n/evil.example'],
    ['evil.example'],
  ])('바깥으로 나가는 것은 첫 화면으로 — %j', (input) => {
    expect(safeNextPath(input)).toBe('/projects');
  });
});

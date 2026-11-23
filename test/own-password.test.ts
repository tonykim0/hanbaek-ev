/**
 * 내 비밀번호 바꾸기 — 규칙(lib/auth/own-password ownPasswordBlocker)과 바꾸기 전에 발급한 로그인(staleSession).
 * 2026-11-23 한백 「각 계정에서 자기 비밀번호 재설정 할 수 있도록 해줘」.
 */
import { describe, expect, it } from 'vitest';
import { ownPasswordBlocker, PASSWORD_MAX_LEN, staleSession } from '@/lib/auth/own-password';
import { PASSWORD_MIN_LEN } from '@/lib/auth/types';

const ok = { current: 'old-pass', next: 'new-pass', loginId: 'navy' };

describe('ownPasswordBlocker — 단추 이름이 되는 까닭', () => {
  it('다 맞으면 없다 · 확인 칸까지 같으면 없다', () => {
    expect(ownPasswordBlocker(ok)).toBeNull();
    expect(ownPasswordBlocker({ ...ok, again: 'new-pass' })).toBeNull();
  });

  it('빈 칸은 위에서부터 하나씩', () => {
    expect(ownPasswordBlocker({ ...ok, current: '' })).toBe('현재 비밀번호 미입력 — 변경 불가');
    expect(ownPasswordBlocker({ ...ok, next: '' })).toBe('새 비밀번호 미입력 — 변경 불가');
    expect(ownPasswordBlocker({ ...ok, again: '' })).toBe('새 비밀번호 확인 미입력 — 변경 불가');
  });

  it('길이는 계정을 만들 때와 같은 아래 끝 · 위 끝', () => {
    expect(ownPasswordBlocker({ ...ok, next: 'x'.repeat(PASSWORD_MIN_LEN - 1) })).toBe(`새 비밀번호 ${PASSWORD_MIN_LEN}자 미만 — 변경 불가`);
    expect(ownPasswordBlocker({ ...ok, next: 'x'.repeat(PASSWORD_MIN_LEN) })).toBeNull();
    expect(ownPasswordBlocker({ ...ok, next: 'x'.repeat(PASSWORD_MAX_LEN + 1) })).toBe(`새 비밀번호 ${PASSWORD_MAX_LEN}자 초과 — 변경 불가`);
  });

  it('지금과 같거나 아이디와 같으면(대소문자 상관없이) 못 바꾼다', () => {
    expect(ownPasswordBlocker({ ...ok, next: 'old-pass' })).toBe('지금과 같은 비밀번호 — 변경 불가');
    expect(ownPasswordBlocker({ ...ok, next: 'NAVY' })).toBe('아이디와 같은 비밀번호 — 변경 불가');
  });

  it('확인 칸이 다르면', () => {
    expect(ownPasswordBlocker({ ...ok, again: 'new-pas' })).toBe('새 비밀번호 확인이 다름 — 변경 불가');
  });
});

describe('staleSession — 바꾸기 전에 발급한 로그인은 받지 않는다', () => {
  const changed = new Date('2026-11-23T03:00:00.700Z');
  const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

  it('바꾼 적이 없으면 아무것도 막지 않는다', () => {
    expect(staleSession(0, null)).toBe(false);
    expect(staleSession(0, undefined)).toBe(false);
  });

  it('바꾸기 전 초의 쿠키는 막고, 바꾼 그 초 · 뒤의 쿠키는 받는다(바꾼 기기가 같은 초에 받은 새 쿠키)', () => {
    expect(staleSession(sec('2026-11-23T02:59:59Z'), changed)).toBe(true);
    expect(staleSession(sec('2026-11-23T03:00:00Z'), changed)).toBe(false);
    expect(staleSession(sec('2026-11-23T03:00:01Z'), changed)).toBe(false);
  });
});

/**
 * 로그인 뒤 돌아갈 자리 — ★우리 콘솔 안의 경로만★ 받는다 (2026-10-02 보안 점검).
 *
 * 예전에는 `/` 로 시작하는지만 봤다. 그런데 `//가짜.com` 도 `/` 로 시작한다 — 브라우저는
 * 그것을 「같은 프로토콜의 다른 사이트」로 읽고, `/\가짜.com` 도 역슬래시를 빗금으로 고쳐
 * 같은 데로 간다. 그러면 진짜 로그인 화면에서 비밀번호를 넣은 협력사를 가짜 화면
 * (「비밀번호를 다시 입력하세요」)으로 보낼 수 있다.
 *
 * 그래서 빗금 하나로 시작하고 둘째 글자가 빗금·역슬래시가 아닌 것만 통과시킨다.
 * 눈에 안 보이는 제어 문자(탭·줄바꿈 — 브라우저가 주소에서 지운다)가 섞인 것도 버린다.
 * 나머지는 전부 첫 화면(/projects)이다.
 */
export const DEFAULT_AFTER_LOGIN = '/projects';

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_LOGIN;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return DEFAULT_AFTER_LOGIN;
  if (!next.startsWith('/')) return DEFAULT_AFTER_LOGIN;
  if (next[1] === '/' || next[1] === '\\') return DEFAULT_AFTER_LOGIN;
  return next;
}

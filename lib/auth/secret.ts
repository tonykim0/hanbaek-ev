/**
 * 콘솔의 비밀 열쇠 글 — AUTH_SECRET. 세션 서명(lib/auth/session)과 메일 토큰 잠금(store/agent-mail)이 같이 쓴다.
 *
 * session.ts 에서 떼어 둔 까닭: 그 파일은 React cache · next/headers 를 끌어와 Next 밖(스크립트 · 마이그레이션 도구)에서
 * 불러오면 바로 죽는다. 저장소(lib/data)가 이 열쇠를 쓰게 되면서(2026-11-03 메일), 저장소를 부르는 스크립트가 같이 죽지 않게 갈랐다.
 */

/** 운영에서 AUTH_SECRET 이 없으면 서명 키가 없는 것이므로 기동을 막는다 */
export function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET 이 없습니다 (16자 이상). 운영에서는 필수입니다.');
  }
  return 'dev-only-insecure-secret-do-not-ship';
}

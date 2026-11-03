/**
 * 비밀 잠그기 — 콘솔이 쥔 Gmail 갱신 토큰을 DB 에 그대로 두지 않는다(migrations/0106 mail_accounts). 순수 함수다(열쇠 글을 받는다).
 *
 * AES-256-GCM 이다 — 열쇠는 AUTH_SECRET 에서 만든다(store/agent-mail 이 lib/auth/session getSecret 을 넘긴다). 그래서 DB 만 새어도
 * 메일함이 열리지 않고, 누가 잠근 글을 바꾸면 풀리지 않는다(인증 꼬리표). AUTH_SECRET 을 바꾸면 풀 수 없게 되는데 그때는
 * 「Gmail 연결」을 다시 누르면 된다 — 화면이 그렇게 말한다.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const keyOf = (secret: string) => createHash('sha256').update(`hanbaek-mail-token|${secret}`).digest();

/** v1.<iv>.<암호문>.<꼬리표> — 셋 다 base64url */
export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), enc.toString('base64url'), c.getAuthTag().toString('base64url')].join('.');
}

/** 못 풀면(열쇠가 다르거나 글이 바뀌었으면) null */
export function unseal(sealed: string, secret: string): string | null {
  const [v, iv, enc, tag] = sealed.split('.');
  if (v !== 'v1' || !iv || !enc || !tag) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

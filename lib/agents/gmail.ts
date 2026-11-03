/**
 * Gmail — 콘솔이 한백 Gmail 로 메일을 보낸다 (서버 전용 · 한백 2026-11-03 「한백 전기차 콘솔에서 직접 보내게하고싶어」).
 *
 * ★구글 로그인(OAuth)으로 붙는다★ — 한백이 「Gmail 연결」을 눌러 그 Gmail 로 「허용」하면 갱신 토큰을 받아 잠가 둔다
 * (store/agent-mail · lib/agents/secret-box). 앱 비밀번호는 쓰지 않는다 — 그 계정에서 구글이 앱 비밀번호 화면을 막았다
 * (「We couldn't verify it's you」, 평소 로그인된 브라우저에서도). 회사 메일(다음 스마트워크)은 한백의 개인 카카오계정에 묶여 있어
 * 쓰지 않는다. 클라이언트는 Google Cloud 프로젝트 hanbaek-console 의 웹 클라이언트다(GOOGLE_OAUTH_CLIENT_ID · _SECRET).
 *
 * 받는 권한은 보내기(gmail.send)와 주소 확인(openid · email)뿐이다 — 메일함을 읽지 않는다. 읽기를 붙일 때 범위를 넓혀 다시 연결한다.
 * 외부 사용자 앱이 「테스트」 상태면 갱신 토큰이 7일에 끝나므로 앱을 게시해 둔다(그래서 연결 때 「확인되지 않은 앱」 경고가 한 번 뜬다).
 * 비용 — Gmail API 는 무료다(프로젝트당 하루 8천만 단위를 넘는 쪽만 2026년 안에 과금 예고 · 보내기 한 통이 100 단위).
 * 하루에 보낼 수 있는 양은 Gmail 계정 자체의 한도(일반 계정 약 500통)가 먼저 걸린다.
 *
 * 연결은 운영 주소와 로컬에서만 시작한다 — Google Cloud 의 「승인된 리디렉션 URI」에 넣은 주소여야 구글이 돌려보낸다(프리뷰 주소는
 * 배포마다 바뀐다). 운영 DB 의 연결은 운영 주소에서, 개발 DB 의 연결은 로컬에서 따로 한다.
 */
import { createHash } from 'crypto';
import { CONSOLE_URL } from '@/lib/portal-intake';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE];
export const GMAIL_CALLBACK_PATH = '/api/agents/gmail/callback';
/** 연결을 시작한 화면으로 돌아갈 자리를 같이 싣는 쿠키 — 확인값(state)과 함께 */
export const GMAIL_STATE_COOKIE = 'hb_gmail_state';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SEND_URL = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';
const TIMEOUT_MS = 30_000;

/** 연결을 마치고 돌아갈 화면 — 에이전트 화면 안의 주소만(밖으로 내보내는 길을 열지 않는다) */
export function mailBackOf(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  return /^\/admin\/agents(?:\/[a-z0-9-]{1,40})?$/.test(v) ? v : '/admin/agents';
}

/** 돌아갈 화면에 연결 결과를 붙인다 — mail=connected · mail_error=<사람 말> */
export function withMailNote(back: string, key: 'mail' | 'mail_error', value: string): string {
  return `${back}?${new URLSearchParams({ [key]: value }).toString()}`;
}

/** 연결을 시작할 수 있는 주소 — Google Cloud 의 「승인된 리디렉션 URI」와 같은 셋 */
export function callbackOrigins(): string[] {
  return [CONSOLE_URL, 'http://localhost:3123', 'http://localhost:3000'];
}

export function oauthClient(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

const NO_CLIENT = 'Gmail 연결 설정(구글 클라이언트 ID · 보안 비밀번호)이 콘솔에 아직 없습니다.';

function clientOrThrow(): { id: string; secret: string } {
  const c = oauthClient();
  if (!c) throw new Error(NO_CLIENT);
  return c;
}

/** 구글 동의 화면 주소 — 갱신 토큰을 받으려면 offline + consent 가 둘 다 있어야 한다(다시 연결할 때도 새 토큰이 온다) */
export function gmailAuthUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

/** id_token 몸통의 주소 — 토큰 끝점에서 TLS 로 바로 받은 것이라 서명은 따로 보지 않는다(OIDC Core 3.1.3.7) */
export function emailOfIdToken(idToken: string): string | null {
  const body = idToken.split('.')[1];
  if (!body) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { email?: unknown; email_verified?: unknown };
    return typeof p.email === 'string' && p.email_verified !== false ? p.email : null;
  } catch {
    return null;
  }
}

/** 구글이 거절한 것 — status · 까닭(토큰 끝점의 error, Gmail 의 error.status) · 구글의 문장 */
export class GoogleError extends Error {
  constructor(readonly status: number, readonly code: string, detail: string) {
    super(detail);
  }
}

async function google(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* 몸이 JSON 이 아니다 — 아래에서 글 그대로 쓴다 */
  }
  if (!res.ok) {
    const err = json.error as unknown;
    const code = typeof err === 'string' ? err : typeof (err as { status?: unknown })?.status === 'string' ? (err as { status: string }).status : '';
    const detail = typeof json.error_description === 'string'
      ? json.error_description
      : typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : text;
    throw new GoogleError(res.status, code, detail.slice(0, 300));
  }
  return json;
}

/** 구글의 거절 → 단추 옆에 띄울 사람 말. 모르는 것은 [mail] 로그를 남긴다 */
export function humanGoogleError(e: unknown): Error {
  if (!(e instanceof GoogleError)) {
    if (e instanceof Error && /[가-힣]/.test(e.message)) return e;
    console.error('[mail] 구글에 닿지 못함', e);
    return new Error('구글에 닿지 못했습니다 — 잠시 뒤 다시 눌러 주세요.');
  }
  if (e.code === 'invalid_grant') {
    return new Error('Gmail 연결이 풀렸습니다(구글에서 권한을 거뒀거나 비밀번호가 바뀌었습니다) — 「Gmail 연결」을 다시 눌러 주세요.');
  }
  if (e.code === 'invalid_client' || e.code === 'unauthorized_client') {
    return new Error('Gmail 연결 설정(구글 클라이언트)이 맞지 않습니다 — 클라이언트 ID · 보안 비밀번호를 확인해 주세요.');
  }
  if ((e.status === 403 || e.status === 429) && /limit|quota/i.test(e.message)) {
    return new Error('Gmail 이 보낼 수 있는 양을 넘었다고 받지 않습니다 — 잠시 뒤(하루 한도면 내일) 다시 보내 주세요.');
  }
  if (e.status === 403) return new Error('이 Gmail 에 보내기 권한이 없습니다 — 「Gmail 연결」을 다시 누르고 메일 보내기에 체크해 주세요.');
  if (e.status === 400) return new Error(`구글이 이 메일을 받지 않았습니다 — ${e.message}`);
  console.error('[mail]', e.status, e.code, e.message);
  return new Error(`구글이 응답하지 않았습니다(${e.status}) — 잠시 뒤 다시 보내 주세요.`);
}

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };

/** 동의 뒤 받은 code → 갱신 토큰 · 연결한 주소 · 실제로 허용한 범위(구글은 범위마다 체크를 풀 수 있다) */
export async function exchangeCode(input: { code: string; redirectUri: string }): Promise<{ refreshToken: string; email: string; scopes: string[] }> {
  const client = clientOrThrow();
  let json: Record<string, unknown>;
  try {
    json = await google(TOKEN_URL, {
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({
        code: input.code, client_id: client.id, client_secret: client.secret,
        redirect_uri: input.redirectUri, grant_type: 'authorization_code',
      }),
    });
  } catch (e) {
    throw humanGoogleError(e);
  }
  const refreshToken = typeof json.refresh_token === 'string' ? json.refresh_token : '';
  const email = emailOfIdToken(typeof json.id_token === 'string' ? json.id_token : '');
  if (!refreshToken) throw new Error('구글이 갱신 토큰을 주지 않았습니다 — 「Gmail 연결」을 다시 눌러 주세요.');
  if (!email) throw new Error('연결한 Gmail 주소를 읽지 못했습니다 — 다시 연결해 주세요.');
  return { refreshToken, email, scopes: String(json.scope ?? '').split(/\s+/).filter(Boolean) };
}

/** 함수 하나가 쥔 접근 토큰 — 한 시간쯤 산다. 갱신 토큰마다(해시로) 따로 */
const access = new Map<string, { token: string; until: number }>();

async function accessTokenOf(refreshToken: string): Promise<string> {
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const hit = access.get(key);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const client = clientOrThrow();
  const json = await google(TOKEN_URL, {
    method: 'POST',
    headers: FORM,
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: client.id, client_secret: client.secret, grant_type: 'refresh_token',
    }),
  });
  const token = typeof json.access_token === 'string' ? json.access_token : '';
  if (!token) throw new Error('구글이 접근 토큰을 주지 않았습니다 — 잠시 뒤 다시 보내 주세요.');
  const secs = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  access.set(key, { token, until: Date.now() + secs * 1000 });
  return token;
}

/** 지은 메일(lib/agents/mime buildMime)을 그 계정으로 보낸다 — 실패는 사람 말로 던진다 */
export async function sendMime(input: { refreshToken: string; mime: string }): Promise<{ id: string; threadId: string | null }> {
  try {
    const token = await accessTokenOf(input.refreshToken);
    const json = await google(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' },
      body: input.mime,
    });
    const id = typeof json.id === 'string' ? json.id : '';
    if (!id) throw new Error('구글이 보냈다는 표시를 주지 않았습니다 — Gmail 보낸편지함을 확인해 주세요.');
    return { id, threadId: typeof json.threadId === 'string' ? json.threadId : null };
  } catch (e) {
    throw humanGoogleError(e);
  }
}

/** 연결을 끊을 때 구글에도 토큰을 거두라고 알린다 — 실패해도 끊기는 끊긴다(로그만) */
export async function revokeToken(token: string): Promise<void> {
  try {
    await google(REVOKE_URL, { method: 'POST', headers: FORM, body: new URLSearchParams({ token }) });
  } catch (e) {
    console.error('[mail] 토큰 취소 실패', e instanceof GoogleError ? `${e.status} ${e.code}` : e);
  }
}

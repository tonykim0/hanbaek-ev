/**
 * 한백의 아지트 로그인 — 콘솔이 쥘 쿠키를 고르고, 언제 풀리는지 센다. [순수]
 * (한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — 정산 담당이 한백의 아지트 계정으로 열린구매 글을 올린다. 11-09 의 봇(웹훅) 글은
 *  한백이 고칠 수 없고 파일을 못 붙였고, 그 뒤의 Claude Code 길은 한백이 콘솔 밖으로 나가야 했다)
 *
 * 아지트 로그인은 쿠키 몇 개다(2026-11-10 전용 크롬 프로필에서 이름 · 만료만 읽어 봤다 — 값은 읽지 않았다):
 *   team-hanbaek.agit.io  _venice_webapp2_session   세션(브라우저를 닫으면 사라진다)
 *   .team-hanbaek.agit.io _uac_v1                   HttpOnly · 로그인부터 92일 — 이것이 로그인을 쥔다고 본다
 *   .agit.io              buid · _kpl               브라우저 표지(13달) · 92일
 *   .agit.io              _ga · _gid                구글 분석
 * 그래서 로그인은 석 달쯤 간다 — _uac_v1 이 끝나는 때를 「로그인 유지」 날로 보인다. 어느 쿠키가 로그인인지 아지트가 말해 주지
 * 않으므로 분석 쿠키만 버리고 나머지를 다 쥔다(브라우저가 보내던 그대로 보낸다).
 * ★비밀번호는 쥐지 않는다★ — 연결할 때 서버 브라우저가 로그인 화면에 한 번 넣고 버린다(lib/agit/agit-web agitLogin).
 */

/** 아지트 쿠키 하나 — 서버 브라우저에 다시 심을 만큼만 */
export interface AgitCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  /** 끝나는 때(unix 초) — 세션 쿠키면 -1 */
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** 우리 팀 아지트 — 로그인 화면 · 쓰는 칸이 다 여기다 */
export const AGIT_TEAM_ORIGIN = 'https://team-hanbaek.agit.io';
/** 로그인을 쥐는 쿠키 — 이것이 끝나는 때가 다시 연결할 때다 */
export const AGIT_LOGIN_COOKIE = '_uac_v1';

/** 분석 쿠키 — 쥐지 않는다 */
const ANALYTICS_RE = /^(_ga|_gid|_gat|_gcl|_fbp)/;

/** 브라우저가 돌려준 쿠키(puppeteer Cookie 꼴)에서 아지트 것만 — 분석 쿠키는 버린다 */
export function agitCookiesOf(all: ReadonlyArray<{
  name: string; value: string; domain: string; path?: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string;
}>): AgitCookie[] {
  return all
    .filter((c) => /(^|\.)agit\.io$/.test(c.domain.replace(/^\./, '')) && !ANALYTICS_RE.test(c.name) && c.value !== '')
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: typeof c.expires === 'number' && c.expires > 0 ? Math.floor(c.expires) : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      ...(c.sameSite === 'Strict' || c.sameSite === 'Lax' || c.sameSite === 'None' ? { sameSite: c.sameSite } : {}),
    }));
}

/** 로그인이 풀리는 때 — 로그인 쿠키(_uac_v1)의 만료. 그 쿠키가 없으면 null(로그인이 안 됐다) */
export function agitSessionUntil(cookies: readonly AgitCookie[]): Date | null {
  const login = cookies.find((c) => c.name === AGIT_LOGIN_COOKIE);
  if (!login) return null;
  /* 세션 쿠키로 왔으면 끝나는 날을 모른다 — 하루로 본다(그 뒤 올릴 때 풀렸으면 그때 다시 연결) */
  return login.expires > 0 ? new Date(login.expires * 1000) : new Date(Date.now() + 24 * 3600_000);
}

/** 서버 브라우저에 다시 심는 꼴 — 세션 쿠키는 만료를 빼고 */
export function cookieParamsOf(cookies: readonly AgitCookie[]): Array<Omit<AgitCookie, 'expires'> & { expires?: number }> {
  return cookies.map(({ expires, ...c }) => (expires > 0 ? { ...c, expires } : c));
}

/**
 * 올린 뒤 브라우저의 쿠키로 쥔 것을 새로 — 아지트가 바꿔 준 것(세션 · _kpl 따위)은 새 값, 안 준 것은 그대로.
 * 새 쿠키에 로그인 쿠키가 없으면(로그인이 풀린 채 끝났으면) 쥔 것을 그대로 둔다.
 */
export function mergeAgitCookies(held: readonly AgitCookie[], fresh: readonly AgitCookie[]): AgitCookie[] {
  if (!fresh.some((c) => c.name === AGIT_LOGIN_COOKIE)) return [...held];
  const key = (c: AgitCookie) => `${c.domain}|${c.path}|${c.name}`;
  const out = new Map(held.map((c) => [key(c), c]));
  for (const c of fresh) out.set(key(c), c);
  return [...out.values()];
}

/** 아지트 ID(영문 · 숫자 · 점 20자) 또는 이메일 — 로그인 화면의 「이메일 또는 아지트ID」. 아니면 null */
export function agitLoginOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/^@+/, '');
  if (/^[A-Za-z0-9.]{1,20}$/.test(v)) return v;
  if (v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v;
  return null;
}

/** 로그인 화면에 넣을 비밀번호 — 비었거나 너무 길면 null(그대로 넣는다 — 앞뒤 빈칸도 비밀번호일 수 있다) */
export function agitPasswordOf(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 200 ? raw : null;
}

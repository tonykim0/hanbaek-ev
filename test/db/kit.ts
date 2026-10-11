/**
 * 경계 시험 도구.
 *
 *   signIn(USERS.daesang)          그 계정의 세션 쿠키를 넣는다(개발 시드 계정 다섯 — users 표에 있어야 한다)
 *   withProject(async (id) => …)   시험 현장을 만들고 끝나면 지운다 — 이름에 실행 표지가 있다
 *   call(POST, { body, params })   라우트 핸들러를 함수로 부른다 — Next 없이. 결과는 { status, json }
 *
 * 현장 id 는 HB-2026-NNN 순번을 소비한다 — 개발 DB 라 상관없다.
 */
import type { IntakeDraft } from '@/types/project';
import type { Actor, User, Viewer } from '@/lib/auth/types';
import { SESSION_COOKIE } from '@/lib/auth/types';
import { createSessionToken } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { batchFinals, payoutEntries, taxInvoices } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { jar } from './cookie-jar';

/** 개발 시드 계정(lib/auth/users.ts DEV_USERS 와 같다 — 비밀번호는 안 쓴다, 쿠키를 직접 만든다) */
export const USERS = {
  admin: { id: 'admin', name: '한백 관리자', role: 'admin', org: null },
  viewer: { id: 'viewer', name: '한백 열람', role: 'viewer', org: null },
  ecoelec: { id: 'ecoelec', name: '에코일렉 김현수', role: 'salesCons', org: '에코일렉' },
  daesang: { id: 'daesang', name: '대상전력 박지훈', role: 'cons', org: '대상전력' },
  navy: { id: 'navy', name: '네이비인프라 이수정', role: 'sales', org: '네이비인프라' },
} as const satisfies Record<string, User>;

export const actorOf = (u: User): Actor => ({ id: u.id, name: u.name, role: u.role, org: u.org });
export const viewerOf = (u: User): Viewer => ({ role: u.role, org: u.org });

export async function signIn(u: User): Promise<void> {
  jar.set(SESSION_COOKIE, await createSessionToken(u));
}
/** 관리자가 협력사 계정으로 대행하는 세션 — getSessionUser 가 id·role·org 를 그 계정으로 바꾸고 via 에 본인을 남긴다 */
export async function signInAs(adminUser: User, asId: string): Promise<void> {
  jar.set(SESSION_COOKIE, await createSessionToken(adminUser, asId));
}
export function signOut(): void {
  jar.clear();
}

/** 이 실행의 표지 — 시험 현장 이름에 박는다. 앞은 시각(36진수)이라 지난 실행의 찌꺼기를 가려낼 수 있다. */
export const RUN = `${Date.now().toString(36)}-${process.pid}`;
const FIXTURE_RE = /^\[시험 ([0-9a-z]+)-\d+\]/;

export function draft(over: Partial<IntakeDraft> = {}): IntakeDraft {
  return {
    cpo: '플러그링크',
    salesOrg: USERS.navy.org,     // 영업사 = 네이비인프라
    gcOrg: USERS.daesang.org,     // 시공사 = 대상전력  (에코일렉은 붙지 않은 남의 회사)
    name: `[시험 ${RUN}] 현장`,
    addr: null, bldgType: '공동주택', contractParty: null, parkTotal: null,
    mgr: null, tel: null, mail: null,
    preInstall: '없음', preNote: null,
    powerType: null, replType: null, bizType: '자체투자', note: null,
    lines: [{ termYears: 5, qty: 2, powerType: null, replType: null, memo: null }],
    documents: [],
    ...over,
  };
}

export async function withProject<T>(fn: (id: string) => Promise<T>, over: Partial<IntakeDraft> = {}): Promise<T> {
  const repo = getRepository();
  const admin = actorOf(USERS.admin);
  const id = await repo.createProject(draft(over), admin);
  try {
    return await fn(id);
  } finally {
    await dropFixture(id).catch(() => undefined);
  }
}

/**
 * 시험 현장을 지운다 — ★지급 원장이 달린 것까지★.
 *
 * 저장소의 deleteProject 는 원장 줄이 하나라도 있으면 거절한다(돈이 오간 현장 — 2026-09-16 실사고 뒤의 문, 프로덕션에서는
 * 맞다). 그래서 지급을 걷는 시험(money-kit · delete-guard)의 현장은 끝나도 안 지워져 개발 DB 에 쌓였다 — 2026-10-11 에
 * 92건이었다(CLAUDE.md 「다음 할 일」 0-1). 시험은 그 줄을 먼저 걷고 지운다 — 개발 DB 에서만(setup 이 프로젝트 ref 를 본다).
 */
export async function dropFixture(id: string): Promise<void> {
  await getDb().delete(payoutEntries).where(eq(payoutEntries.projectId, id));
  await getRepository().deleteProject(id, actorOf(USERS.admin));
}

/** 시험 지급처(money-kit 의 「시험영업사-<run>-n」·「시험시공사-<run>」)의 표지 시각 — 아니면 null */
const TEST_ORG_RE = /^시험(영업사|시공사)-([0-9a-z]+)-\d+/;
const staleRun = (run: string) => {
  const at = parseInt(run, 36);
  return !Number.isNaN(at) && Date.now() - at >= 60 * 60 * 1000;
};

/**
 * 죽은 실행이 남긴 시험 현장을 지운다 — 표지의 시각이 한 시간 넘은 것만(지금 도는 다른 실행의 것은 둔다).
 * 현장에 안 매달린 지급처 단위의 표(최종 확정·세금계산서)도 시험 지급처 것은 같이 걷는다 — 현장을 지워도 안 지워진다.
 */
export async function sweepStaleFixtures(): Promise<number> {
  const repo = getRepository();
  const all = await repo.listProjects(viewerOf(USERS.admin));
  let n = 0;
  for (const p of all) {
    const m = FIXTURE_RE.exec(p.name);
    if (!m || !staleRun(m[1])) continue;
    await dropFixture(p.id).then(() => { n++; }, () => undefined);
  }
  const db = getDb();
  for (const table of [batchFinals, taxInvoices]) {
    const orgs = [...new Set((await db.select({ org: table.org }).from(table)).map((r) => r.org))]
      .filter((o) => { const m = TEST_ORG_RE.exec(o); return !!m && staleRun(m[2]); });
    if (orgs.length > 0) await db.delete(table).where(inArray(table.org, orgs));
  }
  return n;
}

type Handler<P> = (request: Request, ctx: { params: P }) => Promise<Response>;

export async function call<P extends Record<string, string>>(
  handler: Handler<P>,
  opts: { method?: string; body?: unknown; rawBody?: string; params?: P } = {}
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  const request = new Request('http://test.local/api', {
    method: opts.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const res = await handler(request, { params: (opts.params ?? {}) as P });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* 본문이 JSON 이 아니다 */ }
  return { status: res.status, json };
}

/**
 * 에이전트 메일의 문 — 초안 · 고치기 · 버리기 · 「승인하고 보내기」 · Gmail 연결 (store/agent-mail · app/api/agents/*mail*).
 *
 * ★메일은 한백이 승인해야 나간다★ — 여기서 보는 것: 협력사 · 열람 전용은 못 건드린다 · 연결 전에는 안 나간다 · 한 번만 나간다
 * (두 번 누르거나 같이 눌러도) · 구글이 거절하면 「보내지 못함」으로 남고 다시 보낼 수 있다 · 나간 메일은 주간 기록에 선다 ·
 * 연결은 확인값이 맞아야 붙고 토큰은 잠겨 들어간다. 구글은 fetch 를 흉내 낸다 — 진짜로 나가지 않는다.
 *
 * 개발 DB 의 연결 한 줄(mail_accounts 'gmail')은 한백이 로컬에서 붙여 둔 진짜일 수 있다 — 시험 전에 떠 두고 끝나면 그대로 되돌린다.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, like, or } from 'drizzle-orm';
import { PATCH as patchMail } from '@/app/api/agents/[id]/mails/[mailId]/route';
import { POST as sendMail } from '@/app/api/agents/[id]/mails/[mailId]/send/route';
import { DELETE as disconnect } from '@/app/api/agents/gmail/route';
import { GET as connect } from '@/app/api/agents/gmail/connect/route';
import { GET as callback } from '@/app/api/agents/gmail/callback/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMails, auditLog, mailAccounts } from '@/lib/db/schema';
import { getSecret } from '@/lib/auth/secret';
import { unseal } from '@/lib/agents/secret-box';
import { GMAIL_STATE_COOKIE } from '@/lib/agents/gmail';
import { mondayOf } from '@/lib/agents/weeks';
import { today } from '@/lib/date';
import { jar } from './cookie-jar';
import { RUN, USERS, actorOf, call, signIn } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const AGENT = 'settlement';
const mark = `[시험 ${RUN}]`;
const SENDER = `sender-${RUN}@example.com`;

let saved: typeof mailAccounts.$inferSelect | undefined;
const env = { id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };

beforeAll(async () => {
  [saved] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, 'gmail'));
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
});

afterAll(async () => {
  const db = getDb();
  await db.delete(agentMails).where(like(agentMails.subject, `%${RUN}%`));
  await db.delete(mailAccounts).where(eq(mailAccounts.id, 'gmail'));
  if (saved) await db.insert(mailAccounts).values(saved);
  await db.delete(auditLog).where(and(
    or(like(auditLog.action, '에이전트 메일%'), like(auditLog.action, '메일 계정%')),
    or(like(auditLog.newValue, `%${RUN}%`), like(auditLog.oldValue, `%${RUN}%`)),
  ));
  process.env.GOOGLE_OAUTH_CLIENT_ID = env.id;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = env.secret;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 구글 흉내 — 토큰 끝점과 보내기 끝점만 받는다. 보낸 메일 글을 모아 둔다 */
function fakeGoogle(opts: { send?: () => Response; token?: () => Response } = {}) {
  const sent: string[] = [];
  const real = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return opts.token?.() ?? Response.json({ access_token: `at-${RUN}`, expires_in: 3600 });
    }
    if (url.startsWith('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send')) {
      sent.push(String(init?.body ?? ''));
      await new Promise((r) => setTimeout(r, 50)); // 같이 누른 쪽이 그사이에 들어오게
      return opts.send?.() ?? Response.json({ id: `gm-${RUN}-${sent.length}`, threadId: `th-${RUN}` });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return new Response('{}');
    return real(input, init);
  });
  return { sent, spy };
}

/** 시험용 연결 — 갱신 토큰을 갈면 함수가 쥔 접근 토큰(lib/agents/gmail)도 새로 받는다 */
async function connectFake(token = `rt-${RUN}`): Promise<void> {
  await repo.saveMailAccount({ email: SENDER, refreshToken: token, scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'] }, admin);
}

/** 돌려보낸 주소의 연결 결과 */
const noteOf = (res: Response) => new URL(res.headers.get('location') ?? 'http://x').searchParams.get('mail_error') ?? '';

async function draft(over: Partial<{ to: unknown; subject: string }> = {}): Promise<string> {
  const made = await repo.addAgentMail({
    agentId: AGENT, to: over.to ?? 'ops@example.com', cc: 'boss@example.com',
    subject: over.subject ?? `${mark} 11월 기성 청구`, body: '안녕하세요, 한백입니다.\n청구서를 보내드립니다.',
  }, admin);
  return made.id;
}

const ref = (mailId: string) => ({ id: AGENT, mailId });

describe('초안 — 누가 · 무엇을', () => {
  it('협력사 · 열람 전용은 고치지도 보내지도 못한다(403) · 저장소도 관리자만', async () => {
    const id = await draft();
    for (const u of [USERS.ecoelec, USERS.viewer]) {
      await signIn(u);
      expect((await call(patchMail, { method: 'PATCH', body: { action: 'discard' }, params: ref(id) })).status, u.id).toBe(403);
      expect((await call(sendMail, { params: ref(id) })).status, u.id).toBe(403);
      expect((await call(disconnect, { method: 'DELETE' })).status, u.id).toBe(403);
    }
    await expect(repo.addAgentMail({ agentId: AGENT, to: 'a@b.co', subject: 'x', body: 'y' }, actorOf(USERS.viewer))).rejects.toThrow('한백 관리자만');
    await expect(repo.mailCredential(actorOf(USERS.ecoelec))).rejects.toThrow('한백 관리자만');
  });

  it('틀린 주소 · 빈 제목 · 남의 파일은 받지 않는다', async () => {
    await expect(draft({ to: '홍길동' })).rejects.toThrow('받는 사람 주소가 틀렸습니다: 홍길동');
    await expect(draft({ to: '' })).rejects.toThrow('받는 사람을 적어주세요.');
    await expect(draft({ subject: '  ' })).rejects.toThrow('제목을 적어주세요.');
    await expect(repo.addAgentMail({
      agentId: AGENT, to: 'a@b.co', subject: `${mark} x`, body: 'y', fileIds: ['no-such-file'],
    }, admin)).rejects.toThrow('이 담당에게 넘긴 파일만');
  });

  it('고치고 · 버리고 · 되살린다 — 버린 것은 고치지 못한다', async () => {
    await signIn(USERS.admin);
    const id = await draft();
    const fixed = await call(patchMail, {
      method: 'PATCH', params: ref(id),
      body: { action: 'edit', to: 'Ops@Example.com, new@example.com', cc: 'ops@example.com', subject: `${mark} 고친 제목`, body: '고친 본문' },
    });
    expect(fixed.status).toBe(200);
    const mail = fixed.json?.mail as { to: string[]; cc: string[]; subject: string };
    expect(mail.to).toEqual(['Ops@Example.com', 'new@example.com']);
    expect(mail.cc).toEqual([]); // 받는 사람에 이미 있는 주소는 참조에서 뺀다
    expect(mail.subject).toBe(`${mark} 고친 제목`);

    expect((await call(patchMail, { method: 'PATCH', params: ref(id), body: { action: 'discard' } })).status).toBe(200);
    const blocked = await call(patchMail, { method: 'PATCH', params: ref(id), body: { action: 'edit', to: 'a@b.co', subject: 'x', body: 'y' } });
    expect(blocked.status).toBe(422);
    expect(blocked.json?.error).toBe('버린 메일입니다 — 되살린 뒤 고쳐 주세요.');
    expect((await call(sendMail, { params: ref(id) })).status).toBe(422);
    const back = await call(patchMail, { method: 'PATCH', params: ref(id), body: { action: 'restore' } });
    expect((back.json?.mail as { status: string }).status).toBe('draft');
    expect((await call(patchMail, { method: 'PATCH', params: ref(id), body: {} })).status).toBe(400);
  });
});

describe('승인하고 보내기', () => {
  it('Gmail 연결 전에는 나가지 않는다 — 초안은 그대로', async () => {
    await getDb().delete(mailAccounts).where(eq(mailAccounts.id, 'gmail'));
    await signIn(USERS.admin);
    const id = await draft();
    const r = await call(sendMail, { params: ref(id) });
    expect(r.status).toBe(422);
    expect(r.json?.error).toContain('Gmail 연결 전');
    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.status).toBe('draft');
  });

  it('연결하면 나간다 — 한 번만, 메일 글에 받는 사람 · 참조 · 제목이 실리고, 보냄이 주간 기록에 선다', async () => {
    await connectFake();
    const g = fakeGoogle();
    await signIn(USERS.admin);
    const id = await draft();
    const r = await call(sendMail, { params: ref(id) });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const mail = r.json?.mail as { status: string; from: string; sentBy: string };
    expect(mail.status).toBe('sent');
    expect(mail.from).toBe(SENDER);
    expect(mail.sentBy).toBe(USERS.admin.name);
    expect(g.sent).toHaveLength(1);
    expect(g.sent[0]).toContain('To: ops@example.com');
    expect(g.sent[0]).toContain('Cc: boss@example.com');
    expect(g.sent[0]).toContain(`<${SENDER}>`);

    const again = await call(sendMail, { params: ref(id) });
    expect(again.status).toBe(422);
    expect(again.json?.error).toBe('이미 보낸 메일입니다.');
    expect(g.sent).toHaveLength(1);

    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.gmailId).toBe(`gm-${RUN}-1`);
    const week = await repo.getAgent(AGENT, admin, { week: mondayOf(today()) });
    expect(week.weeks.find((w) => w.start === mondayOf(today()))?.mails).toBeGreaterThanOrEqual(1);
    expect(week.week?.events.some((e) => e.kind === 'mail-sent' && e.title.includes(`${mark} 11월 기성 청구`))).toBe(true);
  });

  it('두 창에서 같이 눌러도 한 통만 나간다', async () => {
    await connectFake();
    const g = fakeGoogle();
    await signIn(USERS.admin);
    const id = await draft({ subject: `${mark} 같이 누름` });
    const [a, b] = await Promise.all([call(sendMail, { params: ref(id) }), call(sendMail, { params: ref(id) })]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
    expect(g.sent).toHaveLength(1);
  });

  it('구글이 거절하면 「보내지 못함」으로 남고 까닭이 단추 옆에 — 고쳐서 다시 보내면 나간다', async () => {
    await connectFake();
    await signIn(USERS.admin);
    const id = await draft({ subject: `${mark} 거절` });
    fakeGoogle({
      send: () => Response.json({ error: { code: 400, message: 'Invalid To header', status: 'INVALID_ARGUMENT' } }, { status: 400 }),
    });
    const r = await call(sendMail, { params: ref(id) });
    expect(r.status).toBe(422);
    expect(r.json?.error).toBe('구글이 이 메일을 받지 않았습니다 — Invalid To header');
    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.status).toBe('failed');
    expect(row.error).toBe('구글이 이 메일을 받지 않았습니다 — Invalid To header');

    vi.restoreAllMocks();
    const g = fakeGoogle();
    const retry = await call(sendMail, { params: ref(id) });
    expect(retry.status).toBe(200);
    expect(g.sent).toHaveLength(1);
  });

  it('구글에서 권한이 풀렸으면 다시 연결하라고 말한다', async () => {
    await connectFake(`rt-${RUN}-revoked`);
    await signIn(USERS.admin);
    const id = await draft({ subject: `${mark} 권한 풀림` });
    fakeGoogle({ token: () => Response.json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, { status: 400 }) });
    const r = await call(sendMail, { params: ref(id) });
    expect(r.status).toBe(422);
    expect(r.json?.error).toContain('「Gmail 연결」을 다시');
  });
});

describe('Gmail 연결', () => {
  const get = (url: string) => new Request(url, { method: 'GET' });

  it('운영 주소 · 로컬이 아니면 시작하지 않는다 · 로컬이면 구글로 보내고 확인값을 쿠키에 둔다', async () => {
    await signIn(USERS.admin);
    const off = await connect(get('http://preview.example.com/api/agents/gmail/connect?back=/admin/agents/settlement'));
    expect(off.status).toBe(307);
    expect(noteOf(off)).toContain('운영 주소');

    const on = await connect(get('http://localhost:3123/api/agents/gmail/connect?back=https://evil.com'));
    const to = new URL(on.headers.get('location') ?? '');
    expect(to.host).toBe('accounts.google.com');
    expect(to.searchParams.get('redirect_uri')).toBe('http://localhost:3123/api/agents/gmail/callback');
    const cookie = on.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${GMAIL_STATE_COOKIE}=${to.searchParams.get('state')}`);
    expect(decodeURIComponent(cookie)).toContain('|/admin/agents;'); // 밖의 주소는 돌아갈 곳이 되지 못한다

    jar.delete(GMAIL_STATE_COOKIE);
    await signIn(USERS.ecoelec);
    const partner = await connect(get('http://localhost:3123/api/agents/gmail/connect'));
    expect(partner.headers.get('location')).toContain('/login');
  });

  it('확인값이 다르면 붙이지 않는다 · 맞으면 토큰을 잠가 넣고 돌아간다 · 보내기를 빼고 허용했으면 거절', async () => {
    await getDb().delete(mailAccounts).where(eq(mailAccounts.id, 'gmail'));
    await signIn(USERS.admin);
    const idToken = `h.${Buffer.from(JSON.stringify({ email: SENDER, email_verified: true })).toString('base64url')}.s`;

    jar.set(GMAIL_STATE_COOKIE, 'right-state|/admin/agents/settlement');
    const wrong = await callback(get('http://localhost:3123/api/agents/gmail/callback?state=other&code=c1'));
    expect(noteOf(wrong)).toContain('확인값이 맞지 않습니다');
    expect(await repo.getMailAccount(admin)).toBeNull();

    let scope = 'openid email';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      Response.json({ refresh_token: `rt-${RUN}-cb`, id_token: idToken, scope, access_token: 'x', expires_in: 3600 }));
    jar.set(GMAIL_STATE_COOKIE, 'right-state|/admin/agents/settlement');
    const noSend = await callback(get('http://localhost:3123/api/agents/gmail/callback?state=right-state&code=c1'));
    expect(noteOf(noSend)).toContain('메일 보내기」에 체크');
    expect(await repo.getMailAccount(admin)).toBeNull();

    scope = 'openid email https://www.googleapis.com/auth/gmail.send';
    jar.set(GMAIL_STATE_COOKIE, 'right-state|/admin/agents/settlement');
    const ok = await callback(get('http://localhost:3123/api/agents/gmail/callback?state=right-state&code=c1'));
    expect(ok.headers.get('location')).toBe('http://localhost:3123/admin/agents/settlement?mail=connected');
    expect((await repo.getMailAccount(admin))?.email).toBe(SENDER);
    const [row] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, 'gmail'));
    expect(row.token).not.toContain(`rt-${RUN}-cb`);
    expect(unseal(row.token, getSecret())).toBe(`rt-${RUN}-cb`);
  });

  it('끊으면 줄이 사라지고 구글에 거두라고 알린다 — 초안은 남는다', async () => {
    await connectFake();
    const g = fakeGoogle();
    await signIn(USERS.admin);
    const id = await draft({ subject: `${mark} 끊은 뒤` });
    expect((await call(disconnect, { method: 'DELETE' })).status).toBe(200);
    expect(await repo.getMailAccount(admin)).toBeNull();
    expect(g.spy.mock.calls.some(([u]) => String(u).startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true);
    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.status).toBe('draft');
  });
});

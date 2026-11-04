/**
 * 에이전트 메일의 문 — 초안 · 고치기 · 버리기 · 「승인하고 보내기」 · 보내는 메일 연결 (store/agent-mail · app/api/agents/*mail*).
 *
 * ★메일은 한백이 승인해야 나간다★ — 여기서 보는 것: 협력사 · 열람 전용은 못 건드린다 · 연결 전에는 안 나간다 · 한 번만 나간다
 * (두 번 누르거나 같이 눌러도) · 서버가 거절하면 「보내지 못함」으로 남고 다시 보낼 수 있다 · 나간 메일은 주간 기록에 선다 ·
 * 연결은 로그인해 본 뒤에만 저장되고 앱 비밀번호는 잠겨 들어간다. 메일 서버(lib/agents/smtp)는 흉내 낸다 — 진짜로 나가지 않는다
 * (서버와 말하는 쪽은 test/agents-smtp.test.ts 가 가짜 서버로 본다).
 *
 * 개발 DB 의 연결 한 줄(mail_accounts 'mail')은 한백이 로컬에서 붙여 둔 진짜일 수 있다 — 시험 전에 떠 두고 끝나면 그대로 되돌린다.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, like, or } from 'drizzle-orm';
import { PATCH as patchMail } from '@/app/api/agents/[id]/mails/[mailId]/route';
import { POST as sendMail } from '@/app/api/agents/[id]/mails/[mailId]/send/route';
import { DELETE as disconnect, POST as connect } from '@/app/api/agents/mail-account/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMails, auditLog, mailAccounts } from '@/lib/db/schema';
import { getSecret } from '@/lib/auth/secret';
import { unseal } from '@/lib/agents/secret-box';
import { mondayOf } from '@/lib/agents/weeks';
import { today } from '@/lib/date';
import { RUN, USERS, actorOf, call, signIn } from './kit';

/* 메일 서버 흉내 — 로그인해 보기와 보내기만 바꿔 끼운다(사람 말로 바꾸는 쪽은 진짜를 쓴다) */
const smtp = vi.hoisted(() => ({
  verify: vi.fn(async (_who: { user: string; pass: string }) => undefined),
  send: vi.fn(async (_m: { user: string; pass: string; from: string; to: string[]; data: string }) => ({ id: '250 2.0.0 OK queued' })),
}));
vi.mock('@/lib/agents/smtp', async (orig) => ({
  ...(await orig<typeof import('@/lib/agents/smtp')>()),
  verifySmtp: smtp.verify,
  sendSmtp: smtp.send,
}));

const repo = getRepository();
const admin = actorOf(USERS.admin);
const AGENT = 'settlement';
const mark = `[시험 ${RUN}]`;
const SENDER = `sender-${RUN}@example.com`;

let saved: typeof mailAccounts.$inferSelect | undefined;
/* 태양광의 연결 한 줄(mail_accounts 'mail-solar') — 같은 까닭으로 떠 두고 되돌린다 */
let savedSolar: typeof mailAccounts.$inferSelect | undefined;

beforeAll(async () => {
  [saved] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, 'mail'));
  [savedSolar] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, 'mail-solar'));
});

afterAll(async () => {
  const db = getDb();
  await db.delete(agentMails).where(like(agentMails.subject, `%${RUN}%`));
  await db.delete(mailAccounts).where(eq(mailAccounts.id, 'mail'));
  if (saved) await db.insert(mailAccounts).values(saved);
  await db.delete(mailAccounts).where(eq(mailAccounts.id, 'mail-solar'));
  if (savedSolar) await db.insert(mailAccounts).values(savedSolar);
  await db.delete(auditLog).where(and(
    or(like(auditLog.action, '에이전트 메일%'), like(auditLog.action, '메일 계정%')),
    or(like(auditLog.newValue, `%${RUN}%`), like(auditLog.oldValue, `%${RUN}%`)),
  ));
});

beforeEach(() => {
  smtp.verify.mockReset().mockImplementation(async () => undefined);
  smtp.send.mockReset().mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 50)); // 같이 누른 쪽이 그사이에 들어오게
    return { id: '250 2.0.0 OK queued' };
  });
});

async function connectFake(): Promise<void> {
  await repo.saveMailAccount({ email: SENDER, secret: `app-${RUN}`, server: 'smtp.daum.net:465' }, admin);
}

async function draft(over: Partial<{ to: unknown; subject: string }> = {}): Promise<string> {
  const made = await repo.addAgentMail({
    agentId: AGENT, to: over.to ?? 'ops@example.com', cc: 'boss@example.com',
    subject: over.subject ?? `${mark} 11월 기성 청구`, body: '안녕하세요, 한백입니다.\n청구서를 보내드립니다.',
  }, admin);
  return made.id;
}

const ref = (mailId: string) => ({ id: AGENT, mailId });

describe('초안 — 누가 · 무엇을', () => {
  it('협력사 · 열람 전용은 고치지도 보내지도 연결하지도 못한다(403) · 저장소도 관리자만', async () => {
    const id = await draft();
    for (const u of [USERS.ecoelec, USERS.viewer]) {
      await signIn(u);
      expect((await call(patchMail, { method: 'PATCH', body: { action: 'discard' }, params: ref(id) })).status, u.id).toBe(403);
      expect((await call(sendMail, { params: ref(id) })).status, u.id).toBe(403);
      expect((await call(connect, { body: { email: SENDER, password: 'x' } })).status, u.id).toBe(403);
      expect((await call(disconnect, { method: 'DELETE' })).status, u.id).toBe(403);
    }
    expect(smtp.verify).not.toHaveBeenCalled();
    await expect(repo.addAgentMail({ agentId: AGENT, to: 'a@b.co', subject: 'x', body: 'y' }, actorOf(USERS.viewer))).rejects.toThrow('한백 관리자만');
    await expect(repo.mailCredential(actorOf(USERS.ecoelec), AGENT)).rejects.toThrow('한백 관리자만');
  });

  it('틀린 주소 · 빈 제목 · 남의 파일은 받지 않는다', async () => {
    await expect(draft({ to: '홍길동' })).rejects.toThrow('받는 사람 주소가 틀렸습니다: 홍길동');
    await expect(draft({ to: '' })).rejects.toThrow('받는 사람을 적어주세요.');
    await expect(draft({ subject: '  ' })).rejects.toThrow('제목을 적어주세요.');
    await expect(repo.addAgentMail({
      agentId: AGENT, to: 'a@b.co', subject: `${mark} x`, body: 'y', fileIds: ['no-such-file'],
    }, admin)).rejects.toThrow('이 담당에게 넘긴 파일만');
  });

  it('고치고 · 버리고 · 되살린다 — 버린 것은 고치지도 보내지도 못한다', async () => {
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
    const back = await call(patchMail, { method: 'PATCH', params: ref(id), body: { action: 'restore' } });
    expect((back.json?.mail as { status: string }).status).toBe('draft');
    expect((await call(patchMail, { method: 'PATCH', params: ref(id), body: {} })).status).toBe(400);
  });
});

describe('보내는 메일 연결', () => {
  it('로그인해 보고 되면 앱 비밀번호를 잠가 저장한다 — 띄어 쓴 비밀번호는 붙인다', async () => {
    await getDb().delete(mailAccounts).where(eq(mailAccounts.id, 'mail'));
    await signIn(USERS.admin);
    const r = await call(connect, { body: { email: SENDER, password: 'abcd efgh ijkl' } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(smtp.verify).toHaveBeenCalledWith({ user: SENDER, pass: 'abcdefghijkl' });
    expect((r.json?.account as { email: string }).email).toBe(SENDER);
    const [row] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, 'mail'));
    expect(row.server).toBe('smtp.daum.net:465');
    expect(row.token).not.toContain('abcdefghijkl');
    expect(unseal(row.token, getSecret())).toBe('abcdefghijkl');
  });

  it('로그인이 안 되면 그 까닭을 띄우고 아무것도 저장하지 않는다 · 주소가 틀리면 묻지도 않는다', async () => {
    await getDb().delete(mailAccounts).where(eq(mailAccounts.id, 'mail'));
    await signIn(USERS.admin);
    smtp.verify.mockRejectedValueOnce(new Error('메일 로그인이 거절됐습니다 — 주소와 앱 비밀번호를 확인해 주세요.'));
    const r = await call(connect, { body: { email: SENDER, password: 'wrong' } });
    expect(r.status).toBe(422);
    expect(r.json?.error).toContain('메일 로그인이 거절됐습니다');
    expect(await repo.getMailAccount(admin)).toBeNull();

    const bad = await call(connect, { body: { email: '한백', password: 'x' } });
    expect(bad.status).toBe(422);
    expect(bad.json?.error).toBe('메일 주소가 틀렸습니다: 한백');
    expect((await call(connect, { body: { email: SENDER, password: '  ' } })).json?.error).toBe('앱 비밀번호를 적어주세요.');
    expect((await call(connect, { body: { email: SENDER } })).status).toBe(400);
    expect(smtp.verify).toHaveBeenCalledTimes(1);
  });
});

describe('승인하고 보내기', () => {
  it('메일 연결 전에는 나가지 않는다 — 초안은 그대로', async () => {
    await getDb().delete(mailAccounts).where(eq(mailAccounts.id, 'mail'));
    await signIn(USERS.admin);
    const id = await draft();
    const r = await call(sendMail, { params: ref(id) });
    expect(r.status).toBe(422);
    expect(r.json?.error).toContain('메일 연결 전');
    expect(smtp.send).not.toHaveBeenCalled();
    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.status).toBe('draft');
  });

  it('연결하면 나간다 — 한 번만, 받는 사람과 참조 모두에게 연결한 주소로, 보냄이 주간 기록에 선다', async () => {
    await connectFake();
    await signIn(USERS.admin);
    const id = await draft();
    const r = await call(sendMail, { params: ref(id) });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const mail = r.json?.mail as { status: string; from: string; sentBy: string };
    expect(mail.status).toBe('sent');
    expect(mail.from).toBe(SENDER);
    expect(mail.sentBy).toBe(USERS.admin.name);
    expect(smtp.send).toHaveBeenCalledTimes(1);
    const m = smtp.send.mock.calls[0][0];
    expect(m.user).toBe(SENDER);
    expect(m.pass).toBe(`app-${RUN}`);
    expect(m.from).toBe(SENDER);
    expect(m.to).toEqual(['ops@example.com', 'boss@example.com']);
    expect(m.data).toContain('To: ops@example.com');
    expect(m.data).toContain('Cc: boss@example.com');
    expect(m.data).toContain(`<${SENDER}>`);

    const again = await call(sendMail, { params: ref(id) });
    expect(again.status).toBe(422);
    expect(again.json?.error).toBe('이미 보낸 메일입니다.');
    expect(smtp.send).toHaveBeenCalledTimes(1);

    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.sentRef).toBe('250 2.0.0 OK queued');
    const week = await repo.getAgent(AGENT, admin, { week: mondayOf(today()) });
    expect(week.weeks.find((w) => w.start === mondayOf(today()))?.mails).toBeGreaterThanOrEqual(1);
    expect(week.week?.events.some((e) => e.kind === 'mail-sent' && e.title.includes(`${mark} 11월 기성 청구`))).toBe(true);
  });

  it('두 창에서 같이 눌러도 한 통만 나간다', async () => {
    await connectFake();
    await signIn(USERS.admin);
    const id = await draft({ subject: `${mark} 같이 누름` });
    const [a, b] = await Promise.all([call(sendMail, { params: ref(id) }), call(sendMail, { params: ref(id) })]);
    expect([a.status, b.status].sort()).toEqual([200, 422]);
    expect(smtp.send).toHaveBeenCalledTimes(1);
  });

  it('서버가 거절하면 「보내지 못함」으로 남고 까닭이 단추 옆에 — 다시 보내면 나간다', async () => {
    await connectFake();
    await signIn(USERS.admin);
    const id = await draft({ subject: `${mark} 거절` });
    smtp.send.mockRejectedValueOnce(new Error('메일 서버가 받는 사람을 받지 않았습니다: ops@example.com — 5.1.1 No such user'));
    const r = await call(sendMail, { params: ref(id) });
    expect(r.status).toBe(422);
    expect(r.json?.error).toBe('메일 서버가 받는 사람을 받지 않았습니다: ops@example.com — 5.1.1 No such user');
    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.status).toBe('failed');
    expect(row.error).toBe('메일 서버가 받는 사람을 받지 않았습니다: ops@example.com — 5.1.1 No such user');

    const retry = await call(sendMail, { params: ref(id) });
    expect(retry.status).toBe(200);
    expect(smtp.send).toHaveBeenCalledTimes(2);
  });

  it('끊으면 줄이 사라진다 — 초안은 남는다', async () => {
    await connectFake();
    await signIn(USERS.admin);
    const id = await draft({ subject: `${mark} 끊은 뒤` });
    expect((await call(disconnect, { method: 'DELETE' })).status).toBe(200);
    expect(await repo.getMailAccount(admin)).toBeNull();
    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, id));
    expect(row.status).toBe('draft');
  });
});

describe('보내는 메일은 사업마다 — 태양광 AI에이전트는 전기차와 따로 연결한다', () => {
  const SOLAR_AGENT = 'solar-settlement';
  const SOLAR_SENDER = `solar-${RUN}@example.com`;

  it('태양광을 연결 · 끊어도 전기차 연결은 그대로 — 태양광 담당의 초안은 태양광 계정으로 나간다', async () => {
    await connectFake();
    await signIn(USERS.admin);
    const on = await call(connect, { body: { email: SOLAR_SENDER, password: `solar-app-${RUN}`, biz: 'solar' } });
    expect(on.status).toBe(200);
    expect((await repo.getMailAccount(admin, 'solar'))?.email).toBe(SOLAR_SENDER);
    expect((await repo.getMailAccount(admin))?.email).toBe(SENDER);

    const made = await repo.addAgentMail({
      agentId: SOLAR_AGENT, to: 'ops@example.com', subject: `${mark} 태양광 지급 안내`, body: '안녕하세요, 한백입니다.',
    }, admin);
    const sent = await call(sendMail, { params: { id: SOLAR_AGENT, mailId: made.id } });
    expect(sent.status).toBe(200);
    expect(smtp.send).toHaveBeenCalledTimes(1);
    expect(smtp.send.mock.calls[0][0].user).toBe(SOLAR_SENDER);
    expect(smtp.send.mock.calls[0][0].pass).toBe(`solar-app-${RUN}`);

    /* 전기차 담당의 초안은 전기차 계정으로 */
    const ev = await draft();
    expect((await call(sendMail, { params: ref(ev) })).status).toBe(200);
    expect(smtp.send.mock.calls[1][0].user).toBe(SENDER);

    const off = await call(disconnect, { method: 'DELETE', body: { biz: 'solar' } });
    expect(off.status).toBe(200);
    expect(await repo.getMailAccount(admin, 'solar')).toBeNull();
    expect((await repo.getMailAccount(admin))?.email).toBe(SENDER);
  });
});


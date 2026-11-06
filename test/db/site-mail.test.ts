/**
 * 현장 양식 메일 — 계약서가 접수되면 운영사 담당이 저절로 (lib/site-mail · lib/site-mail-run · store/agent-mail siteMail).
 * 한백 지시 2026-11-04 「나이스인프라 계약서가 접수되면 나이스인프라 담당자가 바로 할 일로 올려서 메일 초안작성해서 보내야해. 그걸
 * 대화창에서 보여줘야하고」 · 「현대엔지니어링의 경우 … 설치승인서를 메일로 보내줘야해. 만약 없을 경우, 없어서 못보낸다고 알람을
 * 줘야하고」 · 「다시 채워지면 그때 내가 다시 요청할 예정이고, 넌 그때 메일을 다시 보내줘」.
 *
 * 보는 것: 서류가 없으면 할 일 · 대화의 말 · 한백 관리자 알림, 같은 접수가 두 번 불려도 한 번 · 다시 요청하면 서류가 없을 때 그 말로
 * 멈추고, 채워지면 초안을 쓰고 알림 · 할 일의 「없음」 덧붙임을 거둔다 · 보내면 할 일이 끝난다 · 서류가 바뀌면 앞 초안을 버리고 받는 사람을 이어받는다 · 같은
 * 서류로 이미 보냈으면 저절로는 다시 안 쓴다(요청하면 쓴다) · 양식 없는 운영사 · 접수 전이면 아무것도 안 한다.
 * 메일 서버(lib/agents/smtp)와 Blob 의 크기 묻기(fetch HEAD)는 흉내 낸다. 결과서 판독은 부르지 않는다(결과서 칸을 비워 둔다).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import { POST as sendMail } from '@/app/api/agents/[id]/mails/[mailId]/send/route';
import { PATCH as patchMail } from '@/app/api/agents/[id]/mails/[mailId]/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMails, agentMessages, agentTasks, auditLog, documents, mailAccounts, notifications, projects } from '@/lib/db/schema';
import { requestSiteMail, runSiteMailIntake } from '@/lib/site-mail-run';
import { RUN, USERS, actorOf, call, signIn, withProject } from './kit';

const smtp = vi.hoisted(() => ({ send: vi.fn(async (_m: { to: string[]; data: string }) => ({ id: '250 OK queued' })) }));
vi.mock('@/lib/agents/smtp', async (orig) => ({
  ...(await orig<typeof import('@/lib/agents/smtp')>()),
  verifySmtp: vi.fn(async () => undefined),
  sendSmtp: smtp.send,
}));

/*
 * 설치승인서 검증(lib/hec-approval-run)은 흉내 낸다 — 진짜는 파일을 받아 pptx 를 열거나 PDF 를 판독에 보낸다(판정 규칙은
 * test/hec-approval.test.ts 가 본다). 여기서는 파일 이름으로 결과를 정한다: 「빈양식」은 막고 「기수다름」은 확인 필요.
 */
const approval = vi.hoisted(() => ({
  check: vi.fn(async (f: { name: string }): Promise<Array<{ level: 'block' | 'warn'; why: string }>> => {
    if (f.name.includes('빈양식')) return [{ level: 'block', why: '빈 양식입니다(현장명 · 기수가 비어 있음)' }];
    if (f.name.includes('기수다름')) return [{ level: 'warn', why: '기수가 다릅니다 — 승인서 3기 · 콘솔 4기' }];
    return [];
  }),
}));
vi.mock('@/lib/hec-approval-run', () => ({ checkApprovalFile: approval.check }));

const repo = getRepository();
const admin = actorOf(USERS.admin);
const NICE = { cpo: '나이스인프라' as const, bizType: '환경부' as const };
const HEC = { cpo: '현대엔지니어링' as const, bizType: '환경부' as const };
const AGENT_NAMES = ['나이스인프라 담당', '현대엔지니어링 담당'];
const fileUrl = (name: string) => `https://blob.example/${RUN}/${name}`;
let saved: typeof mailAccounts.$inferSelect | undefined;

beforeAll(async () => {
  [saved] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, 'mail'));
  await repo.saveMailAccount({ email: `sender-${RUN}@example.com`, secret: `app-${RUN}`, server: 'smtp.daum.net:465' }, admin);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(agentMails).where(like(agentMails.subject, `%${RUN}%`));
  await db.delete(mailAccounts).where(eq(mailAccounts.id, 'mail'));
  if (saved) await db.insert(mailAccounts).values(saved);
  await db.delete(auditLog).where(and(
    or(like(auditLog.action, '%메일%'), like(auditLog.action, '메일 계정%')),
    or(like(auditLog.newValue, `%${RUN}%`), like(auditLog.oldValue, `%${RUN}%`)),
  ));
});

beforeEach(() => {
  smtp.send.mockClear();
  const real = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://blob.example/')) {
      return new Response(init?.method === 'HEAD' ? null : 'doc-bytes', { headers: { 'content-length': '2048' } });
    }
    return real(input, init);
  });
});

/** 협력사가 「계약서 접수하기」를 누른 것 — 서류 조건은 이 시험의 일이 아니라 접수일만 찍는다 */
async function submit(id: string): Promise<void> {
  await getDb().update(projects).set({ contractSubmittedAt: '2026-11-04' }).where(eq(projects.id, id));
}

/** 서류 칸 하나를 이 파일 한 장으로 — 없으면 만들고 있으면 갈아 끼운다(올리기 라우트 · Blob 없이) */
async function putDoc(id: string, kind: string, name: string): Promise<void> {
  const url = fileUrl(name);
  const files = [{ name, url, uploadedBy: 'admin', uploadedAt: '2026-11-04' }];
  const db = getDb();
  const slot = and(eq(documents.projectId, id), eq(documents.kind, kind));
  const [had] = await db.select({ kind: documents.kind }).from(documents).where(slot);
  if (had) await db.update(documents).set({ filename: name, blobUrl: url, files }).where(slot);
  else await db.insert(documents).values({ projectId: id, kind, filename: name, blobUrl: url, status: 'uploaded', files });
}

/** 그 현장에 남은 담당의 흔적 */
async function trail(id: string) {
  const db = getDb();
  const [messages, tasks, mails, alarms] = [
    await db.select().from(agentMessages).where(sql`${agentMessages.meta}->'site'->>'id' = ${id}`),
    await db.select().from(agentTasks).where(eq(agentTasks.projectId, id)),
    await db.select().from(agentMails).where(eq(agentMails.projectId, id)),
    await db.select().from(notifications).where(and(eq(notifications.projectId, id), eq(notifications.kind, 'agent'))),
  ];
  return { messages, tasks, mails, alarms };
}

/** 현장을 지우기 전에 — 할 일 · 메일은 현장이 지워지면 null 로 남고, 말은 현장에 걸려 있지 않다 */
async function clean(id: string): Promise<void> {
  const db = getDb();
  await db.delete(agentMessages).where(sql`${agentMessages.meta}->'site'->>'id' = ${id}`);
  await db.delete(agentTasks).where(eq(agentTasks.projectId, id));
  await db.delete(agentMails).where(eq(agentMails.projectId, id));
  await db.delete(auditLog).where(and(eq(auditLog.projectId, id), inArray(auditLog.field, AGENT_NAMES)));
}

async function approveAndSend(agentId: string, mail: { id: string; subject: string; body: string }, to: string) {
  await signIn(USERS.admin);
  const edited = await call(patchMail, {
    method: 'PATCH', params: { id: agentId, mailId: mail.id }, body: { action: 'edit', to, cc: '', subject: mail.subject, body: mail.body },
  });
  expect(edited.status, JSON.stringify(edited.json)).toBe(200);
  const sent = await call(sendMail, { params: { id: agentId, mailId: mail.id } });
  expect(sent.status, JSON.stringify(sent.json)).toBe(200);
}

describe('현대엔지니어링 설치승인서 메일', () => {
  it('없으면 못 보낸다고 대화에 남기고 한백 관리자에게 알린다 — 채워져 다시 요청하면 초안 · 보내면 할 일이 끝난다', async () => {
    await withProject(async (id) => {
      try {
        await submit(id);
        const first = await runSiteMailIntake(id);
        expect(first).toMatchObject({ plan: 'missing', mail: null });
        expect(first!.alarmed).toBeGreaterThan(0);
        let t = await trail(id);
        expect(t.tasks).toHaveLength(1);
        expect(t.tasks[0]).toMatchObject({ agentId: 'op-hec', kind: 'hec-install-approval', title: '설치승인서 메일 보내기', doneAt: null });
        expect(t.tasks[0].note).toBe('설치승인서 없음 — 채워지면 다시 요청');
        expect(t.messages).toHaveLength(1);
        expect(t.messages[0]).toMatchObject({ agentId: 'op-hec', role: 'auto', author: '현대엔지니어링 담당' });
        expect(t.messages[0].body).toContain('설치승인서가 없어 설치승인서 메일을 보내지 못합니다');
        expect(t.alarms.find((a) => a.userId === 'admin')).toMatchObject({
          title: '설치승인서 없음 — 메일 못 보냄', scope: '계약', docKind: 'approval', readAt: null,
        });
        const shown = (await repo.listNotifications(USERS.admin)).find((n) => n.projectId === id && n.kind === 'agent');
        expect(shown).toMatchObject({ author: 'AI 담당', scope: '계약' });

        // 같은 접수가 두 번 불려도(두 번 누름) 말 · 할 일 · 알림은 한 번
        const again = await runSiteMailIntake(id);
        expect(again).toMatchObject({ plan: 'missing', messageId: null, taskId: null, alarmed: 0 });
        t = await trail(id);
        expect([t.messages.length, t.tasks.length]).toEqual([1, 1]);

        // 아직 없으면 다시 요청해도 그 까닭으로 멈춘다
        await expect(requestSiteMail(id, admin)).rejects.toThrow('설치승인서가 없습니다 — 먼저 올려 주세요.');

        // 채워지면 다시 요청 → 초안, 안 읽은 「없어서 못 보냄」 알림은 거둔다
        await putDoc(id, 'approval', '설치승인서.pdf');
        const req = await requestSiteMail(id, admin);
        expect(req.plan).toBe('create');
        expect(req.mail).toMatchObject({ kind: 'hec-install-approval', projectId: id, status: 'draft' });
        expect(req.mail!.subject).toContain(RUN);
        expect(req.mail!.files).toEqual([expect.objectContaining({ name: '설치승인서.pdf', size: 2048 })]);
        t = await trail(id);
        expect(t.alarms).toHaveLength(0);
        expect(t.tasks[0].note, '「없음」 덧붙임도 걷는다').toBeNull();

        // 승인하고 보내면 그 현장 · 양식의 할 일이 끝난다
        await approveAndSend('op-hec', req.mail!, `hec-${RUN}@example.com`);
        expect(smtp.send).toHaveBeenCalledTimes(1);
        expect(smtp.send.mock.calls[0][0].data).toContain(Buffer.from('doc-bytes').toString('base64'));
        t = await trail(id);
        expect(t.tasks[0].doneAt).not.toBeNull();
        const closed = await getDb().select().from(auditLog)
          .where(and(eq(auditLog.projectId, id), eq(auditLog.action, '에이전트 할 일 끝냄')));
        expect(closed).toHaveLength(1);
      } finally {
        await clean(id);
      }
    }, HEC);
  });

  it('설치승인서가 맞지 않으면 초안을 쓰지 않는다 — 까닭 · 할 일 · 알림, 그래도 쓰라면 force · 고쳐 올리면 「확인 필요」만 남는다', async () => {
    await withProject(async (id) => {
      try {
        await submit(id);
        await putDoc(id, 'approval', '설치승인서 빈양식.pptx');
        const first = await runSiteMailIntake(id);
        expect(first).toMatchObject({ plan: 'invalid', mail: null });
        expect(first!.alarmed).toBeGreaterThan(0);
        expect(approval.check).toHaveBeenCalledWith(
          expect.objectContaining({ name: '설치승인서 빈양식.pptx' }), expect.objectContaining({ qty: expect.any(Number) }),
        );
        let t = await trail(id);
        expect(t.mails).toHaveLength(0);
        expect(t.tasks[0].note).toBe('설치승인서 확인 필요 — 고쳐지면 다시 요청');
        expect(t.messages).toHaveLength(1);
        expect(t.messages[0].body).toContain('설치승인서가 맞지 않아 설치승인서 메일을 보내지 못합니다 — 「설치승인서 빈양식.pptx」 빈 양식입니다');
        expect(t.alarms.find((a) => a.userId === 'admin')).toMatchObject({ title: '설치승인서 확인 필요 — 메일 못 보냄', docKind: 'approval' });

        // 같은 접수가 두 번 불려도 말 · 알림은 한 번
        expect(await runSiteMailIntake(id)).toMatchObject({ plan: 'invalid', messageId: null, alarmed: 0 });

        // 다시 요청해도 그 까닭으로 멈춘다 — 한백이 그래도 쓰라면(담당의 force) 쓰고, 까닭은 카드의 「확인 필요」로 남는다
        await expect(requestSiteMail(id, admin)).rejects.toThrow('설치승인서를 붙일 수 없습니다 — 「설치승인서 빈양식.pptx」 빈 양식입니다');
        const forced = await requestSiteMail(id, admin, undefined, { force: true });
        expect(forced.plan).toBe('create');
        expect(forced.mail!.checks).toEqual(['「설치승인서 빈양식.pptx」 빈 양식입니다(현장명 · 기수가 비어 있음)']);

        // 고쳐 올리고 다시 요청 → 앞 초안을 버리고 새로 · 알림 · 할 일의 「확인 필요」 덧붙임을 거둔다 · 기수가 다르면 「확인 필요」만
        await putDoc(id, 'approval', '설치승인서 기수다름.pptx');
        const fixed = await requestSiteMail(id, admin);
        expect(fixed.plan).toBe('replace');
        expect(fixed.mail!.checks).toEqual(['「설치승인서 기수다름.pptx」 기수가 다릅니다 — 승인서 3기 · 콘솔 4기']);
        t = await trail(id);
        expect(t.alarms).toHaveLength(0);
        expect(t.tasks[0].note).toBeNull();
        expect(t.mails.filter((m) => m.status === 'draft')).toHaveLength(1);
      } finally {
        await clean(id);
      }
    }, HEC);
  });
});

describe('나이스인프라 계약서 초안 메일', () => {
  it('접수되면 할 일 · 초안 · 대화 한 줄(초안은 그 말 밑) — 서류가 바뀌면 앞 초안을 버리고 받는 사람을 이어받는다 · 보낸 서류로는 저절로 다시 안 쓴다', async () => {
    await withProject(async (id) => {
      try {
        await putDoc(id, 'contractDraft', '계약서초안.docx');
        await repo.saveConsultDup(id, {
          found: true, none: false, items: { slow: 3 }, files: [fileUrl('결과서.pdf')], readAt: new Date().toISOString(),
        }, admin);
        await submit(id);
        const first = await runSiteMailIntake(id);
        expect(first?.plan).toBe('create');
        expect(first!.mail!.messageId).toBe(first!.messageId);
        expect(first!.mail!.body).toContain('7. 기설치 현황 : 완속 3기');
        expect(first!.mail!.files).toEqual([expect.objectContaining({ name: '계약서초안.docx' })]);
        let t = await trail(id);
        expect(t.messages).toHaveLength(1);
        expect(t.messages[0].body).toContain('계약서 초안 메일을 썼습니다(계약서 초안 첨부) — 할 일에도 올렸습니다.');
        expect(t.messages[0].meta).toMatchObject({ site: { id }, added: ['계약서 초안 메일 보내기'] });
        expect(t.alarms).toHaveLength(0);

        // 다시 불려도 하나
        const twice = await runSiteMailIntake(id);
        expect(twice).toMatchObject({ plan: 'keep', messageId: null, taskId: null });
        t = await trail(id);
        expect([t.messages.length, t.tasks.length, t.mails.length]).toEqual([1, 1, 1]);

        // 받는 사람을 넣어 둔 뒤 서류가 바뀌어 다시 접수 — 앞 초안은 버리고, 새 초안은 그 주소를 이어받는다
        const to = `nice-${RUN}@example.com`;
        await signIn(USERS.admin);
        expect((await call(patchMail, {
          method: 'PATCH', params: { id: 'op-nice', mailId: first!.mail!.id },
          body: { action: 'edit', to, cc: '', subject: first!.mail!.subject, body: first!.mail!.body },
        })).status).toBe(200);
        await putDoc(id, 'contractDraft', '계약서초안-고침.docx');
        const second = await runSiteMailIntake(id);
        expect(second?.plan).toBe('replace');
        expect(second!.mail!.to).toEqual([to]);
        expect(second!.mail!.files).toEqual([expect.objectContaining({ name: '계약서초안-고침.docx' })]);
        t = await trail(id);
        expect(t.mails.find((m) => m.id === first!.mail!.id)?.status).toBe('discarded');
        expect(t.messages).toHaveLength(2);
        expect(t.tasks.filter((x) => !x.doneAt)).toHaveLength(1);

        await approveAndSend('op-nice', second!.mail!, to);
        expect((await trail(id)).tasks[0].doneAt).not.toBeNull();

        // 같은 서류로 이미 보냈다 — 저절로는 다시 안 쓴다, 한백이 요청하면 쓴다(받는 사람은 보낸 주소)
        const third = await runSiteMailIntake(id);
        expect(third).toMatchObject({ plan: 'sent', mail: null, messageId: null });
        const asked = await requestSiteMail(id, admin);
        expect(asked.plan).toBe('create');
        expect(asked.mail!.to).toEqual([to]);
      } finally {
        await clean(id);
      }
    }, NICE);
  });
});

describe('하지 않을 때', () => {
  it('양식이 없는 운영사 · 아직 접수 전이면 아무것도 안 한다', async () => {
    await withProject(async (id) => {
      await submit(id);
      expect(await runSiteMailIntake(id)).toBeNull();
    });
    await withProject(async (id) => {
      try {
        await putDoc(id, 'approval', '설치승인서.pdf');
        expect(await runSiteMailIntake(id)).toBeNull();
        const t = await trail(id);
        expect([t.messages.length, t.tasks.length, t.mails.length]).toEqual([0, 0, 0]);
      } finally {
        await clean(id);
      }
    }, HEC);
  });
});

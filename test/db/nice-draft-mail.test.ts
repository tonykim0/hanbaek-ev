/**
 * 나이스인프라 계약서 초안 메일 · 결과서 중복설치의 문 (app/api/projects/[id]/nice-draft-mail · store/agent-mail addSiteMail ·
 * store/consult-dup). 한백 지시 2026-11-03.
 *
 * 보는 것: 관리자만 · 나이스 현장만 · 「계약서 초안」 칸이 비면 거절 · 초안은 그 칸의 파일을 붙여 나이스인프라 담당에 하나만 선다(두 번
 * 눌러도) · 처음엔 받는 사람이 비어 보내기가 막히고, 넣고 보내면 다음 현장의 초안은 그 주소로 미리 찬다 · 결과서 6번을 남기면 현장의
 * 제출 정보 7번이 그것을 쓴다. 메일 서버(lib/agents/smtp)와 Blob 의 크기 묻기(fetch HEAD)는 흉내 낸다.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, like, or } from 'drizzle-orm';
import { POST as draftMail } from '@/app/api/projects/[id]/nice-draft-mail/route';
import { POST as sendMail } from '@/app/api/agents/[id]/mails/[mailId]/send/route';
import { PATCH as patchMail } from '@/app/api/agents/[id]/mails/[mailId]/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMails, auditLog, documents, mailAccounts } from '@/lib/db/schema';
import { niceSubmitLines } from '@/lib/nice-submit';
import { RUN, USERS, actorOf, call, signIn, withProject } from './kit';

const smtp = vi.hoisted(() => ({ send: vi.fn(async (_m: { to: string[]; data: string }) => ({ id: '250 OK queued' })) }));
vi.mock('@/lib/agents/smtp', async (orig) => ({
  ...(await orig<typeof import('@/lib/agents/smtp')>()),
  verifySmtp: vi.fn(async () => undefined),
  sendSmtp: smtp.send,
}));

const repo = getRepository();
const admin = actorOf(USERS.admin);
const NICE = { cpo: '나이스인프라' as const, bizType: '환경부' as const };
const DRAFT_URL = `https://blob.example/${RUN}/계약서초안.docx`;
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
    or(like(auditLog.action, '%메일%'), like(auditLog.action, '결과서%')),
    or(like(auditLog.newValue, `%${RUN}%`), like(auditLog.oldValue, `%${RUN}%`)),
  ));
});

beforeEach(() => {
  smtp.send.mockClear();
  /* 붙일 파일의 크기를 Blob 에 묻는 HEAD 만 흉내 — 나머지 fetch 는 그대로 */
  const real = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://blob.example/')) {
      return new Response(init?.method === 'HEAD' ? null : 'word-bytes', { headers: { 'content-length': '12345' } });
    }
    return real(input, init);
  });
});

/** 「계약서 초안」 칸에 워드 한 장을 넣는다 — 올리기 라우트를 거치지 않고 줄을 바로 쓴다(Blob 없이) */
async function putDraft(projectId: string): Promise<void> {
  await getDb().insert(documents).values({
    projectId, kind: 'contractDraft', filename: '계약서초안.docx', blobUrl: DRAFT_URL, status: 'uploaded',
    files: [{ name: '계약서초안.docx', url: DRAFT_URL, uploadedBy: 'admin', uploadedAt: '2026-11-03' }],
  });
}

describe('계약서 초안 메일', () => {
  it('관리자만 · 나이스 현장만 · 초안 칸이 비면 그 까닭을 말한다', async () => {
    await withProject(async (other) => {
      await signIn(USERS.admin);
      const r = await call(draftMail, { params: { id: other } });
      expect(r.status).toBe(422);
      expect(r.json?.error).toBe('나이스인프라 현장이 아닙니다.');
    });
    await withProject(async (id) => {
      await signIn(USERS.viewer);
      expect((await call(draftMail, { params: { id } })).status).toBe(403);
      await signIn(USERS.admin);
      const r = await call(draftMail, { params: { id } });
      expect(r.status).toBe(422);
      expect(r.json?.error).toBe('계약서 초안(워드)이 없습니다 — 먼저 올려 주세요.');
    }, NICE);
  });

  it('초안 칸의 워드를 붙여 나이스인프라 담당에 하나만 — 받는 사람이 비면 보내기가 막히고, 넣으면 나간다 · 다음 현장은 그 주소로 찬다', async () => {
    await withProject(async (id) => {
      await putDraft(id);
      await repo.saveConsultDup(id, {
        found: true, none: false, items: { slow: 3 }, files: [`https://blob.example/${RUN}/결과서.pdf`], readAt: new Date().toISOString(),
      }, admin);
      await signIn(USERS.admin);
      const first = await call(draftMail, { params: { id } });
      expect(first.status, JSON.stringify(first.json)).toBe(200);
      const mail = first.json?.mail as { id: string; kind: string; projectId: string; subject: string; body: string; to: string[]; files: Array<{ name: string; size: number }> };
      expect(mail.kind).toBe('nice-contract-draft');
      expect(mail.projectId).toBe(id);
      expect(mail.subject).toContain(`[시험 ${RUN}]`);
      expect(mail.body.startsWith('안녕하세요, 계약서 초안 송부드립니다.\n\n1. 장소명 : ')).toBe(true);
      expect(mail.body).toContain('7. 기설치 현황 : 완속 3기');
      expect(mail.body.endsWith('\n\n감사합니다')).toBe(true);
      expect(mail.files).toEqual([expect.objectContaining({ name: '계약서초안.docx', size: 12345 })]);

      const again = await call(draftMail, { params: { id } });
      expect((again.json?.mail as { id: string }).id).toBe(mail.id); // 두 번 눌러도 하나

      const blocked = await call(sendMail, { params: { id: 'op-nice', mailId: mail.id } });
      expect(blocked.status).toBe(422);
      expect(blocked.json?.error).toBe('받는 사람이 없습니다 — 「고치기」로 받는 사람을 넣어 주세요.');

      const to = `nice-${RUN}@example.com`;
      expect((await call(patchMail, {
        method: 'PATCH', params: { id: 'op-nice', mailId: mail.id }, body: { action: 'edit', to, cc: '', subject: mail.subject, body: mail.body },
      })).status).toBe(200);
      const sent = await call(sendMail, { params: { id: 'op-nice', mailId: mail.id } });
      expect(sent.status, JSON.stringify(sent.json)).toBe(200);
      expect(smtp.send).toHaveBeenCalledTimes(1);
      const data = smtp.send.mock.calls[0][0].data;
      expect(data).toContain('multipart/mixed');
      expect(data).toContain(Buffer.from('word-bytes').toString('base64'));

      await withProject(async (next) => {
        await putDraft(next);
        const n = await call(draftMail, { params: { id: next } });
        expect((n.json?.mail as { to: string[] }).to).toEqual([to]); // 같은 양식의 지난 주소
      }, { ...NICE, name: `[시험 ${RUN}] 다음 현장` });
    }, NICE);
  });
});

describe('결과서 중복설치', () => {
  it('남기면 현장의 제출 정보 7번이 그것을 쓴다 — 바뀌면 감사기록 한 줄', async () => {
    await withProject(async (id) => {
      await repo.saveConsultDup(id, {
        found: true, none: true, items: {}, files: [`https://blob.example/${RUN}/결과서.pdf`], readAt: new Date().toISOString(),
      }, admin);
      const detail = await repo.getProject(id, { role: 'admin', org: null });
      expect(niceSubmitLines(detail!.project, 2)[6]).toBe('7. 기설치 현황 : 없음');
      const logs = await getDb().select().from(auditLog)
        .where(and(eq(auditLog.projectId, id), eq(auditLog.action, '결과서 중복설치 읽음')));
      expect(logs).toHaveLength(1);
      expect(logs[0].newValue).toBe('없음');
      await expect(repo.saveConsultDup(id, detail!.project.consultDup!, actorOf(USERS.ecoelec))).rejects.toThrow('한백 관리자만');
    }, NICE);
  });
});

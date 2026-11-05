/**
 * 여러 현장의 같은 서류를 묶어 메일에 — 저장소의 문 (store/agent-mail siteDocFiles · addAgentMail 의 docFiles · 한백 2026-11-05
 * 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서 압축해서 이메일로」). zip 을 받고 올리는 일(lib/agents/bundle-run)은
 * Blob 이 없는 CI 에서 돌지 않으므로 여기서는 저장소의 읽기 · 받는 문만 본다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMails, documents, processDocuments } from '@/lib/db/schema';
import { RUN, USERS, actorOf, withProject } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const mark = `[시험 ${RUN}]`;

afterAll(async () => {
  await getDb().delete(agentMails).where(like(agentMails.subject, `%${RUN}%`));
});

const file = (name: string) => ({ name, url: `https://example.invalid/${RUN}/${name}`, uploadedBy: 'x', uploadedAt: null });

describe('여러 현장의 한 서류 칸 (siteDocFiles)', () => {
  it('준 차례대로 현장마다 그 칸의 파일 — 계약 서류 · 공정 서류, 없는 칸은 빈 목록, 없는 현장은 빠진다', async () => {
    await withProject(async (a) => {
      await withProject(async (b) => {
        const db = getDb();
        await db.insert(documents).values({ projectId: a, kind: 'approval', status: 'uploaded', files: [file('a1.pptx'), file('a2.pdf')] })
          .onConflictDoUpdate({ target: [documents.projectId, documents.kind], set: { files: [file('a1.pptx'), file('a2.pdf')] } });
        await db.insert(processDocuments).values({ projectId: b, kind: 'orderQuote', status: 'uploaded', files: [file('q.pdf')] })
          .onConflictDoUpdate({ target: [processDocuments.projectId, processDocuments.kind], set: { files: [file('q.pdf')] } });

        const contract = await repo.siteDocFiles(admin, { projectIds: [b, a, 'nope'], table: 'contract', kind: 'approval' });
        expect(contract.map((s) => s.projectId)).toEqual([b, a]);
        expect(contract[0].files).toEqual([]);
        expect(contract[1]).toMatchObject({ cpo: '현대엔지니어링', files: [{ name: 'a1.pptx' }, { name: 'a2.pdf' }] });
        expect(contract[1].mgmtNo).toMatch(/^HB-/);

        const process = await repo.siteDocFiles(admin, { projectIds: [a, b], table: 'process', kind: 'orderQuote' });
        expect(process.map((s) => s.files.map((f) => f.name))).toEqual([[], ['q.pdf']]);

        await expect(repo.siteDocFiles(actorOf(USERS.viewer), { projectIds: [a], table: 'contract', kind: 'approval' }))
          .rejects.toThrow('한백 관리자만');
      });
    }, { cpo: '현대엔지니어링' });
  });
});

describe('묶음을 붙인 메일 초안 (addAgentMail docFiles)', () => {
  const zip = (agent: string, size = 1024) => ({
    name: '설치승인서 2개소.zip', url: `https://x.public.blob.vercel-storage.com/agent-files/${agent}/bundles/${RUN}/b.zip`,
    size, contentType: 'application/zip',
  });
  const letter = { to: ['a@example.com'], subject: `${mark} 설치승인서 묶음`, body: '본문' };

  it('그 담당의 묶음 자리에 있는 zip 만 붙는다 — 메일 카드에 첨부로 선다', async () => {
    const made = await repo.addAgentMail({ agentId: 'op-hec', ...letter, docFiles: [zip('op-hec')] }, admin);
    const [row] = await getDb().select().from(agentMails).where(eq(agentMails.id, made.id));
    expect(row.docFiles).toEqual([zip('op-hec')]);
    const mail = (await repo.getAgent('op-hec', admin)).mails.find((m) => m.id === made.id);
    expect(mail?.files.map((f) => f.name)).toEqual(['설치승인서 2개소.zip']);
  });

  it('다른 담당의 자리 · 우리 묶음이 아닌 주소 · 25MB 넘는 것은 거절', async () => {
    await expect(repo.addAgentMail({ agentId: 'op-hec', ...letter, docFiles: [zip('op-nice')] }, admin)).rejects.toThrow('묶음');
    await expect(repo.addAgentMail({
      agentId: 'op-hec', ...letter, docFiles: [{ ...zip('op-hec'), url: 'https://evil.example/agent-files/op-hec/bundles/x.zip' }],
    }, admin)).rejects.toThrow('묶음');
    await expect(repo.addAgentMail({ agentId: 'op-hec', ...letter, docFiles: [zip('op-hec', 26 * 1024 * 1024)] }, admin))
      .rejects.toThrow('25.0MB까지');
  });
});

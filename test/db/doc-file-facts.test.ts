/**
 * 판독이 읽은 사실(운영사 직인 — lib/cpo-seal)을 파일 한 장에 단다 — 같은 칸의 다른 장은 그대로다.
 *
 * 판독은 응답 뒤에 돈다. 그사이 같은 칸에 업로드가 오면 잠금 없이 읽고-고쳐-쓰는 쓰기는 새로 붙은 파일을 지운다
 * (감사 M10 과 같은 자리) — 그래서 올리기와 같은 칸 잠금을 쥔다. 여기서는 동시에 던져 두 쪽이 다 남는지 본다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, viewerOf, withProject } from './kit';

const urlOf = (id: string, n: number) => `https://test.local/${RUN}/${id}/contract-${n}.pdf`;

describe('파일 한 장에 판독 사실 달기', () => {
  it('고른 장에만 붙고, 없는 장이면 false, 열람 전용은 거절', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      const admin = actorOf(USERS.admin);
      for (const n of [1, 2]) {
        await repo.uploadDocument({ projectId: id, kind: 'contract', filename: `contract-${n}.pdf`, blobUrl: urlOf(id, n) }, admin);
      }

      expect(await repo.setDocFileFacts({ projectId: id, kind: 'contract', url: urlOf(id, 2), facts: { cpoSeal: false } }, admin)).toBe(true);
      expect(await repo.setDocFileFacts({ projectId: id, kind: 'contract', url: urlOf(id, 9), facts: { cpoSeal: true } }, admin)).toBe(false);
      await expect(
        repo.setDocFileFacts({ projectId: id, kind: 'contract', url: urlOf(id, 1), facts: { cpoSeal: true } }, actorOf(USERS.viewer))
      ).rejects.toThrow();

      const files = (await repo.getProject(id, viewerOf(USERS.admin)))?.documents.find((d) => d.kind === 'contract')?.files ?? [];
      expect(files.map((f) => [f.name, f.cpoSeal])).toEqual([['contract-1.pdf', undefined], ['contract-2.pdf', false]]);
    });
  });

  it('같은 칸에 업로드와 동시에 달아도 새 장이 사라지지 않는다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      const admin = actorOf(USERS.admin);
      await repo.uploadDocument({ projectId: id, kind: 'contract', filename: 'contract-1.pdf', blobUrl: urlOf(id, 1) }, admin);
      await Promise.all([
        repo.setDocFileFacts({ projectId: id, kind: 'contract', url: urlOf(id, 1), facts: { cpoSeal: true } }, admin),
        repo.uploadDocument({ projectId: id, kind: 'contract', filename: 'contract-2.pdf', blobUrl: urlOf(id, 2) }, admin),
      ]);
      const files = (await repo.getProject(id, viewerOf(USERS.admin)))?.documents.find((d) => d.kind === 'contract')?.files ?? [];
      expect(files.map((f) => f.name).sort()).toEqual(['contract-1.pdf', 'contract-2.pdf']);
      expect(files.find((f) => f.name === 'contract-1.pdf')?.cpoSeal).toBe(true);
    });
  });
});

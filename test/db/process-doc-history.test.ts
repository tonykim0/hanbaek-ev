/**
 * 공정 서류의 반려와 그 해소가 둘 다 검수 이력에 남는다 — 감사 2026-09-04 L12.
 * 한쪽만 있는 이력은 무엇이 풀렸는지 말하지 못한다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, viewerOf, withProject } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const view = viewerOf(USERS.admin);
const KIND = 'asBuilt';   // 공정 서류 한 칸

describe('공정 서류 검수 이력', () => {
  it('L12 — 반려 뒤 다시 올리면 「서류 재업로드」가 이력에 남는다', async () => {
    await withProject(async (id) => {
      const up = (n: number) => repo.uploadDocument({ projectId: id, kind: KIND, filename: `asbuilt-${n}.pdf`, blobUrl: `https://test.local/${RUN}/${id}/${KIND}-${n}.pdf` }, admin);
      await up(1);
      await repo.setDocumentStatus({ projectId: id, kind: KIND, status: 'rejected', reason: '도면 누락' }, admin);
      await up(2);
      const history = await repo.listReviewHistory(id, view);
      const mine = history.filter((h) => h.kind === KIND).map((h) => h.action);
      expect(mine, '반려와 재업로드가 같이 보인다').toEqual(expect.arrayContaining(['서류 반려', '서류 재업로드']));
    });
  });
});

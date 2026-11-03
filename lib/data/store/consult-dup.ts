/**
 * 사전현장컨설팅 결과서 「6. 중복설치」를 읽은 것을 현장에 남긴다 (migrations/0112 · lib/consult-dup-run).
 *
 * 읽는 쪽은 판독이고(저절로 — 자동 대조 이름으로, 또는 한백의 「결과서에서 다시 읽기」) 값은 현장 줄 하나(projects.consult_dup)다.
 * 바뀌면 감사기록에 한 줄 — 나이스 제출 정보 7번이 무엇에서 왔는지 되짚을 수 있게.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { projects } from '@/lib/db/schema';
import { dupTextOf } from '@/lib/consult-dup';
import type { ProjectRepository } from '../repository';
import { assertAdmin } from './shared';

export const consultDupStore: Pick<ProjectRepository, 'saveConsultDup'> = {
  async saveConsultDup(projectId, value, actor): Promise<void> {
    assertAdmin(actor, '결과서 중복설치');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select({ dup: projects.consultDup }).from(projects).where(eq(projects.id, projectId)).for('update');
      if (!old) throw new Error('현장을 찾을 수 없습니다.');
      await tx.update(projects).set({ consultDup: value }).where(eq(projects.id, projectId));
      const before = dupTextOf(old.dup ?? null);
      const after = dupTextOf(value);
      if (before !== after) {
        await writeAudit(tx, {
          projectId, actor, action: '결과서 중복설치 읽음', field: '기설치 현황',
          oldValue: before, newValue: after ?? '결과서 6번을 찾지 못함',
        });
      }
    });
  },
};

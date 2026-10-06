/**
 * 기설치 이력 엑셀 ↔ 증빙 대조 결과 (migrations/0093, 한백 지시 2026-10-06).
 *
 * 현장마다 마지막 하나 — 다시 대조하면 덮는다. 누가 언제 대조했고 몇 건을 짚었는지는
 * audit_log 에 남는다. 대조 자체는 라우트(app/api/projects/[id]/preinstall/check)가 한다.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { preinstallChecks, projects } from '@/lib/db/schema';
import { issueCount, type PreInstallCheck } from '@/lib/preinstall-check';
import type { ProjectRepository } from '../repository';
import { assertAdmin } from './shared';

/** 현장 상세가 읽는다 — 권한은 getProject 가 이미 봤다 */
export async function loadPreInstallCheck(projectId: string): Promise<PreInstallCheck | null> {
  const [row] = await getDb().select({ result: preinstallChecks.result })
    .from(preinstallChecks).where(eq(preinstallChecks.projectId, projectId)).limit(1);
  return (row?.result as PreInstallCheck | undefined) ?? null;
}

export const preinstallCheckStore: Pick<ProjectRepository, 'savePreInstallCheck'> = {
  async savePreInstallCheck(projectId, check, actor): Promise<void> {
    assertAdmin(actor, '기설치 대조');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [p] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!p) throw new Error('현장을 찾을 수 없습니다.');
      const at = new Date(check.checkedAt);
      await tx.insert(preinstallChecks)
        .values({ projectId, result: check, checkedBy: actor.name, checkedAt: at })
        .onConflictDoUpdate({
          target: preinstallChecks.projectId,
          set: { result: check, checkedBy: actor.name, checkedAt: at },
        });
      const n = issueCount(check);
      await writeAudit(tx, {
        projectId, actor,
        action: '기설치 대조',
        field: 'preinstallCheck',
        oldValue: null,
        newValue: check.problem ?? (n === 0 ? '맞음' : `짚은 것 ${n}건`),
      });
    });
  },
};

/**
 * 기설치 이력 엑셀 ↔ 증빙 대조 결과 (migrations/0093, 한백 지시 2026-10-06).
 *
 * 현장마다 마지막 하나 — 다시 대조하면 덮는다. 누가 언제 대조했고 몇 건을 짚었는지는
 * audit_log 에 남는다. 대조 자체는 라우트(app/api/projects/[id]/preinstall/check)가 한다.
 *
 * ★대조는 계약 확인의 조건이다★ (한백 지시 2026-10-07 「검증 필수」) — 판정은 lib/preinstall-check
 * preCheckBlocker 한 곳이고, 계약 확인(store/contract confirmContract)이 같은 현장 잠금 안에서 부른다.
 * 그래서 대조 저장·확인함도 그 잠금을 잡는다 — 확인과 다시 대조가 겹치면 한쪽이 다른 쪽을 반드시 본다.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { documents, preinstallChecks, projects } from '@/lib/db/schema';
import {
  CHECKED_KINDS, checkedFilesOf, issueCount, reviewCount, sameFiles, type PreInstallCheck,
} from '@/lib/preinstall-check';
import type { DocFile } from '@/types/project';
import type { ProjectRepository } from '../repository';
import { assertAdmin, type TxLike } from './shared';

const lockProject = (tx: TxLike, projectId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`hb_project:${projectId}`}))`);

/** 현장 상세가 읽는다 — 권한은 getProject 가 이미 봤다. 계약 확인은 자기 트랜잭션(tx)으로 읽는다 */
export async function loadPreInstallCheck(projectId: string, tx?: TxLike): Promise<PreInstallCheck | null> {
  const [row] = await (tx ?? getDb()).select({ result: preinstallChecks.result })
    .from(preinstallChecks).where(eq(preinstallChecks.projectId, projectId)).limit(1);
  return (row?.result as PreInstallCheck | undefined) ?? null;
}

export const preinstallCheckStore: Pick<ProjectRepository, 'savePreInstallCheck' | 'acceptPreInstallCheck'> = {
  async savePreInstallCheck(projectId, check, actor): Promise<void> {
    assertAdmin(actor, '기설치 대조');
    const db = getDb();
    await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
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
      const m = reviewCount(check);
      const said = [n > 0 ? `짚은 것 ${n}건` : null, m > 0 ? `개별 검토 ${m}건` : null].filter(Boolean).join(' · ');
      await writeAudit(tx, {
        projectId, actor,
        action: '기설치 대조',
        field: 'preinstallCheck',
        oldValue: null,
        newValue: check.problem ?? (said || '맞음'),
      });
    });
  },

  /**
   * 「확인함」 — 짚을 것·개별 검토가 남은 결과를 한백이 보고 넘긴다 · 되돌린다 (한백 지시 2026-10-07).
   *
   * ★본 결과에만 붙는다★ — 화면이 본 결과의 대조 시각(checkedAt)을 같이 보내고, 그사이 다시 대조됐으면
   * 거절한다. 안 그러면 보지 않은 새 결과를 확인한 것이 된다. 서류가 바뀐 뒤의 결과도 넘기지 않는다 —
   * 확인한 것은 그때의 서류다(그런 결과는 어차피 계약 확인을 막는다, preCheckBlocker).
   */
  async acceptPreInstallCheck(projectId, checkedAt, accept, actor): Promise<void> {
    assertAdmin(actor, '기설치 대조 확인');
    await getDb().transaction(async (tx) => {
      await lockProject(tx, projectId);
      const check = await loadPreInstallCheck(projectId, tx);
      if (!check) throw new Error('대조한 결과가 없습니다 — 먼저 대조하세요.');
      if (check.checkedAt !== checkedAt) {
        throw new Error('그사이 다시 대조됐습니다 — 새 결과를 보고 확인하세요.');
      }
      if (accept) {
        const docs = await tx.select({ kind: documents.kind, files: documents.files }).from(documents)
          .where(and(eq(documents.projectId, projectId), inArray(documents.kind, [...CHECKED_KINDS])));
        const current = checkedFilesOf(docs.map((d) => ({ kind: d.kind, files: d.files as DocFile[] })));
        if (!sameFiles(check.files, current)) {
          throw new Error('대조한 뒤 서류가 바뀌었습니다 — 다시 대조한 뒤 확인하세요.');
        }
        if (issueCount(check) + reviewCount(check) === 0) return; // 넘길 것이 없다 — 이미 통과다
      }
      if (Boolean(check.accepted) === accept) return;
      const accepted = accept ? { by: actor.name, at: new Date().toISOString() } : null;
      await tx.update(preinstallChecks)
        .set({ result: { ...check, accepted } })
        .where(eq(preinstallChecks.projectId, projectId));
      await writeAudit(tx, {
        projectId, actor,
        action: accept ? '기설치 대조 확인' : '기설치 대조 확인 취소',
        field: 'preinstallCheckAccepted',
        oldValue: check.accepted ? `${check.accepted.by} ${check.accepted.at}` : null,
        newValue: accepted ? `${accepted.by} ${accepted.at}` : null,
      });
    });
  },
};

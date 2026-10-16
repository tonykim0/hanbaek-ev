/**
 * 건축물대장 대조(주차면·주소) 결과 (migrations/0100, 한백 지시 2026-10-16). 표 이름 parking_checks 는 주차면부터 만들어서다.
 *
 * 현장마다 마지막 하나 — 다시 대조하면 덮는다. 누가 언제 대조했고 몇 건을 짚었는지는 audit_log 에 남는다.
 * 대조 자체(판독·판정)는 lib/parking-run 이 한다.
 *
 * ★대조는 계약 확인의 조건이다★ (한백 결정 「막는다」) — 판정은 lib/parking-check parkingBlocker 한 곳이고,
 * 계약 확인(store/contract confirmContract)이 같은 현장 잠금 안에서 부른다. 그래서 저장·확인함도 그 잠금을 잡는다 —
 * 확인과 다시 대조가 겹치면 한쪽이 다른 쪽을 반드시 본다(기설치 대조 store/preinstall-check 와 같다).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { documents, parkingChecks } from '@/lib/db/schema';
import {
  PARKING_SLOTS, parkingFilesOf, parkingIssueCount, sameParkingFiles, type ParkingCheck,
} from '@/lib/parking-check';
import type { DocFile } from '@/types/project';
import type { ProjectRepository } from '../repository';
import { assertAdmin, type TxLike } from './shared';

const lockProject = (tx: TxLike, projectId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`hb_project:${projectId}`}))`);

/** 현장 상세가 읽는다 — 권한은 getProject 가 이미 봤다. 계약 확인은 자기 트랜잭션(tx)으로 읽는다 */
export async function loadParkingCheck(projectId: string, tx?: TxLike): Promise<ParkingCheck | null> {
  const [row] = await (tx ?? getDb()).select({ result: parkingChecks.result })
    .from(parkingChecks).where(eq(parkingChecks.projectId, projectId)).limit(1);
  return (row?.result as ParkingCheck | undefined) ?? null;
}

export const parkingCheckStore: Pick<ProjectRepository, 'saveParkingCheck' | 'acceptParkingCheck'> = {
  async saveParkingCheck(projectId, check, actor): Promise<void> {
    assertAdmin(actor, '건축물대장 대조');
    await getDb().transaction(async (tx) => {
      await lockProject(tx, projectId);
      const at = new Date(check.checkedAt);
      await tx.insert(parkingChecks)
        .values({ projectId, result: check, checkedBy: actor.name, checkedAt: at })
        .onConflictDoUpdate({
          target: parkingChecks.projectId,
          set: { result: check, checkedBy: actor.name, checkedAt: at },
        });
      const n = parkingIssueCount(check);
      await writeAudit(tx, {
        projectId, actor,
        action: '건축물대장 대조',
        field: 'parkingCheck',
        oldValue: null,
        newValue: n > 0 ? `짚은 것 ${n}건` : `맞음${check.basis ? ` (${check.basis.value}면)` : ''}`,
      });
    });
  },

  /**
   * 「확인함」 — 짚을 것이 남은 결과를 한백이 보고 넘긴다 · 되돌린다.
   * ★본 결과에만 붙는다★ — 화면이 본 결과의 대조 시각을 같이 보내고, 그사이 다시 대조됐으면 거절한다.
   * 서류가 바뀐 뒤의 결과도 넘기지 않는다 — 확인한 것은 그때의 서류다.
   */
  async acceptParkingCheck(projectId, checkedAt, accept, actor): Promise<void> {
    assertAdmin(actor, '건축물대장 대조 확인');
    await getDb().transaction(async (tx) => {
      await lockProject(tx, projectId);
      const check = await loadParkingCheck(projectId, tx);
      if (!check) throw new Error('대조한 결과가 없습니다 — 먼저 대조하세요.');
      if (check.checkedAt !== checkedAt) {
        throw new Error('그사이 다시 대조됐습니다 — 새 결과를 보고 확인하세요.');
      }
      if (accept) {
        const docs = await tx.select({ kind: documents.kind, files: documents.files }).from(documents)
          .where(and(eq(documents.projectId, projectId), inArray(documents.kind, [...PARKING_SLOTS])));
        const current = parkingFilesOf(docs.map((d) => ({ kind: d.kind, files: d.files as DocFile[] })));
        if (!sameParkingFiles(check.files, current)) {
          throw new Error('대조한 뒤 서류가 바뀌었습니다 — 다시 대조한 뒤 확인하세요.');
        }
        if (parkingIssueCount(check) === 0) return; // 넘길 것이 없다 — 이미 통과다
      }
      if (Boolean(check.accepted) === accept) return;
      const accepted = accept ? { by: actor.name, at: new Date().toISOString() } : null;
      await tx.update(parkingChecks)
        .set({ result: { ...check, accepted } })
        .where(eq(parkingChecks.projectId, projectId));
      await writeAudit(tx, {
        projectId, actor,
        action: accept ? '건축물대장 대조 확인' : '건축물대장 대조 확인 취소',
        field: 'parkingCheckAccepted',
        oldValue: check.accepted ? `${check.accepted.by} ${check.accepted.at}` : null,
        newValue: accepted ? `${accepted.by} ${accepted.at}` : null,
      });
    });
  },
};

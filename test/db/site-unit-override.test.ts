/**
 * 현장 대당 금액 (한백 지시 2026-10-20, migrations/0102) — 케이스·라인은 그대로, 이 현장만 대당 영업비를 값으로 적는다.
 * 화면에 고치는 자리가 없어 시험도 DB 에 직접 적는다(Claude Code 로 요청받아 적는 것과 같은 길).
 * 보는 것: 상세·정산 요약·확정이 원장에 박는 금액이 같은 값을 쓰는가 · 협력사에게 적었다는 사실·사유가 안 가는가.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { USERS, viewerOf } from './kit';
import { admin, withPayableProject } from './money-kit';

const repo = getRepository();

describe('현장 대당 금액', () => {
  it('영업비를 케이스보다 10만 높게 적으면 — 상세·정산 요약·1차 확정 금액이 다 따라오고, 마진이 그만큼 준다', async () => {
    await withPayableProject(async ({ id, org }) => {
      const before = await repo.getProject(id, viewerOf(USERS.admin));
      const base = before!.lines[0].rule!;
      const qty = before!.lines[0].qty;
      const sumBefore = (await repo.listSettlements(viewerOf(USERS.admin))).find((s) => s.id === id)!;

      await getDb().update(projects)
        .set({ salesUnitOverride: base.salesUnit! + 100_000, unitOverrideNote: '시험 — 영업비 1기당 10만 높게' })
        .where(eq(projects.id, id));

      const after = await repo.getProject(id, viewerOf(USERS.admin));
      expect(after!.lines[0].rule!.salesUnit).toBe(base.salesUnit! + 100_000);
      expect(after!.lines[0].rule!.margin).toBe(base.margin! - 100_000);

      const sumAfter = (await repo.listSettlements(viewerOf(USERS.admin))).find((s) => s.id === id)!;
      expect(sumAfter.salesTotal - sumBefore.salesTotal).toBe(100_000 * qty);
      expect(sumAfter.consTotal).toBe(sumBefore.consTotal);
      expect(sumBefore.marginTotal - sumAfter.marginTotal).toBe(100_000 * qty);

      // 협력사(그 현장 영업사)는 적용된 대당 금액만 — 적었다는 사실·사유는 안 간다
      const partner = await repo.getProject(id, { role: 'sales', org });
      expect(partner!.lines[0].rule!.salesUnit).toBe(base.salesUnit! + 100_000);
      expect(partner!.project).toMatchObject({ salesUnitOverride: null, consUnitOverride: null, unitOverrideNote: null });

      // 확정이 원장에 박는 1차(70%)도 같은 계획에서 — 표와 원장이 갈리지 않는다
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], '2026-10-10', admin);
      const entry = (await repo.getProject(id, viewerOf(USERS.admin)))!.payoutEntries.find((e) => e.kind === '영업비');
      expect(entry?.amount).toBe(Math.round((base.salesUnit! + 100_000) * qty * 0.7));
    });
  });
});

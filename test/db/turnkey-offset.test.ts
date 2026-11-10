/**
 * ★턴키 현장의 영업비 초과는 시공비 잔금에서 뺀다★ (한백 지시 2026-11-10) — 표와 확정이 같은 금액을 말하는가.
 *
 * 셈 자체는 test/turnkey-offset.test.ts 가 운영의 네 현장 숫자로 본다. 여기는 그 셈이 저장소의 두 길에 똑같이
 * 들어갔는지다 — 지급관리 표(listPayoutOverview → payoutsOfDetail)와 확정(runPayoutBatch → openStepFor). 한쪽만
 * 들어가면 사람은 표의 깎인 잔금을 보고 누르는데 원장에는 깎이지 않은 금액이 박힌다.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { processes } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import { workOf } from '@/lib/payout-board';
import type { PayoutKind } from '@/types/project';
import { admin, adminView, withPayableProject } from './money-kit';

const repo = getRepository();

/** 지급관리 표가 그 현장에 세운 두 줄 */
async function boardOf(id: string) {
  const { plans } = await repo.listPayoutOverview(adminView);
  const of = (kind: PayoutKind) => {
    const row = plans.find((p) => p.projectId === id && p.kind === kind);
    if (!row) throw new Error(`${id} ${kind} 줄이 표에 없다`);
    return workOf(row);
  };
  return { sales: of('영업비'), cons: of('시공비') };
}

async function ledgerOf(id: string, kind: PayoutKind, category: '1차' | '2차') {
  const d = await repo.getProject(id, adminView);
  return d!.payoutEntries.find((e) => e.kind === kind && e.category === category)?.amount ?? null;
}

/** 영업비 1차(70%)가 나간 뒤 계획이 절반으로 줄어든 자리 — 대수가 줄거나 단가가 바뀐 현장(신정이펜 · 화진금봉5차)의 모양 */
async function overPaySales(id: string): Promise<number> {
  await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], '2097-05-10', admin);
  const { sales } = await boardOf(id);
  const cut = Math.round(sales.plan * 0.5);
  await repo.addPayoutEntries(id, [{
    kind: '영업비', category: '차감', amount: -cut, step: null, at: '2097-05-11', note: '시험 — 계획이 줄었다',
  }], admin);
  const over = sales.confirmed - (sales.plan - cut);
  expect(over).toBeGreaterThan(0);
  // 시공비 1차 · 2차를 여는 두 사실 — 설치완료 · 준공완료
  await getDb().update(processes)
    .set({ installConfirmedAt: '2097-05-12', completeDoneAt: '2097-05-20' })
    .where(eq(processes.projectId, id));
  return over;
}

describe('턴키 상계 — 지급관리 표와 확정이 같은 잔금을 말한다', () => {
  it('영업비가 더 나간 턴키 현장: 영업비는 지급 완료, 시공비 1차 · 2차는 표에 적힌 그 금액으로 원장에 박힌다', async () => {
    await withPayableProject(async ({ id }) => {
      const over = await overPaySales(id);

      const before = await boardOf(id);
      expect(before.sales.state).toBe('지급 완료'); // 「초과 — 회수·차감 필요」가 아니다
      expect(before.sales.crossOffset).toBe(over);
      expect(before.cons.crossOffset).toBe(-over);
      expect(before.cons.due).toBe(before.cons.plan - over);
      expect(before.cons.open?.no).toBe(1);

      await repo.runPayoutBatch([{ projectId: id, kind: '시공비' }], '2097-05-25', admin);
      expect(await ledgerOf(id, '시공비', '1차')).toBe(before.cons.open!.amount);

      const mid = await boardOf(id);
      expect(mid.cons.open?.no).toBe(2);
      await repo.runPayoutBatch([{ projectId: id, kind: '시공비' }], '2097-06-10', admin);
      expect(await ledgerOf(id, '시공비', '2차')).toBe(mid.cons.open!.amount);

      const after = await boardOf(id);
      expect(after.cons.confirmed).toBe(after.cons.plan - over); // 시공비는 영업비가 더 나간 만큼 덜 나갔다
      expect(after.cons.state).toBe('지급 완료');
      expect(after.sales.state).toBe('지급 완료'); // 깎인 잔금이 나간 뒤에도 영업비가 「초과」로 되살아나지 않는다
    }, { turnkey: true });
  });

  it('턴키가 아니면 시공비는 그대로다 — 딴 회사의 돈이라 영업비는 「초과」로 남는다', async () => {
    await withPayableProject(async ({ id }) => {
      await overPaySales(id);
      const { sales, cons } = await boardOf(id);
      expect(sales.state).toBe('초과');
      expect(cons.crossOffset).toBe(0);
      expect(cons.due).toBe(cons.plan);
    });
  });
});

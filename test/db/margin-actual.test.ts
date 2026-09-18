/**
 * 한백 몫은 ★받은 돈★으로 센다 — 한백 지시 2026-09-18.
 *
 * 「익산 예다음아르띠에에서 정산규칙은 1기당 150 받는거지만 실제로는 우리는 190을 받아.
 *  이런 경우들이 있어 — 정산규칙과 다르고 중간에 우리가 더 마진을 가져가는 경우.」
 *
 * 전에는 단가 케이스에 적힌 마진을 그대로 더했다(계획). 그 차액은 협력사 몫이 아니라
 * 한백이 더 가져가는 마진인데 장부에 아예 안 나타났다 — 그 현장만 880만.
 *
 * ★수금이 없으면 옛 값과 한 원도 다르지 않아야 한다★ — 기성 단계의 합이 받는 단가와
 * 같게 강제돼 있어서다(checkSettlementSteps). 프로덕션 173건으로도 대조했다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { admin, withPayableProject } from './money-kit';

const repo = getRepository();
const sumOf = async (id: string) => {
  const rows = await repo.listSettlements(admin);
  return rows.find((s) => s.id === id)!;
};

/* 1차(착공)를 연다 — 열린 차수에만 수금을 찍을 수 있다(store 가 막는다) */
const openFirst = async (id: string) => {
  await repo.updateProcess(id, { startActualDate: '2026-09-01' }, admin);
};

describe('한백 몫 = 받을 기성 − 내려줄 지급', () => {
  it('★수금이 없으면 계획 마진 그대로다★ — 이 개편으로 숫자가 안 움직인다', async () => {
    await withPayableProject(async ({ id }) => {
      const s = await sumOf(id);
      const plan = s.planTotal - (s.safetyFee ?? 0) - s.salesTotal - s.consTotal;
      expect(s.marginTotal).toBe(plan + (s.safetyFee ?? 0));
    });
  });

  it('★계획보다 더 받으면 그만큼 마진이 는다★ — 익산 사례', async () => {
    await withPayableProject(async ({ id }) => {
      await openFirst(id);
      const before = await sumOf(id);
      const step = before.steps.find((x) => x.state === 'open')!;
      const extra = 400_000;

      await repo.setSettlementCollected(
        id, step.no, { at: '2026-09-18', amount: (step.planAmount ?? 0) + extra }, admin
      );

      const after = await sumOf(id);
      expect(after.marginTotal).toBe(before.marginTotal + extra);
      // 협력사에게 내려줄 계획은 그대로다 — 더 받은 것은 온전히 한백 몫이다
      expect(after.salesTotal).toBe(before.salesTotal);
      expect(after.consTotal).toBe(before.consTotal);
    });
  });

  it('덜 받으면 그만큼 준다 — 같은 식이 양쪽을 다 답한다', async () => {
    await withPayableProject(async ({ id }) => {
      await openFirst(id);
      const before = await sumOf(id);
      const step = before.steps.find((x) => x.state === 'open' && (x.planAmount ?? 0) > 200_000)
        ?? before.steps.find((x) => x.state === 'open')!;
      await repo.setSettlementCollected(
        id, step.no, { at: '2026-09-18', amount: Math.max(0, (step.planAmount ?? 0) - 200_000) }, admin
      );
      const drop = (step.planAmount ?? 0) - Math.max(0, (step.planAmount ?? 0) - 200_000);
      expect((await sumOf(id)).marginTotal).toBe(before.marginTotal - drop);
    });
  });

  it('금액을 안 적고 수금일만 찍으면 계획액대로 받은 것이다 — 마진이 안 움직인다', async () => {
    await withPayableProject(async ({ id }) => {
      await openFirst(id);
      const before = await sumOf(id);
      const step = before.steps.find((x) => x.state === 'open')!;
      await repo.setSettlementCollected(id, step.no, { at: '2026-09-18', amount: null }, admin);
      expect((await sumOf(id)).marginTotal).toBe(before.marginTotal);
    });
  });
});

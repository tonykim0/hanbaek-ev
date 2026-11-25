/**
 * 단가 케이스의 나눔 갈래 — 같은 칸 · 같은 시작에 받는 단가는 하나, 나눔(영업 · 시공 · 마진)이 둘
 * (2026-11-25 한백 「그냥 케이스가 2개야」 — 현대엔지니어링 자체투자 11/18 시기. 실제 금액 · 마진은 대외비라 적지 않는다).
 *
 * 저장소가 갈래를 받고, 나눔까지 같은 것 · 받는 단가가 다른 것은 여전히 중복으로 거절하고, 갈래끼리 기성 단계(운영사에게
 * 받는 차례)가 다르면 거절한다 — 추가와 되살리기 둘 다. 금액은 이미 저장소에 있는 정책 규칙 하나를 빌려 나눔만 옮긴다
 * (운영사 금액을 새로 적지 않는다). 다른 기성은 「기성 미정」(빈 단계)으로 만든다 — 시험이 정산 규칙 행을 새로 남기지 않게.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { plNewRules } from '@/lib/pricing-policy-plhec-h2';
import type { NewPricingRule } from '@/types/project';
import { RUN, USERS, actorOf } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const TAG = `[시험 ${RUN} 나눔]`;

/** 영업에서 move 만큼 떼어 마진으로 — 받는 단가는 그대로다. 시기가 멀어 있는 케이스와 겹치지 않는다 */
function testRule(name: string, move: number): NewPricingRule {
  const base = plNewRules()[0];
  return {
    ...base, startDate: '2033년 1월 1일', bizYear: 2033, caseName: `${TAG} ${name} ${base.caseName}`,
    salesUnit: base.salesUnit - move, margin: base.margin + move,
  };
}

async function cleanup(): Promise<void> {
  for (const r of (await repo.listPricingRules(admin)).filter((x) => x.caseName.startsWith(TAG))) {
    await repo.deletePricingRule(r.id, admin).catch(() => undefined);
  }
}

describe('단가 케이스 나눔 갈래', () => {
  it('받는 단가가 같으면 나눔이 다른 케이스가 같은 칸 · 같은 시작에 나란히 선다', async () => {
    await cleanup();
    try {
      const a = await repo.addPricingRule(testRule('갈래A', 0), admin);
      const b = await repo.addPricingRule(testRule('갈래B', 100_000), admin);
      const mine = new Map((await repo.listPricingRules(admin)).map((r) => [r.id, r]));
      expect(mine.get(a)?.margin).toBe(testRule('', 0).margin);
      expect(mine.get(b)?.margin).toBe(testRule('', 100_000).margin);
      // 둘이 같은 기성 단계(정산 규칙 한 행)를 쓴다
      expect(mine.get(b)?.defaultSettlementRuleId).toBe(mine.get(a)?.defaultSettlementRuleId);

      // 나눔까지 같으면 중복 · 받는 단가가 다르면 중복
      await expect(repo.addPricingRule(testRule('같은 나눔', 100_000), admin)).rejects.toThrow(/같은 조건/);
      const 더받음 = testRule('받는 단가 다름', 0);
      await expect(repo.addPricingRule({ ...더받음, salesUnit: 더받음.salesUnit + 50_000 }, admin)).rejects.toThrow(/같은 조건/);

      // 갈래끼리 기성 단계가 다르면 거절한다
      await expect(
        repo.addPricingRule({ ...testRule('기성 다름', 200_000), settlementSteps: [] }, admin)
      ).rejects.toThrow(/기성 단계가 다릅니다/);
    } finally {
      await cleanup();
    }
  });

  it('되살릴 때도 갈래의 기성 단계를 본다', async () => {
    await cleanup();
    try {
      const a = await repo.addPricingRule(testRule('갈래A', 0), admin);
      await repo.setPricingRuleActive(a, false, admin);
      // A 가 쉬는 동안 기성이 다른 갈래가 섰다 — A 를 되살리면 같은 칸에 받는 차례가 둘이 된다
      await repo.addPricingRule({ ...testRule('기성 미정 갈래', 150_000), settlementSteps: [] }, admin);
      await expect(repo.setPricingRuleActive(a, true, admin)).rejects.toThrow(/기성 단계가 다릅니다/);
      expect((await repo.listPricingRules(admin)).find((r) => r.id === a)?.active).toBe(false);
    } finally {
      await cleanup();
    }
  });
});

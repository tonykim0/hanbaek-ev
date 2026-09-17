/**
 * 단가 케이스를 고치는 문 — 굳은 현장이 참조하면 잠긴다 (한백 물음 2026-09-17).
 *
 * 「단가표는 업데이트 되는데 케이스도 같이 업데이트 되고 있나? 이건 협력사 정산관리 할 때
 * 적용되는 부분이라」에서 나왔다. 답은 ★흐른다★ — 라인은 금액을 복사하지 않고 케이스를
 * 참조만 하므로(schema 의 「참조만 한다」 주석) 케이스를 고치면 그 현장의 지급 계획·잔액이
 * 소급해서 같이 움직인다. 그래서 위험하고, 그래서 저장소에 문이 있다: 지급조건이 확정된
 * 현장이 참조 중이면 updatePricingRule 이 거절한다(lib/data/store/pricing.ts).
 *
 * ★그 문에 그물이 없었다★ — 감사에서 나왔다(2026-09-17). test/ 전체에 updatePricingRule
 * 이 한 번도 안 나왔다. 잠금 시험은 setLineFacts(대수)·setProjectAxes(축) 쪽만 있어서
 * (test/db/project-facts.test.ts), 정작 한백이 물은 경로가 밖에 있었다. 누가 lockedRefs
 * 검사를 지워도 초록이 유지된다.
 *
 * ★시험용 케이스를 따로 만들어 쓴다★ — 개발 DB 의 실제 케이스를 고치면 다른 시험과 화면이
 * 같이 흔들린다. 픽스처가 고른 케이스를 베껴 축만 같게 만들고, 끝나면 지정을 풀고 지운다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { actorOf, USERS } from './kit';
import { adminView, withPayableProject } from './money-kit';
import type { NewPricingRule, PricingRule } from '@/types/project';

const repo = getRepository();
const admin = actorOf(USERS.admin);

/** 픽스처가 붙인 케이스를 베껴 시험 전용 한 벌을 만든다 — 축은 같고 이름·시작만 다르다 */
function cloneOf(src: PricingRule, tag: string): NewPricingRule {
  return {
    caseName: `시험 케이스 ${tag}`,
    cpo: src.cpo,
    bizType: src.bizType,
    powerType: src.powerType,
    termYears: [...src.termYears],
    bldgTypes: [...src.bldgTypes],
    replType: src.replType,
    channel: src.channel,
    bizYear: src.bizYear,
    /*
     * ★시작을 멀리 둔다★ — 축이 같고 시작까지 같으면 저장소가 「같은 조건을 덮는 케이스가
     * 이미 있습니다」로 거절한다(addPricingRule 의 duplicateOf). 베낀 것이라 축은 같아야 하니
     * 시작으로 가른다. 시험이 끝나면 지우므로 화면에 남지 않는다.
     */
    startDate: `2099년 1월 1일 (${tag})`,
    salesUnit: src.salesUnit,
    consUnit: src.consUnit,
    margin: src.margin,
    supplyItems: null,
    promo: null,
    promoExtend: null,
    chargeRate: null,
    installTerms: null,
    otherSupport: null,
    coexistTerms: null,
    miscTerms: null,
    supervisionBearer: src.supervisionBearer,
    safetyFeeBearer: src.safetyFeeBearer,
    note: null,
    /* 준공마감에 잔액 한 단계 — 받는 총액을 그대로 따라오므로 금액 검사와 안 부딪힌다 */
    settlementSteps: [{ trigger: '준공마감', basis: { kind: '잔액' } }],
  };
}

/** 시험 전용 케이스를 만들어 라인에 붙이고, 끝나면 지정을 풀고 지운다 */
async function withOwnRule<T>(
  lineId: string, srcRuleId: string, tag: string,
  fn: (ruleId: string) => Promise<T>
): Promise<T> {
  const src = (await repo.listPricingRules(admin)).find((r) => r.id === srcRuleId);
  if (!src) throw new Error(`픽스처 케이스 ${srcRuleId} 를 못 찾았다`);
  const id = await repo.addPricingRule(cloneOf(src, tag), admin);
  try {
    await repo.setLinePricing(lineId, id, admin);
    return await fn(id);
  } finally {
    await repo.setLinePricing(lineId, srcRuleId, admin).catch(() => undefined);
    await repo.deletePricingRule(id, admin).catch(() => undefined);
  }
}

describe('단가 케이스 수정의 문', () => {
  it('★지급조건이 확정된 현장이 참조하면 거절한다★ — 고치면 그 현장의 지급이 소급해 움직인다', async () => {
    await withPayableProject(async ({ id, lineId, ruleId }) => {
      await withOwnRule(lineId, ruleId, `잠금-${id}`, async (ownId) => {
        const src = (await repo.listPricingRules(admin)).find((r) => r.id === ownId)!;
        const bumped = { ...cloneOf(src, `잠금-${id}`), salesUnit: src.salesUnit + 100_000 };

        /* 안 굳었으면 고쳐진다 — 문이 늘 닫혀 있는 것이 아니라는 것부터 못 박는다 */
        await repo.updatePricingRule(ownId, bumped, admin);
        expect((await repo.listPricingRules(admin)).find((r) => r.id === ownId)!.salesUnit)
          .toBe(src.salesUnit + 100_000);

        await repo.setPayoutTermsConfirmed(id, true, admin);
        try {
          await expect(repo.updatePricingRule(ownId, bumped, admin)).rejects.toThrow(/지급조건/);
        } finally {
          // 풀면 다시 고칠 수 있다 — 되돌릴 길을 같이 둔다(화면 규칙 7)
          await repo.setPayoutTermsConfirmed(id, false, admin);
        }
        await repo.updatePricingRule(ownId, { ...bumped, salesUnit: src.salesUnit }, admin);
        expect((await repo.listPricingRules(admin)).find((r) => r.id === ownId)!.salesUnit)
          .toBe(src.salesUnit);
      });
    });
  });

  it('★케이스를 고치면 그 현장의 지급 계획이 따라 움직인다★ — 라인은 금액을 복사하지 않는다', async () => {
    await withPayableProject(async ({ id, lineId, ruleId }) => {
      await withOwnRule(lineId, ruleId, `전파-${id}`, async (ownId) => {
        const before = (await repo.getProject(id, adminView))!.lines[0].rule!;
        const qty = (await repo.getProject(id, adminView))!.lines[0].qty;

        const next = {
          ...cloneOf(before as PricingRule, `전파-${id}`),
          salesUnit: before.salesUnit! + 50_000,
          consUnit: before.consUnit! - 50_000,
        };
        await repo.updatePricingRule(ownId, next, admin);

        const after = (await repo.getProject(id, adminView))!.lines[0].rule!;
        expect(after.salesUnit).toBe(before.salesUnit! + 50_000);
        expect(after.consUnit).toBe(before.consUnit! - 50_000);
        /* 받는 총액이 그대로면 기성도 그대로여야 한다 — 영업↔시공 이동뿐이니까 */
        expect(after.salesUnit! + after.consUnit! + after.margin!)
          .toBe(before.salesUnit! + before.consUnit! + before.margin!);
        expect(qty).toBeGreaterThan(0);
      });
    });
  });
});

/**
 * 같은 단가 케이스를 동시에 추가하면 하나만 만들어진다 — 감사 2026-09-04 L14.
 *
 * 중복 판정(duplicateOf)이 트랜잭션 밖에서 돌고, id 충돌(23505)이 나면 -2 접미사로 다시 넣었다 — 그래서 두
 * 요청이 겹치면 둘 다 「중복 없음」을 보고 하나는 id 만 바꿔 들어가, 같은 칸을 덮는 케이스 두 벌이 생겼다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { plNewRules } from '@/lib/pricing-policy-plhec-h2';
import type { NewPricingRule } from '@/types/project';
import { RUN, USERS, actorOf } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const TAG = `[시험 ${RUN}]`;

/** 실제 정책의 규칙 하나를 빌려 시기·이름만 시험용으로 — 축은 실제와 같고 시기가 달라 기존 케이스와 겹치지 않는다 */
function testRule(): NewPricingRule {
  const base = plNewRules()[0];
  return { ...base, caseName: `${TAG} ${base.caseName}`, startDate: '2031년 1월 1일 ~ 12월 31일', bizYear: 2031 };
}

async function cleanup(): Promise<void> {
  for (const r of (await repo.listPricingRules(admin)).filter((x) => x.caseName.startsWith(TAG))) {
    await repo.deletePricingRule(r.id, admin).catch(() => undefined);
  }
}

describe('단가 케이스 동시 추가', () => {
  it('L14 — 같은 입력을 동시에 넣으면 하나만 만들어지고 다른 하나는 「같은 조건」으로 거절된다', async () => {
    await cleanup();
    try {
      const input = testRule();
      const results = await Promise.allSettled([1, 2].map(() => repo.addPricingRule(input, admin)));
      const made = (await repo.listPricingRules(admin)).filter((x) => x.caseName.startsWith(TAG));
      expect(made.length, '만들어진 케이스 수').toBe(1);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      expect(String(rejected?.reason?.message)).toMatch(/같은 조건/);
    } finally {
      await cleanup();
    }
  });
});

/**
 * 단가 케이스의 설치위치 — 실내 · 실외로 받는 단가가 갈리는 칸(2026-11-24 나이스 자체투자 옥내 · 옥외).
 *
 * 저장 · 읽기가 한 바퀴 돌고, 같은 시기에 실내 · 실외 케이스가 나란히 서고, 구분 없는 케이스는 둘 다와 겹쳐
 * 저장소가 거절한다(추가 · 고치기 둘 다). 라인 축(listLineAxes)이 현장의 설치위치를 싣는지도 본다 — 반영
 * 스크립트가 그것으로 「실외 현장이 붙은 케이스를 실내로」를 막는다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { plNewRules } from '@/lib/pricing-policy-plhec-h2';
import type { CaseLoc, NewPricingRule } from '@/types/project';
import { RUN, USERS, actorOf, withProject } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const TAG = `[시험 ${RUN}]`;

/** 실제 정책의 규칙 하나를 빌려 시기 · 이름만 시험용으로 — 시기가 멀어 있는 케이스와 겹치지 않는다 */
function testRule(installLoc: CaseLoc | null): NewPricingRule {
  const base = plNewRules()[0];
  return {
    ...base, installLoc, startDate: '2032년 1월 1일', bizYear: 2032,
    caseName: `${TAG} ${installLoc ?? '구분 없음'} ${base.caseName}`,
  };
}

async function cleanup(): Promise<void> {
  for (const r of (await repo.listPricingRules(admin)).filter((x) => x.caseName.startsWith(TAG))) {
    await repo.deletePricingRule(r.id, admin).catch(() => undefined);
  }
}

describe('단가 케이스 설치위치', () => {
  it('실내 · 실외는 같은 시기에 나란히 서고, 구분 없는 케이스는 겹쳐 거절된다', async () => {
    await cleanup();
    try {
      const inId = await repo.addPricingRule(testRule('실내'), admin);
      const outId = await repo.addPricingRule(testRule('실외'), admin);
      const mine = new Map((await repo.listPricingRules(admin)).map((r) => [r.id, r]));
      expect(mine.get(inId)?.installLoc).toBe('실내');
      expect(mine.get(outId)?.installLoc).toBe('실외');

      await expect(repo.addPricingRule(testRule(null), admin)).rejects.toThrow(/같은 조건/);

      // 고치기로 구분을 지우면 다른 쪽과 겹친다 — 저장소가 같은 판정을 한다
      const { id: _id, active: _active, defaultSettlementRuleId: _s, ...rest } = mine.get(inId)!;
      await expect(
        repo.updatePricingRule(inId, { ...rest, installLoc: null, settlementSteps: testRule(null).settlementSteps }, admin)
      ).rejects.toThrow(/같은 조건/);
      expect((await repo.listPricingRules(admin)).find((r) => r.id === inId)?.installLoc).toBe('실내');
    } finally {
      await cleanup();
    }
  });

  it('라인 축이 현장의 설치위치를 싣는다', async () => {
    await withProject(async (projectId) => {
      const axes = (await repo.listLineAxes(admin)).filter((a) => a.projectId === projectId);
      expect(axes.length).toBeGreaterThan(0);
      for (const a of axes) expect(a.installLoc).toBe('실외');
    }, { installLoc: '실외' });
  });
});

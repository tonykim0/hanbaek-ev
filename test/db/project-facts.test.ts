/**
 * 잘못 들어간 값을 고치는 문 — 접수 판독이 틀렸을 때 (한백 지적 2026-09-10).
 *
 * 접수는 사람이 아니라 판독이 채운다(lib/intake-auto). 잘 맞지만 틀릴 때가 있고, 틀린 채로
 * 굳으면 고칠 자리가 없었다 — HB-2026-164 는 계약대수가 ★732 대★로 들어왔다(그 현장
 * 주차면수가 728 면이라 그 근처 숫자를 집었다). 접수를 다시 받는 수밖에 없었다.
 *
 * 여기서 보는 것은 ★문이 어디까지 열리는가★다: 설명하는 값은 열리고, 흐름·축을 바꾸는
 * 값은 안 열리고, 돈에 붙은 값(대수)은 굳은 현장에서 잠긴다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { actorOf, USERS, withProject } from './kit';
import { withPayableProject } from './money-kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const partner = actorOf(USERS.ecoelec);

const lineOf = async (id: string) => (await repo.getProject(id, { role: 'admin', org: null }))!.lines[0];
const factOf = async (id: string) => (await repo.getProject(id, { role: 'admin', org: null }))!.project;

describe('현장 정보 고치기', () => {
  it('설명하는 값을 고친다 — 보낸 칸만 바뀌고 나머지는 그대로다', async () => {
    await withProject(async (id) => {
      await repo.setProjectFacts(id, { parkTotal: 728, mgr: '김한백' }, admin);
      const p = await factOf(id);
      expect(p.parkTotal).toBe(728);
      expect(p.mgr).toBe('김한백');
      expect(p.bldgType).toBe('공동주택'); // 안 보낸 칸은 안 건드린다
    });
  });

  it('빈 문자열은 null 이다 — 「비웠다」와 「공백 한 칸」이 갈리면 화면에서 구별이 안 된다', async () => {
    await withProject(async (id) => {
      await repo.setProjectFacts(id, { mgr: '  ' }, admin);
      expect((await factOf(id)).mgr).toBeNull();
    }, { mgr: '홍길동' });
  });

  it('고를 값이 정해진 칸은 목록 밖을 거절한다', async () => {
    await withProject(async (id) => {
      await expect(repo.setProjectFacts(id, { bldgType: '우주정거장' as never }, admin))
        .rejects.toThrow(/건축물유형/);
      await expect(repo.setProjectFacts(id, { contractParty: '누구' as never }, admin))
        .rejects.toThrow(/계약주체/);
      await expect(repo.setProjectFacts(id, { parkTotal: -1 }, admin))
        .rejects.toThrow(/주차면수/);
    });
  });

  it('★협력사는 못 고친다★ — 자기 현장이어도', async () => {
    await withProject(async (id) => {
      await expect(repo.setProjectFacts(id, { mgr: '침입' }, partner)).rejects.toThrow();
      expect((await factOf(id)).mgr).toBeNull();
    });
  });
});

describe('계약 라인 고치기', () => {
  it('대수를 고친다 — 판독이 732 대로 읽어 넣은 그 자리다', async () => {
    await withProject(async (id) => {
      const before = await lineOf(id);
      await repo.setLineFacts(before.id, { qty: 6 }, admin);
      expect((await lineOf(id)).qty).toBe(6);
    });
  });

  it('★대수는 축이 아니라 곱하는 수다★ — 단가 지정이 남는다', async () => {
    await withProject(async (id) => {
      const line = await lineOf(id);
      const [rule] = await repo.listPricingRules(admin);
      await repo.setLinePricing(line.id, rule.id, admin);
      await repo.setLineFacts(line.id, { qty: 9 }, admin);
      const after = await lineOf(id);
      expect(after.qty).toBe(9);
      expect(after.pricingRuleId).toBe(rule.id);
    });
  });

  it('★연수는 축이다★ — 고치면 단가 지정이 풀린다 (7년과 10년은 다른 케이스다)', async () => {
    await withProject(async (id) => {
      const line = await lineOf(id);
      const [rule] = await repo.listPricingRules(admin);
      await repo.setLinePricing(line.id, rule.id, admin);
      await repo.setLineFacts(line.id, { termYears: 10 }, admin);
      const after = await lineOf(id);
      expect(after.termYears).toBe(10);
      expect(after.pricingRuleId).toBeNull();
    });
  });

  it('아무 연수나 받지 않는다 · 0대도 안 된다', async () => {
    await withProject(async (id) => {
      const line = await lineOf(id);
      await expect(repo.setLineFacts(line.id, { termYears: 8 }, admin)).rejects.toThrow(/계약연수/);
      await expect(repo.setLineFacts(line.id, { qty: 0 }, admin)).rejects.toThrow(/계약대수/);
    });
  });

  /*
   * 확정은 단가·정산 규칙이 다 있어야 걸린다(payouts.ts setPayoutTermsConfirmed) —
   * 그래서 빈 현장이 아니라 지급이 열린 현장(withPayableProject)으로 시험한다.
   */
  it('★지급조건이 확정되면 잠긴다★ — 대수는 지급·기성 계획의 곱하는 수다', async () => {
    await withPayableProject(async ({ id, lineId }) => {
      await repo.setPayoutTermsConfirmed(id, true, admin);
      await expect(repo.setLineFacts(lineId, { qty: 3 }, admin)).rejects.toThrow(/지급조건/);
      // 풀면 다시 고칠 수 있다 — 되돌릴 길을 같이 둔다(화면 규칙 7)
      await repo.setPayoutTermsConfirmed(id, false, admin);
      await repo.setLineFacts(lineId, { qty: 3 }, admin);
      expect((await lineOf(id)).qty).toBe(3);
    });
  });

  it('★협력사는 못 고친다★', async () => {
    await withProject(async (id) => {
      const line = await lineOf(id);
      await expect(repo.setLineFacts(line.id, { qty: 99 }, partner)).rejects.toThrow();
    });
  });
});

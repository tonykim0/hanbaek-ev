/**
 * 기성 청구의 문 — 조건이 찬 다음 달부터 청구하고, 청구한 것만 받는다 (한백 지시 2026-11-02).
 *
 * 화면이 단추를 감춰도 라우트는 직접 부를 수 있다 — 순서(청구 → 수금)와 날(익월)은 저장소가 막아야 한다.
 * 일괄 청구는 전부 되거나 전부 안 된다: 반쯤 기록된 청구는 어디까지 했는지 알 수 없다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { today } from '@/lib/date';
import { POST as claimPOST } from '@/app/api/receivables/claim/route';
import { admin, adminView, withPayableProject } from './money-kit';
import { USERS, call, signIn, withProject } from './kit';

const repo = getRepository();
const stepOf = async (id: string, no: 1 | 2 | 3) =>
  (await repo.getProject(id, adminView))!.admin!.steps.find((s) => s.no === no)!;

describe('차수 — 청구가 수금 앞에 선다', () => {
  it('청구하지 않은 차수에는 수금을 못 적는다', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.updateProcess(id, { startActualDate: '2026-09-01' }, admin);
      expect((await stepOf(id, 1)).state).toBe('open');
      await expect(repo.setSettlementCollected(id, 1, { at: '2026-10-20', amount: null }, admin))
        .rejects.toThrow(/청구를 먼저/);
    });
  });

  it('조건이 찬 달에는 청구하지 못한다 — 다음 달 1일부터', async () => {
    await withPayableProject(async ({ id }) => {
      const now = today();
      await repo.updateProcess(id, { startActualDate: now }, admin);
      const s = await stepOf(id, 1);
      expect(s.state).toBe('scheduled');
      await expect(repo.setSettlementClaimed(id, 1, now, admin)).rejects.toThrow(/부터 청구할 수 있습니다/);
    });
  });

  it('청구 → 수금 → (수금 남은 채 청구 취소는 거절) → 수금 되돌리기 → 청구 취소', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.updateProcess(id, { startActualDate: '2026-09-01' }, admin);
      await repo.setSettlementClaimed(id, 1, '2026-10-05', admin);
      expect((await stepOf(id, 1)).state).toBe('claimed');

      await expect(repo.setSettlementCollected(id, 1, { at: '2026-10-01', amount: null }, admin))
        .rejects.toThrow(/앞설 수 없/);
      await repo.setSettlementCollected(id, 1, { at: '2026-10-20', amount: null }, admin);
      expect((await stepOf(id, 1)).state).toBe('collected');

      await expect(repo.setSettlementClaimed(id, 1, null, admin)).rejects.toThrow(/수금을 먼저 되돌려야/);
      await repo.setSettlementCollected(id, 1, null, admin);
      await repo.setSettlementClaimed(id, 1, null, admin);
      expect((await stepOf(id, 1)).state).toBe('open');
    });
  });
});

describe('일괄 청구 — 기성관리 표의 체크 → 청구일 하나', () => {
  it('하나라도 안 되면 하나도 안 적힌다', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.updateProcess(id, { startActualDate: '2026-09-01' }, admin);
      // 2차(준공마감)는 조건 대기다 — 섞어 보내면 1차까지 같이 거절된다
      await expect(repo.claimReceivables(
        [{ projectId: id, part: 1 }, { projectId: id, part: 2 }], '2026-10-05', admin
      )).rejects.toThrow(/조건이 차지 않았/);
      expect((await stepOf(id, 1)).claimedAt).toBeNull();

      const res = await repo.claimReceivables([{ projectId: id, part: 1 }], '2026-10-05', admin);
      expect(res.count).toBe(1);
      expect(res.total).toBe((await stepOf(id, 1)).planAmount);
      expect((await stepOf(id, 1)).claimedAt).toBe('2026-10-05');

      // 이미 청구한 것을 다시 보내면 거절한다 — 날 고치기는 기성 탭에서 한 차수로
      await expect(repo.claimReceivables([{ projectId: id, part: 1 }], '2026-10-06', admin))
        .rejects.toThrow(/이미 청구/);
    });
  });

  it('라우트 — 한백 관리자만, 본문이 틀리면 400', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.updateProcess(id, { startActualDate: '2026-09-01' }, admin);
      const body = { at: '2026-10-05', items: [{ projectId: id, part: 1 }] };

      await signIn(USERS.navy);
      expect((await call(claimPOST, { body })).status).toBe(403);
      await signIn(USERS.viewer);
      expect((await call(claimPOST, { body })).status).toBe(403);

      await signIn(USERS.admin);
      expect((await call(claimPOST, { body: { at: '2026/10/05', items: body.items } })).status).toBe(400);
      expect((await call(claimPOST, { body: { at: body.at, items: [{ projectId: id, part: 4 }] } })).status).toBe(400);
      const ok = await call(claimPOST, { body });
      expect(ok.status).toBe(200);
      expect((await stepOf(id, 1)).state).toBe('claimed');
    });
  });
});

describe('점검수수료 — 트리거가 없는 돈도 청구 뒤에 받는다', () => {
  it('청구 없이 수금일을 적으면 거절 · 청구하면 받는다 · 일괄 청구에도 실린다', async () => {
    await withProject(async (id) => {
      await repo.setSafetyFee(id, { amount: 450_000 }, admin);
      await expect(repo.setSafetyFee(id, { collectedAt: '2026-10-20' }, admin)).rejects.toThrow(/청구일을 먼저/);

      await repo.claimReceivables([{ projectId: id, part: 'fee' }], '2026-10-05', admin);
      let adm = (await repo.getProject(id, adminView))!.admin!;
      expect(adm.safetyFeeClaimedAt).toBe('2026-10-05');

      await repo.setSafetyFee(id, { collectedAt: '2026-10-20' }, admin);
      await expect(repo.setSafetyFee(id, { claimedAt: null }, admin)).rejects.toThrow(/수금을 먼저 되돌려야/);

      // 금액을 지우면 청구·수금 기록도 같이 지워진다
      await repo.setSafetyFee(id, { amount: null }, admin);
      adm = (await repo.getProject(id, adminView))!.admin!;
      expect([adm.safetyFee, adm.safetyFeeClaimedAt, adm.safetyFeeCollectedAt]).toEqual([null, null, null]);
    }, { cpo: 'SK일렉링크' });
  });
});

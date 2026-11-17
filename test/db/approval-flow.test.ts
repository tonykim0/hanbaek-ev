/**
 * 기후부 승인 — 환경부 승인일을 따라 단계가 오가고, 잘못 넣은 승인은 무른다 (한백 지시 2026-11-17).
 *
 *   「계약관리 칸반에 기후부 승인이라는 단계를 하나 더 만들어줘 행위신고 전에」
 *   「환경부 승인일 잘못 입력해서 승인나지 않았는데 취소해야할 경우가 있어. 이거에 대한 로직도 넣어줘」
 *
 * 판정(게이트 · 지나는 칸 · 취소를 막는 것)은 test/process.test.ts 가 본다. 여기는 저장소의 문이다 —
 * 날짜를 적는 길(/process)이 단계를 옮기고 알림을 거두는가, 라우트를 직접 불러도 막히는가.
 *
 * 픽스처는 지급이 열린 자체투자 현장(money-kit)을 환경부 사업으로 바꿔 쓴다 — 계약이 끝나야 공정을 옮길 수 있다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { POST as processPOST } from '@/app/api/projects/[id]/process/route';
import { POST as statusPOST } from '@/app/api/projects/[id]/status/route';
import { POST as readPOST } from '@/app/api/notifications/read/route';
import { admin, adminView, withPayableProject } from './money-kit';
import { USERS, call, signIn, withProject } from './kit';

const repo = getRepository();
const statusOf = async (id: string) => (await repo.getProject(id, adminView))!.process.status;
const setDate = (id: string, envApprovalDate: string | null) =>
  call(processPOST, { params: { id }, body: { envApprovalDate } });
const move = (id: string, status: string) => call(statusPOST, { params: { id }, body: { status } });

/** 계약서를 낸 환경부 사업 현장 — 승인을 기다리는 자리 */
async function submitted(id: string): Promise<void> {
  await repo.setProjectAxes(id, { bizType: '환경부' }, admin);
  await repo.setProcessStatus(id, '계약서 제출', admin);
}

describe('환경부 승인일을 따라 단계가 오간다', () => {
  it('★적으면 기후부 승인으로, 지우면 계약서 제출로★', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      await signIn(USERS.admin);

      expect((await setDate(id, '2026-11-10')).status).toBe(200);
      expect(await statusOf(id)).toBe('기후부 승인');
      // 날짜를 고치는 것은 단계를 건드리지 않는다
      expect((await setDate(id, '2026-11-11')).status).toBe(200);
      expect(await statusOf(id)).toBe('기후부 승인');

      expect((await setDate(id, null)).status).toBe(200);
      expect(await statusOf(id)).toBe('계약서 제출');
      const p = await repo.getProject(id, adminView);
      expect(p!.process.envApprovalDate).toBeNull();
      // 낸 날은 그대로다 — 무른 것은 승인이지 제출이 아니다
      expect(p!.process.cpoSubmitDate).not.toBeNull();
    });
  });

  it('승인일 없이는 기후부 승인도 행위신고도 못 간다 — 라우트를 직접 불러도', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      await signIn(USERS.admin);
      for (const to of ['기후부 승인', '행위신고']) {
        const r = await move(id, to);
        expect(r.status, to).toBe(422);
        expect(JSON.stringify(r.json), to).toContain('환경부 승인일');
      }
      expect(await statusOf(id)).toBe('계약서 제출');
    });
  });

  it('계약완료에서 적은 승인일은 현장을 밀지 않는다 — 아직 계약서를 안 냈다. 내고 나면 넘길 수 있다', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.setProjectAxes(id, { bizType: '환경부' }, admin);
      await signIn(USERS.admin);
      expect((await setDate(id, '2026-11-10')).status).toBe(200);
      expect(await statusOf(id)).toBe('계약완료');
      expect((await move(id, '계약서 제출')).status).toBe(200);
      expect(await statusOf(id)).toBe('계약서 제출');
      expect((await move(id, '기후부 승인')).status).toBe(200);
      expect((await move(id, '행위신고')).status).toBe(200);
    });
  });

  it('자체투자는 그 칸을 안 지난다 — 승인일을 적어도 그대로고, 계약서 제출에서 바로 행위신고로 간다', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.setProcessStatus(id, '계약서 제출', admin);
      await signIn(USERS.admin);
      expect((await setDate(id, '2026-11-10')).status).toBe(200);
      expect(await statusOf(id)).toBe('계약서 제출');
      expect((await move(id, '기후부 승인')).status).toBe(422);
      expect((await move(id, '행위신고')).status).toBe(200);
    });
  });

  it('기후부 승인에 선 현장은 자체투자로 못 바꾼다 — 그 사업구분이 안 지나는 칸이다', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      await repo.updateProcess(id, { envApprovalDate: '2026-11-10' }, admin);
      expect(await statusOf(id)).toBe('기후부 승인');
      await expect(repo.setProjectAxes(id, { bizType: '자체투자' }, admin)).rejects.toThrow(/기후부 승인[\s\S]*지나지 않습니다/);
    });
  });
});

describe('승인 취소 — 잘못 넣은 승인일을 지운다', () => {
  it('★행위신고 뒤로 간 현장은 거절한다★ — 값은 그대로 남는다. 단계를 되돌리면 지울 수 있다', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      await signIn(USERS.admin);
      await setDate(id, '2026-11-10');
      expect((await move(id, '행위신고')).status).toBe(200);

      const r = await setDate(id, null);
      expect(r.status).toBe(422);
      expect(JSON.stringify(r.json)).toContain('기후부 승인 까지 먼저 되돌리세요');
      expect((await repo.getProject(id, adminView))!.process.envApprovalDate).toBe('2026-11-10');
      expect(await statusOf(id)).toBe('행위신고');

      expect((await move(id, '기후부 승인')).status).toBe(200);
      expect((await setDate(id, null)).status).toBe(200);
      expect(await statusOf(id)).toBe('계약서 제출');
    });
  });

  it('★그 승인으로 연 기성을 청구했으면 거절한다★ — 청구를 취소하면 지울 수 있다', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      const rule = (await repo.listSettlementRules(admin))
        .find((r) => r.active && r.steps[0]?.trigger === '환경부 승인');
      if (!rule) throw new Error('개발 DB 에 1차가 환경부 승인인 정산 규칙이 없다 — 마이그레이션이 적용됐는지 본다');
      await repo.setSettlementRule(id, rule.id, admin);

      await repo.updateProcess(id, { envApprovalDate: '2026-09-01' }, admin);
      await repo.setSettlementClaimed(id, 1, '2026-10-05', admin);

      await expect(repo.updateProcess(id, { envApprovalDate: null }, admin)).rejects.toThrow(/1차\(환경부 승인\)를 이미 청구했습니다/);
      expect(await statusOf(id)).toBe('기후부 승인');

      await repo.setSettlementClaimed(id, 1, null, admin);
      await repo.updateProcess(id, { envApprovalDate: null }, admin);
      expect(await statusOf(id)).toBe('계약서 제출');
    });
  });

  /*
   * 날짜와 칸이 한 사실이다 — 승인일을 지우면 현장이 돌아가듯, 현장을 되돌리면 승인일이 지워진다.
   * 한쪽만 하면 「승인일은 있는데 승인 대기 칸」에 선 현장이 남는다(이 칸을 세운 까닭이 그 현장들이었다).
   */
  it('★기후부 승인에서 앞으로 되돌려도 승인이 취소된다★ — 승인일이 같이 지워진다', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      await signIn(USERS.admin);
      await setDate(id, '2026-11-10');
      expect(await statusOf(id)).toBe('기후부 승인');

      expect((await move(id, '계약서 제출')).status).toBe(200);
      const p = await repo.getProject(id, adminView);
      expect(p!.process.status).toBe('계약서 제출');
      expect(p!.process.envApprovalDate).toBeNull();
      // 행위신고에서 기후부 승인으로 되돌리는 것은 승인을 건드리지 않는다
      await setDate(id, '2026-11-12');
      await move(id, '행위신고');
      expect((await move(id, '기후부 승인')).status).toBe(200);
      expect((await repo.getProject(id, adminView))!.process.envApprovalDate).toBe('2026-11-12');
    });
  });

  it('그 승인으로 연 기성을 청구했으면 되돌리기도 거절한다', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      const rule = (await repo.listSettlementRules(admin))
        .find((r) => r.active && r.steps[0]?.trigger === '환경부 승인');
      if (!rule) throw new Error('개발 DB 에 1차가 환경부 승인인 정산 규칙이 없다');
      await repo.setSettlementRule(id, rule.id, admin);
      await repo.updateProcess(id, { envApprovalDate: '2026-09-01' }, admin);
      await repo.setSettlementClaimed(id, 1, '2026-10-05', admin);

      await expect(repo.setProcessStatus(id, '계약서 제출', admin))
        .rejects.toThrow(/환경부 승인이 취소됩니다[\s\S]*이미 청구했습니다/);
      const p = await repo.getProject(id, adminView);
      expect(p!.process.status).toBe('기후부 승인');
      expect(p!.process.envApprovalDate).toBe('2026-09-01');
    });
  });

  it('협력사는 승인일을 못 지운다 — 한백이 적는 칸이다', async () => {
    await withPayableProject(async ({ id }) => {
      await submitted(id);
      await repo.updateProcess(id, { envApprovalDate: '2026-11-10' }, admin);
      await signIn(USERS.daesang);
      expect((await setDate(id, null)).status).toBeGreaterThanOrEqual(400);
      expect(await statusOf(id)).toBe('기후부 승인');
    });
  });
});

/**
 * 알림 — 승인 알림은 현장마다 한 번이었다(notifications.test). 취소가 그 「한 번」을 되돌린다:
 * 안 읽은 승인 알림은 거두고, 읽은 사람에게는 「승인 취소」를 주고, 진짜 승인이 나면 다시 알린다.
 */
describe('승인 취소의 알림', () => {
  const me = (u: (typeof USERS)[keyof typeof USERS]) => ({ id: u.id, role: u.role, org: u.org });
  const mine = async (u: (typeof USERS)[keyof typeof USERS], id: string) =>
    (await repo.listNotifications(me(u))).filter((x) => x.projectId === id).map((x) => ({ kind: x.kind, title: x.title, body: x.body, read: x.read }));

  it('★안 읽은 승인 알림은 거두고, 읽은 사람에게는 「승인 취소」가 간다 — 다시 승인하면 다시 알린다★', async () => {
    // 영업사 = 네이비인프라 · 시공사 = 에코일렉 — 둘 다 승인 알림을 받는다(notifications.test 와 같은 현장 모양)
    await withProject(async (id) => {
      await signIn(USERS.admin);
      expect((await setDate(id, '2026-11-10')).status).toBe(200);
      expect(await mine(USERS.navy, id)).toHaveLength(1);
      expect(await mine(USERS.ecoelec, id)).toHaveLength(1);

      // 에코일렉만 읽는다
      await signIn(USERS.ecoelec);
      await call(readPOST, { method: 'POST', body: { projectId: id, scope: '시공' } });
      expect((await mine(USERS.ecoelec, id))[0].read).toBe(true);

      await signIn(USERS.admin);
      expect((await setDate(id, null)).status).toBe(200);
      expect(await mine(USERS.navy, id), '안 읽은 승인 알림은 거둔다').toEqual([]);
      expect(await mine(USERS.ecoelec, id), '읽은 사람에게는 취소가 그 자리에 선다').toEqual([
        { kind: 'approvalCancel', title: '환경부 승인 취소', body: '승인일 2026-11-10 입력 취소 — 아직 승인 전', read: false },
      ]);
      expect(await mine(USERS.admin, id), '지운 사람은 받지 않는다').toEqual([]);

      // 진짜 승인 — 둘 다 다시 받고, 안 읽은 「승인 취소」는 거둔다(승인이 난 지금은 지난 말이다)
      expect((await setDate(id, '2026-11-20')).status).toBe(200);
      for (const u of [USERS.navy, USERS.ecoelec]) {
        expect(await mine(u, id), u.id).toEqual([
          { kind: 'approval', title: '환경부 승인', body: '승인일 2026-11-20 — 환경부 승인 완료', read: false },
        ]);
      }
    }, { salesOrg: USERS.navy.org, gcOrg: USERS.ecoelec.org, bizType: '환경부' });
  });
});

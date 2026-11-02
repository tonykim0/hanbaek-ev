/**
 * 기성 청구 — 조건이 찬 다음 달부터 청구하고, 청구한 것만 받는다 (한백 지시 2026-11-02).
 *
 * ★이 그물이 지키는 것★
 *   1. 「익월」 — 조건이 찬 달의 다음 달 1일부터 청구 가능이다(달 끝·해 끝 경계 포함).
 *   2. 순서 — 조건 대기 → 청구 예정 → 청구 가능 → 미수 → 수금 완료. 수금은 청구 뒤에만.
 *   3. 돈 토막 — 총 기성액 = 수주잔고 + 미수금 + 수금 완료. 기성관리·정산현황·할 일이 같은 셈을 본다.
 */
import { describe, expect, it } from 'vitest';
import {
  claimableFromOf, receivableMoneyOf, stepClaimBlock, stepCollectBlock, stepStateOf,
} from '@/lib/settlement';
import type { SettlementStep } from '@/types/project';

describe('익월 — 조건이 찬 달의 다음 달 1일부터 청구한다', () => {
  it('10월 15일에 찼으면 11월 1일부터', () => {
    expect(claimableFromOf('2026-10-15')).toBe('2026-11-01');
  });

  it('달의 첫날에 찼어도 다음 달이다 — 같은 달에는 청구하지 않는다', () => {
    expect(claimableFromOf('2026-10-01')).toBe('2026-11-01');
  });

  it('달 끝 · 해 끝 경계', () => {
    expect(claimableFromOf('2026-10-31')).toBe('2026-11-01');
    expect(claimableFromOf('2026-12-31')).toBe('2027-01-01');
  });
});

describe('차수의 자리 — 기록이 먼저 이기고, 없으면 조건과 오늘로 정한다', () => {
  const at = (o: Partial<Parameters<typeof stepStateOf>[0]>) =>
    stepStateOf({ openedAt: null, claimedAt: null, collectedAt: null, today: '2026-11-02', ...o });

  it('조건이 안 찼으면 조건 대기', () => {
    expect(at({})).toBe('waiting');
  });

  it('조건이 이번 달에 찼으면 청구 예정 — 다음 달 1일을 기다린다', () => {
    expect(at({ openedAt: '2026-11-01' })).toBe('scheduled');
  });

  it('다음 달 1일이 되면 청구 가능', () => {
    expect(at({ openedAt: '2026-10-31' })).toBe('open');
    expect(at({ openedAt: '2026-10-31', today: '2026-10-31' })).toBe('scheduled');
  });

  it('청구일이 있으면 미수 · 수금일이 있으면 수금 완료', () => {
    expect(at({ openedAt: '2026-09-10', claimedAt: '2026-10-05' })).toBe('claimed');
    expect(at({ openedAt: '2026-09-10', claimedAt: '2026-10-05', collectedAt: '2026-10-30' })).toBe('collected');
  });

  /* 청구를 기록하지 않던 때의 수금 — 그래도 받은 돈이다 */
  it('청구일 없는 옛 수금도 수금 완료', () => {
    expect(at({ openedAt: '2026-06-10', collectedAt: '2026-07-20' })).toBe('collected');
  });
});

const step = (o: Partial<SettlementStep> & { no: 1 | 2 | 3 }): SettlementStep => ({
  trigger: '착공', basisLabel: '고정', planAmount: 1_000_000,
  state: 'waiting', openedAt: null, claimableFrom: null, claimedAt: null,
  collectedAt: null, collectedAmount: null, ...o,
});

describe('청구일을 적을 수 있나 — 단추와 저장소가 같은 말을 쓴다', () => {
  const 오늘 = '2026-11-02';

  it('청구 가능이면 다음 달 1일 이후 오늘까지 받는다', () => {
    const s = step({ no: 1, state: 'open', openedAt: '2026-10-15', claimableFrom: '2026-11-01' });
    expect(stepClaimBlock(s, '2026-11-01', 오늘)).toBeNull();
    expect(stepClaimBlock(s, '2026-11-02', 오늘)).toBeNull();
  });

  it('조건이 찬 달 안의 날짜는 거절한다 — 「익월부터」', () => {
    const s = step({ no: 1, state: 'open', openedAt: '2026-10-15', claimableFrom: '2026-11-01' });
    expect(stepClaimBlock(s, '2026-10-31', 오늘)).toMatch(/2026-11-01부터/);
  });

  it('청구 예정 차수는 아직 날이 안 왔다', () => {
    const s = step({ no: 2, state: 'scheduled', openedAt: '2026-11-01', claimableFrom: '2026-12-01' });
    expect(stepClaimBlock(s, 오늘, 오늘)).toMatch(/2026-12-01부터/);
  });

  it('앞으로 올 날짜는 거절한다', () => {
    const s = step({ no: 1, state: 'open', openedAt: '2026-10-15', claimableFrom: '2026-11-01' });
    expect(stepClaimBlock(s, '2026-11-05', 오늘)).toMatch(/앞으로 올 날짜/);
  });

  it('조건 대기 · 수금 완료는 거절한다', () => {
    expect(stepClaimBlock(step({ no: 1 }), 오늘, 오늘)).toMatch(/조건이 차지 않았/);
    expect(stepClaimBlock(step({ no: 1, state: 'collected', claimableFrom: '2026-10-01', collectedAt: '2026-10-20' }), 오늘, 오늘))
      .toMatch(/이미 수금/);
  });

  /* 잘못 찍은 청구일을 고치는 길 — 화면 규칙 7 */
  it('이미 청구한 차수의 날 고치기는 받는다', () => {
    const s = step({ no: 1, state: 'claimed', openedAt: '2026-10-15', claimableFrom: '2026-11-01', claimedAt: '2026-11-02' });
    expect(stepClaimBlock(s, '2026-11-01', 오늘)).toBeNull();
  });
});

describe('수금을 적을 수 있나 — ★청구한 차수에만★ (한백 결정 2026-11-02)', () => {
  it('청구 가능 · 청구 예정 차수는 청구부터', () => {
    expect(stepCollectBlock(step({ no: 1, state: 'open', claimableFrom: '2026-11-01' }), '2026-11-02'))
      .toMatch(/청구를 먼저/);
    expect(stepCollectBlock(step({ no: 1, state: 'scheduled', claimableFrom: '2026-12-01' }), '2026-11-02'))
      .toMatch(/청구를 먼저/);
  });

  it('미수 차수는 청구일 이후의 날짜로 받는다', () => {
    const s = step({ no: 1, state: 'claimed', claimedAt: '2026-11-02' });
    expect(stepCollectBlock(s, '2026-11-20')).toBeNull();
    expect(stepCollectBlock(s, '2026-11-01')).toMatch(/앞설 수 없/);
  });

  /* 옛 수금(청구일 없음)의 금액·날 고치기를 막지 않는다 */
  it('이미 수금된 차수의 고치기는 받는다', () => {
    expect(stepCollectBlock(step({ no: 1, state: 'collected', collectedAt: '2026-07-20' }), '2026-07-21')).toBeNull();
  });

  it('조건 대기는 거절한다', () => {
    expect(stepCollectBlock(step({ no: 1 }), '2026-11-02')).toMatch(/조건이 차지 않았/);
  });
});

describe('돈 토막 — 총 기성액 = 수주잔고 + 미수금 + 수금 완료', () => {
  const base = {
    cpo: 'SK일렉링크' as const,
    safetyFee: null, safetyFeeClaimedAt: null, safetyFeeCollectedAt: null,
  };

  it('다섯 자리가 각자의 토막으로 간다', () => {
    const steps = [
      step({ no: 1, state: 'collected', collectedAt: '2026-08-20' }),
      step({ no: 2, state: 'claimed', claimedAt: '2026-10-05' }),
      step({ no: 3, state: 'open', claimableFrom: '2026-11-01' }),
    ];
    const m = receivableMoneyOf({
      ...base, steps, planTotal: 3_450_000, collectedTotal: 1_000_000,
      safetyFee: 450_000,
    });
    expect(m.claimable).toBe(1_450_000); // 3차 + 수수료(금액만 적힘)
    expect(m.feeClaimable).toBe(450_000);
    expect(m.backlog).toBe(1_450_000);
    expect(m.unpaid).toBe(1_000_000);
    expect(m.collected).toBe(1_000_000);
    expect(m.backlog + m.unpaid + m.collected).toBe(m.plan);
  });

  it('조건 대기 · 청구 예정은 수주잔고에 들고 청구 가능에는 안 든다', () => {
    const steps = [
      step({ no: 1, state: 'scheduled', claimableFrom: '2026-12-01' }),
      step({ no: 2 }),
      step({ no: 3, state: 'na', planAmount: null }),
    ];
    const m = receivableMoneyOf({ ...base, steps, planTotal: 2_000_000, collectedTotal: 0 });
    expect(m.claimable).toBe(0);
    expect(m.scheduled).toBe(1_000_000);
    expect(m.waiting).toBe(1_000_000);
    expect(m.backlog).toBe(2_000_000);
  });

  /* 감사 L13 — 덜 받은 돈은 「조건 대기」가 아니다. 청구한 돈 중 못 받은 것이라 미수금이다 */
  it('실수금 차액은 미수금에 든다 — 합이 그대로 맞는다', () => {
    const steps = [step({ no: 1, state: 'collected', collectedAt: '2026-08-20', collectedAmount: 800_000 })];
    const m = receivableMoneyOf({ ...base, steps, planTotal: 1_000_000, collectedTotal: 800_000 });
    expect(m.shortfall).toBe(200_000);
    expect(m.unpaid).toBe(200_000);
    expect(m.backlog + m.unpaid + m.collected).toBe(m.plan);
  });

  it('안 받는 운영사의 수수료는 세지 않는다 — 값이 남아 있어도', () => {
    const m = receivableMoneyOf({
      ...base, cpo: '에버온', steps: [], planTotal: 0, collectedTotal: 0, safetyFee: 450_000,
    });
    expect(m.claimable).toBe(0);
    expect(m.feePlan).toBe(0);
  });
});

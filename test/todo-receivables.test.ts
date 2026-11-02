/**
 * 기성 할 일 — 운영사에게서 받을 돈이 지금 어디서 걸려 있나.
 *
 * ★여기가 틀리면 배지가 거짓말을 한다★ — 할 일은 저장하는 알림함이 아니라 유도값이라,
 * 조건이 헐거우면 처리할 수 없는 카드가 영영 남고 빡빡하면 받을 돈이 안 보인다.
 * 조건(청구 · 미수 · 준공마감일 · 규칙)의 경계를 못 박아 둔다.
 */
import { describe, expect, it } from 'vitest';
import { receivableTodos } from '@/lib/todo-receivables';
import { closeDateNeeded, closingSteps } from '@/lib/settlement';
import type { ProcessStatus, SettlementStep, SettlementSummary } from '@/types/project';

const 오늘 = new Date('2026-08-28T10:00:00+09:00');

function step(over: Partial<SettlementStep> & { no: 1 | 2 | 3 }): SettlementStep {
  return {
    trigger: '환경부 승인',
    basisLabel: '고정',
    planAmount: 300_000,
    state: 'waiting',
    openedAt: null,
    claimableFrom: null,
    claimedAt: null,
    collectedAt: null,
    collectedAmount: null,
    ...over,
  };
}

/** 기성에 쓰이는 값만 채운다 — 협력사 지급 쪽(반대 방향)은 이 조립이 안 본다 */
function row(over: Partial<SettlementSummary> = {}): SettlementSummary {
  return {
    id: 'p1', name: '테스트아파트', cpo: '에버온', qty: 3,
    stage: 'construction', status: '착공' as ProcessStatus,
    ruleName: '환경부 승인 300,000원 → 준공마감 잔액',
    steps: [step({ no: 1 }), step({ no: 2 }), step({ no: 3 })],
    planTotal: 900_000, collectedTotal: 0, cpoCloseDate: null,
    passThrough: false,
    safetyFee: null, safetyFeeClaimedAt: null, safetyFeeCollectedAt: null,
    safetyFeeReceiptCount: 0, safetyFeeReceiptStatus: 'none',
    salesOrg: null, gcOrg: null,
    payoutMilestones: { contractSubmittedAt: null, installCompletedAt: null, completedAt: null },
    salesPayoutDocsMissing: [], salesTotal: 0, consTotal: 0, marginTotal: 0, unpricedLines: 0,
    salesAdjust: 0, salesPaid: 0, salesLastPaidAt: null,
    consAdjust: 0, consPaid: 0, consLastPaidAt: null,
    salesStep1At: null, salesStep2At: null, consStep1At: null, consStep2At: null,
    payNote: null,
    ...over,
  };
}

/* 청구 가능 차수 — 조건이 7월에 찼으면 8월 1일부터 청구할 수 있다 (한백 2026-11-02 「익월」) */
const 청구가능 = (over: Partial<SettlementStep> & { no: 1 | 2 | 3 }) =>
  step({ state: 'open', openedAt: '2026-07-18', claimableFrom: '2026-08-01', ...over });

describe('기성 청구 — 청구할 수 있는데 아직 청구하지 않은 차수', () => {
  it('조건 대기만 있으면 할 일이 아니다 — 기다리는 것은 우리 차례가 아니다', () => {
    expect(receivableTodos([row()], 오늘)).toHaveLength(0);
  });

  /* 조건이 이번 달에 찼으면 다음 달 1일에 선다 — 그 전에 띄우면 누를 수 없는 할 일이다 */
  it('청구 예정(이번 달에 찬 차수)은 할 일이 아니다', () => {
    expect(receivableTodos([row({
      steps: [step({ no: 1, state: 'scheduled', openedAt: '2026-08-18', claimableFrom: '2026-09-01' }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘)).toHaveLength(0);
  });

  it('청구 가능 차수 하나 → 카드 하나. 금액과 무엇이 찼는지를 적는다', () => {
    const [t] = receivableTodos([row({
      steps: [청구가능({ no: 1 }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘);
    expect(t.kind).toBe('기성 청구');
    expect(t.group).toBe('기성');
    expect(t.what).toBe('1차 기성 300,000원 · 환경부 승인 충족');
    expect(t.href).toBe('/projects/p1?tab=receivable');
  });

  it('★한 현장에 두 차수가 청구 가능해도 카드는 하나★ — 한 번에 청구하고, 갈 자리도 하나다', () => {
    const items = receivableTodos([row({
      steps: [
        청구가능({ no: 1 }),
        청구가능({ no: 2, trigger: '착공', planAmount: 500_000, openedAt: '2026-07-26' }),
        step({ no: 3 }),
      ],
    })], 오늘);
    expect(items).toHaveLength(1);
    expect(items[0].what).toBe('1·2차 기성 800,000원 · 환경부 승인·착공 충족');
  });

  it('급함은 ★가장 오래 청구 가능했던 차수★로 잰다 — 청구할 수 있게 된 날(다음 달 1일)부터, 하루 = 1', () => {
    const [t] = receivableTodos([row({
      steps: [
        청구가능({ no: 1, openedAt: '2026-06-20', claimableFrom: '2026-07-01' }),
        청구가능({ no: 2 }),
        step({ no: 3 }),
      ],
    })], 오늘);
    expect(t.urgency).toBe(58);
    expect(t.urgencyLabel).toBe('청구 가능해진 지 58일');
    expect(t.overdue).toBe(true);
  });

  it('오늘부터 청구 가능한 것은 밀린 것이 아니다', () => {
    const [t] = receivableTodos([row({
      steps: [청구가능({ no: 1, openedAt: '2026-08-18', claimableFrom: '2026-09-01' }), step({ no: 2 }), step({ no: 3 })],
    })], new Date('2026-09-01T10:00:00+09:00'));
    expect(t.urgency).toBe(0);
    expect(t.urgencyLabel).toBe('오늘부터 청구 가능');
    expect(t.overdue).toBe(false);
  });

  it('수금한 차수는 빠진다 — 받은 돈은 할 일이 아니다', () => {
    expect(receivableTodos([row({
      steps: [
        step({ no: 1, state: 'collected', openedAt: '2026-07-01', claimedAt: '2026-08-03', collectedAt: '2026-08-20' }),
        step({ no: 2 }), step({ no: 3 }),
      ],
    })], 오늘)).toHaveLength(0);
  });

  it('금액이 안 잡힌 차수는 0원이라 하지 않는다 — 「금액 미정」', () => {
    const [t] = receivableTodos([row({
      steps: [청구가능({ no: 1, planAmount: null }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘);
    expect(t.what).toBe('1차 기성 금액 미정 · 환경부 승인 충족');
  });
});

describe('기성 미수 — 청구했는데 한 달이 지나도 안 들어온 차수 (한백 결정 2026-11-02)', () => {
  it('청구한 지 30일 전에는 할 일이 아니다 — 운영사가 보내기를 기다리는 동안이다', () => {
    expect(receivableTodos([row({
      steps: [step({ no: 1, state: 'claimed', openedAt: '2026-06-18', claimedAt: '2026-08-01' }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘)).toHaveLength(0);
  });

  it('30일째부터 「기성 미수」가 선다 — 청구일과 지난 날을 적고 밀린 것으로 본다', () => {
    const [t] = receivableTodos([row({
      steps: [step({ no: 1, state: 'claimed', openedAt: '2026-06-18', claimedAt: '2026-07-29' }), step({ no: 2 }), step({ no: 3 })],
    })], 오늘);
    expect(t.kind).toBe('기성 미수');
    expect(t.what).toBe('1차 기성 300,000원 · 2026-07-29 청구');
    expect(t.urgencyLabel).toBe('청구한 지 30일');
    expect(t.overdue).toBe(true);
  });
});

describe('준공마감일 지정 — 마지막 기성이 열리지 않는 자리', () => {
  const 잔액대기 = [
    step({ no: 1, state: 'collected', openedAt: '2026-05-01', collectedAt: '2026-05-20' }),
    step({ no: 2, state: 'collected', openedAt: '2026-06-01', collectedAt: '2026-06-20', trigger: '착공' }),
    step({ no: 3, trigger: '준공마감', basisLabel: '잔액', planAmount: 660_000 }),
  ];

  it('준공했는데 준공마감일이 없다 → 한백이 넣을 차례다', () => {
    const [t] = receivableTodos([row({ status: '준공완료', steps: 잔액대기 })], 오늘);
    expect(t.kind).toBe('준공마감일 지정');
    expect(t.what).toBe('3차 기성 660,000원 · 준공마감일 없음');
    expect(t.urgency).toBe(30);
  });

  /*
   * ★넣는 자리가 시공 탭이다★ (한백 지시 2026-09-15) — 기성 탭으로 보내면 눌러 간 자리에
   * 단추가 없다. 카드 묶음은 「기성」 그대로다: 막혀 있는 것은 돈이다.
   */
  it('눌러 가는 곳은 시공 탭이다 — 넣는 단추가 거기 있다', () => {
    const [t] = receivableTodos([row({ status: '준공완료', steps: 잔액대기 })], 오늘);
    expect(t.href).toBe('/projects/p1?tab=construction');
    expect(t.group).toBe('기성');
  });

  /* 표의 꼬리표·거르는 축이 이 함수를 같이 본다 — 두 벌로 세면 배지와 표가 갈린다 */
  it('그 판정을 표도 쓴다 — closeDateNeeded 가 같은 답을 준다', () => {
    expect(closeDateNeeded('준공완료', 잔액대기)).toBe(true);
    expect(closeDateNeeded('개통 및 통신확인', 잔액대기)).toBe(false);
    expect(closingSteps(잔액대기).map((s) => s.no)).toEqual([3]);
    /* 날짜가 들어오면 그 차수가 열려서(waiting → open) 판정이 저절로 내려간다 */
    const 열림 = [잔액대기[0], 잔액대기[1], { ...잔액대기[2], state: 'open' as const, openedAt: '2026-08-10' }];
    expect(closeDateNeeded('준공완료', 열림)).toBe(false);
  });

  it('★준공 전에는 안 세운다★ — 통보가 올 때가 아니고, 띄우면 준공까지 내내 걸려 있다', () => {
    expect(receivableTodos([row({ status: '개통 및 통신확인', steps: 잔액대기 })], 오늘)).toHaveLength(0);
  });

  /* 날짜가 이번 달이면 청구 예정이라 아무 카드도 없다 — 준공마감일 지정은 끝났고, 청구는 다음 달이다 */
  it('준공마감일이 이번 달에 들어오면 카드가 내려간다 — 청구는 다음 달', () => {
    expect(receivableTodos([row({
      status: '준공완료', cpoCloseDate: '2026-08-10',
      steps: [
        잔액대기[0], 잔액대기[1],
        step({ no: 3, trigger: '준공마감', basisLabel: '잔액', planAmount: 660_000, state: 'scheduled', openedAt: '2026-08-10', claimableFrom: '2026-09-01' }),
      ],
    })], 오늘)).toHaveLength(0);
  });

  it('다음 달이 되면 그 차수는 청구 카드다', () => {
    const [t] = receivableTodos([row({
      status: '준공완료', cpoCloseDate: '2026-07-10',
      steps: [
        잔액대기[0], 잔액대기[1],
        step({ no: 3, trigger: '준공마감', basisLabel: '잔액', planAmount: 660_000, state: 'open', openedAt: '2026-07-10', claimableFrom: '2026-08-01' }),
      ],
    })], 오늘);
    expect(t.kind).toBe('기성 청구');
    expect(t.what).toBe('3차 기성 660,000원 · 준공마감 충족');
  });
});

describe('정산 규칙 미지정 — 기성이 계산조차 안 되는 자리', () => {
  it('시공 국면에 규칙이 없으면 할 일이다', () => {
    const [t] = receivableTodos([row({ ruleName: null, steps: [] })], 오늘);
    expect(t.kind).toBe('정산 규칙 미지정');
    expect(t.what).toBe('3대 · 기성 계산 안 됨');
    /* 날짜로 잴 근거가 없다 — 밀림 문턱에 놓되 날수로 잰 것들 위로는 안 올라선다 */
    expect(t.urgency).toBe(7);
    expect(t.urgencyLabel).toBeNull();
  });

  it('★계약 국면에는 안 세운다★ — 그때는 걸 때가 아니고, 계약 쪽 할 일이 이미 서 있다', () => {
    expect(receivableTodos([row({
      ruleName: null, steps: [], stage: 'intake', status: '계약완료',
    })], 오늘)).toHaveLength(0);
  });

  it('계약완료·운영사 제출은 시공 stage 라도 ★계약 국면★이다 (보드와 같은 판정)', () => {
    expect(receivableTodos([row({
      ruleName: null, steps: [], stage: 'construction', status: '운영사 계약서 제출',
    })], 오늘)).toHaveLength(0);
  });

  it('대수가 0이면 받을 것이 없다 — 세우지 않는다', () => {
    expect(receivableTodos([row({ ruleName: null, steps: [], qty: 0 })], 오늘)).toHaveLength(0);
  });
});

describe('한 현장에 두 가지가 겹칠 때', () => {
  it('열린 차수와 준공마감일 대기는 다른 일이다 — 카드도 둘', () => {
    const items = receivableTodos([row({
      status: '준공완료',
      steps: [
        청구가능({ no: 1 }),
        step({ no: 2, state: 'collected', openedAt: '2026-06-01', collectedAt: '2026-06-20', trigger: '착공' }),
        step({ no: 3, trigger: '준공마감', basisLabel: '잔액', planAmount: 660_000 }),
      ],
    })], 오늘);
    expect(items.map((t) => t.kind)).toEqual(['기성 청구', '준공마감일 지정']);
    /* 열쇠가 겹치면 화면에서 한 장이 사라진다 */
    expect(new Set(items.map((t) => t.id)).size).toBe(2);
  });
});

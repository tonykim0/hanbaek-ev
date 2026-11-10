/**
 * ★턴키 현장의 영업비 초과는 시공비 잔금에서 뺀다★ (한백 지시 2026-11-10 「턴키업체일 경우, 영업비 초과가 될 경우,
 * 앞으로 시공비에서 차감해」) — lib/settlement payoutSidesOf.
 *
 * 숫자는 운영 원장(2026-11-10 백업)의 네 현장 그대로다. 사람이 손으로 적던 상계가 셋 다 어긋나 있었다 —
 * 안 적혔거나(반달마을 · 신정이펜), 한 줄만 적혔거나(마곡럭스나인), 단가가 바뀌어 낡았다(파크밸리 자투).
 * 저장소의 두 길(지급관리 표 · 확정)이 같은 금액을 내는지는 test/db/turnkey-offset.test.ts 가 본다.
 */
import { describe, expect, it } from 'vitest';
import { isTurnkeySite, manualAdjustOf, payoutSidesOf, payoutStepsOf } from '@/lib/settlement';
import { workOf, type PayoutRowInput } from '@/lib/payout-board';
import type { PayoutCategory, PayoutEntry, PayoutKind } from '@/types/project';

let n = 0;
const e = (kind: PayoutKind, category: PayoutCategory, amount: number, step: 1 | 2 | null, at = '2026-07-10'): PayoutEntry =>
  ({ id: `e${++n}`, projectId: 'p', kind, category, amount, step, at, note: null, createdAt: at });

/** 표가 줄을 세우는 모양 그대로 — 상계까지 얹은 두 쪽으로 workOf 를 부른다 */
const rowsOf = (entries: PayoutEntry[], plan: { 영업비: number; 시공비: number }, turnkey = true) => {
  const sides = payoutSidesOf(entries, { turnkey, salesPlan: plan.영업비, consPlan: plan.시공비 });
  const row = (kind: PayoutKind): PayoutRowInput => ({
    key: `p|${kind}`, projectId: 'p', projectName: '시험', cpo: 'SK일렉링크', kind, org: '엘앤에스',
    plan: plan[kind], adjust: sides[kind].adjust, adjustBy: sides[kind].adjustBy, confirmed: sides[kind].paid,
    ledger: sides[kind].ledger, unpriced: 0, holdState: null, passThrough: false,
    milestones: { contractSubmittedAt: '2026-05-27', installCompletedAt: '2026-09-18', completedAt: '2026-11-20' },
    payoutDocsMissing: [], docsRejected: 0,
    step1At: null, step2At: null, step1EntryId: null, step2EntryId: null, crossOffset: sides[kind].offset,
  });
  return { sides, sales: workOf(row('영업비')), cons: workOf(row('시공비')) };
};

describe('isTurnkeySite — 영업사와 시공사가 같은 회사', () => {
  it('같으면 턴키, 다르거나 비면 아니다', () => {
    expect(isTurnkeySite({ salesOrg: '엘앤에스', gcOrg: '엘앤에스' })).toBe(true);
    expect(isTurnkeySite({ salesOrg: '엘앤에스 ', gcOrg: '엘앤에스' })).toBe(true); // 이름의 사소한 차이
    expect(isTurnkeySite({ salesOrg: '보승이앤씨', gcOrg: '에코일렉' })).toBe(false);
    expect(isTurnkeySite({ salesOrg: null, gcOrg: null })).toBe(false);
  });
});

describe('payoutSidesOf — 턴키 영업비 초과를 시공비 잔금에서 뺀다', () => {
  it('★반달마을푸르지오★ 영업비 150만에 178.5만이 나감 → 영업비는 지급 완료, 시공비 잔금 81만이 52.5만', () => {
    const entries = [e('영업비', '1차', 1_785_000, 1), e('시공비', '1차', 1_890_000, 1, '2026-10-30')];
    const { sides, sales, cons } = rowsOf(entries, { 영업비: 1_500_000, 시공비: 2_700_000 });
    expect(sides.영업비.offset).toBe(285_000);
    expect(sides.시공비.offset).toBe(-285_000);
    expect(sales.state).toBe('지급 완료'); // 「초과 — 회수·차감 필요」가 사라진다
    expect(sales.due).toBe(1_785_000);
    expect(cons.due).toBe(2_415_000);
    expect(cons.open).toEqual({ no: 2, amount: 525_000 });
    expect(cons.state).toBe('지급 가능'); // 준공완료가 찍힌 뒤
  });

  it('★신정이펜하우스3단지★ 시공비가 하나도 안 나갔으면 1차는 70% 그대로, 잔금에서만 40만을 뺀다', () => {
    const entries = [e('영업비', '1차', 4_900_000, 1, '2026-08-26')];
    const { sales, cons } = rowsOf(entries, { 영업비: 4_500_000, 시공비: 5_500_000 });
    expect(sales.state).toBe('지급 완료');
    expect([cons.step1Amount, cons.step2Amount]).toEqual([3_850_000, 1_250_000]);
    expect(cons.open).toEqual({ no: 1, amount: 3_850_000 });
  });

  it('잔금이 다 나간 뒤에도 셈이 그대로다 — 1차 · 2차 원장이 합쳐 총액과 같다', () => {
    const plan = { 영업비: 4_500_000, 시공비: 5_500_000 };
    const before = rowsOf([e('영업비', '1차', 4_900_000, 1)], plan).cons;
    const paid1 = [e('영업비', '1차', 4_900_000, 1), e('시공비', '1차', before.open!.amount, 1)];
    const mid = rowsOf(paid1, plan).cons;
    expect(mid.open).toEqual({ no: 2, amount: 1_250_000 });
    // 깎인 잔금이 나간 뒤에도 상계는 그대로 선다 — 잔금이 나가는 순간 영업비가 다시 「초과」로 뜨면 안 된다
    const done = rowsOf([...paid1, e('시공비', '2차', mid.open!.amount, 2)], plan);
    expect(done.cons.confirmed).toBe(5_100_000);
    expect(done.sides.시공비.offset).toBe(-400_000);
    expect(done.sales.state).toBe('지급 완료');
    expect(done.cons.state).toBe('지급 완료');
  });

  it('★파크밸리동일하이빌(자투)★ 손으로 적은 시공비 차감 176만에 영업비 재정산 짝을 달면 남은 220만만 더 뺀다', () => {
    const base = [
      e('영업비', '차감', -21_560_000, null, '2026-09-30'),
      e('시공비', '차감', -1_760_000, null, '2026-09-30'),
    ];
    const plan = { 영업비: 17_600_000, 시공비: 22_000_000 };
    // 짝이 없으면 영업비는 아직 396만 초과로 보여 한 번 더 뺀다 — 그래서 짝(재정산 +176만)을 단다
    expect(rowsOf(base, plan).sides.영업비.offset).toBe(3_960_000);
    const paired = [...base, e('영업비', '재정산', 1_760_000, null, '2026-11-10')];
    const { sides, sales, cons } = rowsOf(paired, plan);
    expect(sides.시공비.offset).toBe(-2_200_000);
    expect(sales.due).toBe(0); // 이 현장 영업비는 옛 보조사업 현장에서 이미 다 나갔다
    expect(cons.due).toBe(18_040_000); // 17,600,000 + 22,000,000 − 21,560,000
  });

  it('★마곡럭스나인(계약중단)★ 시공비 차감 32만에 짝을 달면 상계할 것이 없다 — 두 번 빠지지 않는다', () => {
    const entries = [
      e('영업비', '1차', 3_920_000, 1, '2026-08-26'),
      e('시공비', '차감', -320_000, 1, '2026-09-17'),
      e('영업비', '재정산', 320_000, null, '2026-11-10'),
    ];
    const { sides, cons } = rowsOf(entries, { 영업비: 3_600_000, 시공비: 4_400_000 });
    expect(sides.영업비.offset).toBe(0);
    expect(cons.due).toBe(4_080_000);
  });

  it('턴키가 아니면 빼지 않는다 — 시공비는 딴 회사의 돈이라 영업비는 「초과」로 남는다', () => {
    const entries = [e('영업비', '1차', 1_785_000, 1)];
    const { sides, sales, cons } = rowsOf(entries, { 영업비: 1_500_000, 시공비: 2_700_000 }, false);
    expect(sides.시공비.offset).toBe(0);
    expect(sales.state).toBe('초과');
    expect(cons.due).toBe(2_700_000);
  });

  it('단가 미지정이면 빼지 않는다 — 계획을 모르면 초과도 모른다', () => {
    const entries = [e('영업비', '1차', 1_785_000, 1)];
    expect(payoutSidesOf(entries, { turnkey: true, salesPlan: null, consPlan: 2_700_000 }).시공비.offset).toBe(0);
    expect(payoutSidesOf(entries, { turnkey: true, salesPlan: 1_500_000, consPlan: null }).시공비.offset).toBe(0);
  });

  it('상계 전에 시공비가 잔금까지 다 나갔으면 뺄 돈이 없다 — 영업비는 「초과」로 남아 사람이 정한다', () => {
    const entries = [
      e('영업비', '1차', 1_785_000, 1),
      e('시공비', '1차', 1_890_000, 1), e('시공비', '2차', 810_000, 2),
    ];
    const { sides, sales } = rowsOf(entries, { 영업비: 1_500_000, 시공비: 2_700_000 });
    expect(sides.영업비.offset).toBe(0);
    expect(sales.state).toBe('초과');
  });

  it('시공비에 남은 돈보다 크면 남은 만큼만 빼고, 나머지는 영업비 「초과」로 남는다', () => {
    const entries = [e('영업비', '1차', 3_000_000, 1), e('시공비', '1차', 700_000, 1)];
    const { sides, sales, cons } = rowsOf(entries, { 영업비: 1_000_000, 시공비: 1_000_000 });
    expect(sides.영업비.offset).toBe(300_000); // 시공비에 남은 30만
    expect(cons.due).toBe(700_000);
    expect(cons.state).toBe('지급 완료');
    expect(sales.state).toBe('초과');
    expect(sales.blockers[0]).toContain('1,700,000');
  });

  it('잔금보다 크면 넘친 몫을 1차에서 뺀다 — 1차 + 2차 = 총액', () => {
    const entries = [e('영업비', '1차', 2_000_000, 1)];
    const { cons } = rowsOf(entries, { 영업비: 1_000_000, 시공비: 2_000_000 });
    expect(cons.due).toBe(1_000_000);
    expect([cons.step1Amount, cons.step2Amount]).toEqual([1_000_000, 0]);
  });

  it('사람이 두 줄을 다 적었으면 겹쳐 빼지 않는다(화진금봉5차의 모양)', () => {
    const entries = [
      e('영업비', '1차', 3_500_000, 1, '2026-07-27'),
      e('영업비', '재정산', 500_000, null, '2026-09-11'),
      e('시공비', '차감', -500_000, 2, '2026-09-11'),
    ];
    const { sides, cons } = rowsOf(entries, { 영업비: 3_000_000, 시공비: 3_300_000 });
    expect(sides.시공비.offset).toBe(0);
    expect(cons.due).toBe(2_800_000);
  });

  it('초과가 없으면 아무것도 바꾸지 않는다 — 옛 셈과 한 자리도 다르지 않다', () => {
    const entries = [e('영업비', '1차', 1_050_000, 1), e('시공비', '차감', -100_000, 1)];
    const plan = { 영업비: 1_500_000, 시공비: 2_700_000 };
    const { sides } = rowsOf(entries, plan);
    for (const kind of ['영업비', '시공비'] as const) {
      expect(sides[kind].offset).toBe(0);
      const plainStep = payoutStepsOf(plan[kind], sides[kind]);
      expect(plainStep.due).toBe(plan[kind] + (kind === '시공비' ? -100_000 : 0));
    }
  });
});

describe('manualAdjustOf — 화면은 사람이 적은 조정과 상계를 갈라 적는다', () => {
  it('영업비는 미귀속에서, 시공비는 2차분에서 상계를 걷어 낸다', () => {
    const entries = [e('영업비', '1차', 1_785_000, 1), e('시공비', '차감', -100_000, 1)];
    const sides = payoutSidesOf(entries, { turnkey: true, salesPlan: 1_500_000, consPlan: 2_700_000 });
    expect(manualAdjustOf({ kind: '영업비', ...sides.영업비 })).toEqual({ adjust: 0, adjustBy: [0, 0, 0] });
    expect(manualAdjustOf({ kind: '시공비', ...sides.시공비 })).toEqual({ adjust: -100_000, adjustBy: [0, -100_000, 0] });
  });
});

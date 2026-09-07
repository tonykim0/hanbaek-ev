/**
 * 전기안전점검수수료 — 운영사에게서 차수 밖에서 따로 받는 돈 (한백 지시 2026-09-06).
 *
 * ★이 그물이 지키는 것은 「게이트」와 「셈의 방향」이다.★ 안 받는 운영사 현장에 금액이
 * 적히면 받을 돈 합계와 한백 마진이 조용히 부풀고, 그 상태로 지급이 한 번 돌면 지급조건이
 * 잠겨 케이스도 못 고친다. 화면과 저장소가 각자 목록을 들면 그 어긋남이 안 보인다 —
 * 판정 정본이 하나(safetyFeeApplies)인 것을 여기서 못 박는다.
 */
import { describe, expect, it } from 'vitest';
import {
  checkSafetyFee, collectionRate, SAFETY_FEE_CPOS, safetyFeeApplies, safetyFeeCollected,
  safetyFeeDue, safetyFeeOpen,
} from '@/lib/settlement';
import { CPO_NAMES } from '@/types/project';
import type { SettlementStep } from '@/types/project';

describe('게이트 — 어느 운영사에게서 따로 받나', () => {
  it('SK일렉링크·나이스인프라·현대엔지니어링 셋이다', () => {
    expect([...SAFETY_FEE_CPOS].sort()).toEqual(['SK일렉링크', '나이스인프라', '현대엔지니어링'].sort());
  });

  /* 「따로 우리가 운영사로부터 안받아서 해당없음」(한백) — 케이스의 「한백 부담」과 같은 사실 */
  it('플러그링크·에버온은 해당없음', () => {
    expect(safetyFeeApplies('플러그링크')).toBe(false);
    expect(safetyFeeApplies('에버온')).toBe(false);
  });

  it('운영사 목록에 있는 다섯을 전부 판정한다 — 새 운영사가 늘면 여기서 걸린다', () => {
    const applies = CPO_NAMES.filter(safetyFeeApplies);
    expect(applies).toHaveLength(3);
    expect(CPO_NAMES).toHaveLength(5);
  });
});

describe('셈 — 받을 돈과 받은 돈으로 갈린다', () => {
  it('금액이 없으면 청구할 것도 받은 것도 없다', () => {
    const none = { safetyFee: null, safetyFeeCollectedAt: null };
    expect(safetyFeeOpen(none)).toBe(0);
    expect(safetyFeeCollected(none)).toBe(0);
  });

  /* 트리거가 없다 — 청구액을 적은 순간부터 받을 수 있다(기성 차수와 다른 점) */
  it('금액만 있으면 전액이 「받을 수 있는 돈」이다', () => {
    const open = { safetyFee: 450_000, safetyFeeCollectedAt: null };
    expect(safetyFeeOpen(open)).toBe(450_000);
    expect(safetyFeeCollected(open)).toBe(0);
  });

  it('수금일이 찍히면 「받을 수 있는 돈」에서 빠지고 「수금 완료」로 옮긴다', () => {
    const done = { safetyFee: 450_000, safetyFeeCollectedAt: '2026-09-06' };
    expect(safetyFeeOpen(done)).toBe(0);
    expect(safetyFeeCollected(done)).toBe(450_000);
  });

  /* 「총액 = 수금 완료 + 미수금」이 유지되려면 두 함수가 겹치지 않아야 한다 */
  it('두 함수의 합은 언제나 청구액이다 — 겹치거나 새지 않는다', () => {
    for (const at of [null, '2026-09-06']) {
      const s = { safetyFee: 450_000, safetyFeeCollectedAt: at };
      expect(safetyFeeOpen(s) + safetyFeeCollected(s)).toBe(450_000);
    }
  });
});

describe('저장 전 검사 — 라우트와 저장소가 같은 규칙을 본다', () => {
  it('빈 값은 통과다 — 아직 청구액을 안 적은 현장이 정상이다', () => {
    expect(checkSafetyFee(null, null)).toEqual([]);
  });

  it('0 보다 큰 원 단위 정수만 받는다', () => {
    expect(checkSafetyFee(450_000, null)).toEqual([]);
    expect(checkSafetyFee(0, null).join(' ')).toMatch(/0 보다 큰/);
    expect(checkSafetyFee(-1, null).join(' ')).toMatch(/0 보다 큰/);
    expect(checkSafetyFee(1_000.5, null).join(' ')).toMatch(/정수/);
  });

  it('수금일은 YYYY-MM-DD 다', () => {
    expect(checkSafetyFee(450_000, '2026-09-06')).toEqual([]);
    expect(checkSafetyFee(450_000, '2026/09/06').join(' ')).toMatch(/YYYY-MM-DD/);
  });

  /* 금액 없는 수금일은 「얼마 받았는지 모르는 수금」이다 — 그 상태를 만들 수 없어야 한다 */
  it('금액 없이 수금일만 있으면 막는다', () => {
    expect(checkSafetyFee(null, '2026-09-06').join(' ')).toMatch(/금액을 먼저/);
  });
});

describe('청구할 때 — 준공 정산이라 준공완료 전에는 금액을 모른다', () => {
  it('준공완료에서만 「적을 때」가 된다', () => {
    expect(safetyFeeDue('준공완료')).toBe(true);
    for (const s of ['계약완료', '착공', '개통 및 통신확인', '준공서류 접수/검토', '준공보완'] as const) {
      expect(safetyFeeDue(s)).toBe(false);
    }
  });
});

describe('수금률 — 차수만 센다 (한백 2026-09-06 「수금률에 포함시키지마」)', () => {
  const step = (o: Partial<SettlementStep>): SettlementStep => ({
    no: 1, trigger: '착공', basisLabel: '고정', planAmount: 3_000_000,
    state: 'waiting', openedAt: null, collectedAt: null, collectedAmount: null, ...o,
  });
  const 다받음 = [1, 2, 3].map((no) => step({
    no: no as 1 | 2 | 3, state: 'collected', collectedAt: '2026-09-01',
  }));

  /*
   * ★수수료가 미수여도 차수를 다 받으면 100% 다.★ 그 돈은 차수와 성격이 다르다 —
   * 준공완료 뒤 영수증으로 청구하는 차수 밖의 마지막 한 건이라, 차수 진행률에 섞으면
   * 「기성이 어디까지 왔나」가 흐려진다. 대신 받을 돈 합계·미수금·마진에는 든다.
   */
  it('차수를 다 받으면 100% — 수수료 미수는 이 숫자를 안 흔든다', () => {
    expect(collectionRate(다받음)).toBe(100);
  });

  it('차수가 없으면 null — 셀 것이 없다', () => {
    expect(collectionRate([])).toBeNull();
  });

  it('절반만 받으면 절반이다', () => {
    const 절반 = [
      step({ no: 1, state: 'collected', collectedAt: '2026-09-01' }),
      step({ no: 2 }),
    ];
    expect(collectionRate(절반)).toBe(50);
  });
});

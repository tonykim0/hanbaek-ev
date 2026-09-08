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
  safetyFeeDue, safetyFeeOpen, safetyFeeReceiptState,
} from '@/lib/settlement';
import { CPO_NAMES } from '@/types/project';
import type { CpoName } from '@/types/project';
import { processDocsFor } from '@/lib/doc-rules';
import { COMPLETION_DOC_KEYS, isCompletionDoc } from '@/lib/process';
import type { SettlementStep, SettlementSummary } from '@/types/project';
import { receivableTodos } from '@/lib/todo-receivables';

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

describe('할 일 — 트리거가 없는 돈이라 여기서 재촉한다', () => {
  const row = (over: Partial<SettlementSummary>): SettlementSummary => ({
    id: 'p1', name: '테스트아파트', cpo: 'SK일렉링크', qty: 3,
    stage: 'construction', status: '준공완료',
    ruleName: '착공 800,000원 → 준공마감 잔액',
    steps: [], planTotal: 0, collectedTotal: 0, cpoCloseDate: null,
    safetyFee: null, safetyFeeCollectedAt: null,
    safetyFeeReceiptCount: 0, safetyFeeReceiptStatus: 'none',
    salesOrg: null, gcOrg: null,
    payoutMilestones: { contractConfirmedAt: null, installCompletedAt: null, completedAt: null },
    salesPayoutDocsMissing: [], salesTotal: 0, consTotal: 0, marginTotal: 0, unpricedLines: 0,
    salesAdjust: 0, salesPaid: 0, salesLastPaidAt: null,
    consAdjust: 0, consPaid: 0, consLastPaidAt: null,
    payNote: null, ...over,
  } as SettlementSummary);
  const kinds = (r: SettlementSummary) => receivableTodos([r]).map((t) => t.kind);

  it('청구액을 적었는데 안 들어오면 「점검수수료 수금」이 선다', () => {
    expect(kinds(row({ safetyFee: 450_000 }))).toContain('점검수수료 수금');
  });

  it('수금까지 되면 사라진다', () => {
    expect(kinds(row({ safetyFee: 450_000, safetyFeeCollectedAt: '2026-09-06' })))
      .not.toContain('점검수수료 수금');
  });

  /* ★이 판정이 assemble 의 null→0 붕괴로 한 번 죽었다★ — 그래서 여기서 못 박는다 */
  it('준공완료인데 청구액이 없으면 「점검수수료 미기재」가 선다', () => {
    expect(kinds(row({ status: '준공완료' }))).toContain('점검수수료 미기재');
  });

  it('준공 전에는 미기재로 세우지 않는다 — 아직 올 때가 아니다', () => {
    expect(kinds(row({ status: '착공' }))).not.toContain('점검수수료 미기재');
  });

  it('안 받는 운영사는 두 카드 모두 안 선다', () => {
    const 에버온 = kinds(row({ cpo: '에버온', status: '준공완료', safetyFee: 450_000 }));
    expect(에버온).not.toContain('점검수수료 미기재');
    expect(에버온).not.toContain('점검수수료 수금');
  });
});

describe('서류 칸 — 받는 운영사만 서고, 준공을 막지 않는다', () => {
  const 준공서류 = [
    'completeConfirm', 'costSurvey', 'safety', 'safetyFeeReceipt', 'safetyMgr',
    'useInspect', 'asBuilt',
  ] as const;
  const names = (cpo: CpoName | null) =>
    processDocsFor(준공서류, { powerType: '모자분리', bizType: '환경부', cpo }).map((d) => d.name);

  /* 116곳과 43곳이 갈리는 자리다 — 판정 정본은 safetyFeeApplies 하나여야 한다 */
  it('SK·나이스·현대엔지니어링 현장에는 칸이 선다', () => {
    for (const cpo of ['SK일렉링크', '나이스인프라', '현대엔지니어링'] as const) {
      expect(names(cpo)).toContain('전기안전점검수수료 영수증');
    }
  });

  it('플러그링크·에버온 현장에는 칸이 아예 없다', () => {
    for (const cpo of ['플러그링크', '에버온'] as const) {
      expect(names(cpo)).not.toContain('전기안전점검수수료 영수증');
    }
  });

  it('운영사를 모르면 칸을 세우지 않는다 — 없는 서류를 요구하지 않는다', () => {
    expect(names(null)).not.toContain('전기안전점검수수료 영수증');
  });

  /*
   * ★준공완료의 조건이 아니다★ — 준공 「뒤에」 오는 서류라, 조건에 들면 영수증이 없어
   * 준공을 못 끝내고 준공을 못 끝내서 영수증이 안 오는 교착이 된다. 반려가 단계를
   * 되돌리는 것도 이 목록에 든 서류만이다(isCompletionDoc).
   */
  it('준공 조건 서류가 아니다 — 반려도 단계를 안 움직인다', () => {
    expect(isCompletionDoc('safetyFeeReceipt')).toBe(false);
    for (const k of ['completeConfirm', 'costSurvey', 'safety', 'safetyMgr', 'useInspect', 'asBuilt']) {
      expect(isCompletionDoc(k)).toBe(true);
    }
  });

  it('그 판정이 SQL 쪽 목록과 같다 — 두 벌이면 갈린다', () => {
    for (const k of COMPLETION_DOC_KEYS) expect(isCompletionDoc(k)).toBe(true);
    expect(COMPLETION_DOC_KEYS).not.toContain('safetyFeeReceipt');
  });
});

describe('할 일 — 청구 근거가 안 온 현장', () => {
  const row = (over: Partial<SettlementSummary>): SettlementSummary => ({
    id: 'p1', name: '테스트아파트', cpo: 'SK일렉링크', qty: 3,
    stage: 'construction', status: '준공완료',
    ruleName: '착공 800,000원 → 준공마감 잔액',
    steps: [], planTotal: 0, collectedTotal: 0, cpoCloseDate: null,
    safetyFee: null, safetyFeeCollectedAt: null,
    safetyFeeReceiptCount: 0, safetyFeeReceiptStatus: 'none',
    salesOrg: null, gcOrg: null,
    payoutMilestones: { contractConfirmedAt: null, installCompletedAt: null, completedAt: null },
    salesPayoutDocsMissing: [], salesTotal: 0, consTotal: 0, marginTotal: 0, unpricedLines: 0,
    salesAdjust: 0, salesPaid: 0, salesLastPaidAt: null,
    consAdjust: 0, consPaid: 0, consLastPaidAt: null,
    payNote: null, ...over,
  } as SettlementSummary);
  const kinds = (r: SettlementSummary) => receivableTodos([r]).map((t) => t.kind);

  it('청구액은 적혔는데 영수증이 0장이면 선다 — 그 근거로 청구한다', () => {
    expect(kinds(row({ safetyFee: 450_000 }))).toContain('점검수수료 영수증');
  });

  it('영수증이 오면 사라진다', () => {
    expect(kinds(row({
      safetyFee: 450_000, safetyFeeReceiptCount: 1, safetyFeeReceiptStatus: 'uploaded',
    }))).not.toContain('점검수수료 영수증');
  });

  /*
   * ★반려된 한 장은 근거가 아니다★ (2026-09-08 설계검증) — 장수만 세던 때는 돌려보낸
   * 영수증이 있는 현장이 「근거 있음」으로 빠져서, 청구할 수 없는데 할 일에도 없었다.
   */
  it('반려된 영수증이 있어도 선다 — 그 파일로는 청구를 못 한다', () => {
    expect(kinds(row({
      safetyFee: 450_000, safetyFeeReceiptCount: 1, safetyFeeReceiptStatus: 'rejected',
    }))).toContain('점검수수료 영수증');
  });

  it('반려와 미제출은 문구가 갈린다 — 협력사가 할 일이 다르다', () => {
    const what = (over: Partial<SettlementSummary>) =>
      receivableTodos([row(over)]).find((t) => t.kind === '점검수수료 영수증')?.what;
    expect(what({ safetyFee: 450_000, safetyFeeReceiptCount: 1, safetyFeeReceiptStatus: 'rejected' }))
      .toContain('반려');
    expect(what({ safetyFee: 450_000 })).toContain('미제출');
  });

  /* 반려된 칸은 파일을 다 빼도 반려로 남는다(store/docs) — 그때도 할 일은 그대로다 */
  it('반려인데 파일이 0장이어도 선다', () => {
    expect(kinds(row({ safetyFee: 450_000, safetyFeeReceiptStatus: 'rejected' })))
      .toContain('점검수수료 영수증');
  });

  it('청구액이 없으면 아직 물을 일이 아니다', () => {
    expect(kinds(row({}))).not.toContain('점검수수료 영수증');
  });

  it('안 받는 운영사는 안 선다', () => {
    expect(kinds(row({ cpo: '에버온', safetyFee: 450_000 }))).not.toContain('점검수수료 영수증');
  });
});

describe('영수증 상태 — 장수만으로는 근거가 왔는지 알 수 없다', () => {
  /*
   * ★이 판정이 없어서 표와 기성 탭이 반려된 한 장을 「영수증 1장」으로 읽었다★
   * (2026-09-08 설계검증). 반려는 파일을 지우지 않으므로 장수와 상태를 같이 봐야 한다.
   */
  it('반려는 파일이 있어도 근거가 아니다', () => {
    expect(safetyFeeReceiptState('rejected', 2)).toBe('rejected');
  });

  it('반려는 파일이 없을 때도 반려다 — 미제출과 갈라 말한다', () => {
    expect(safetyFeeReceiptState('rejected', 0)).toBe('rejected');
    expect(safetyFeeReceiptState('none', 0)).toBe('none');
  });

  it('검수 전에도 와 있는 것으로 본다 — 반려하지 않는 한 청구를 막지 않는다', () => {
    expect(safetyFeeReceiptState('uploaded', 1)).toBe('arrived');
    expect(safetyFeeReceiptState('approved', 1)).toBe('arrived');
  });

  it('칸만 서고 파일이 없으면 안 온 것이다', () => {
    expect(safetyFeeReceiptState('uploaded', 0)).toBe('none');
    expect(safetyFeeReceiptState('approved', 0)).toBe('none');
  });
});

/**
 * 플러그링크 하반기(2026년 7월 1일 접수분) 기성 단계 — 정의 파일을 그물 안에 들인다.
 *
 * ★왜 이 시험이 있나★ 케이스 정의는 그동안 시험 밖이었다. 단계를 잘못 적어도 아무것도
 * 안 잡는다: 마지막 차수가 「잔액」이라 합 검사(checkSettlementSteps)는 2차 금액이 무엇이든
 * 통과한다 — 「(턴키−20만)의 절반」이 아니게 되어도 초록이다. 여기서 그 절반을 다시 계산해
 * 못 박는다. 값은 migrations/0053 이 프로덕션에 넣은 것과 같아야 한다(한백 지시 2026-09-04).
 */
import { describe, expect, it } from 'vitest';
import { linkRules } from '@/lib/pricing-policy-link-h2';
import { PL_INV_STEPS, PL_KEEP, PL_RESTORE, plNewRules, plSubSteps } from '@/lib/pricing-policy-plhec-h2';
import { checkPricingRule, startKey } from '@/lib/pricing-match';
import { checkSettlementSteps, settlementStepsKeyOf, stepUnits, turnkeyUnit } from '@/lib/settlement';
import { pl2609Rules } from '@/lib/pricing-policy-pl-2609';
import type { NewPricingRule } from '@/types/project';

const 턴키 = (r: NewPricingRule) => turnkeyUnit(r) as number;

/** 하반기 케이스 전부 — 정의 파일 넷 묶음 중 값이 여기 있는 셋 (PL_KEEP 은 id·턴키만 든다) */
const 하반기 = [...PL_RESTORE, ...plNewRules(), ...linkRules().filter((r) => r.cpo === '플러그링크')];

describe('케이스가 저장 전 검증을 통과한다', () => {
  for (const r of 하반기) {
    it(r.caseName, () => {
      expect(checkPricingRule(r)).toEqual([]);
    });
  }
});

describe('보조금 3단계 — 20만 + 공사비 선금 50% + 잔금', () => {
  /* 문서: 영업비 20만 계약 승인 후 · 공사비 선금 50% · 잔금 50% (비율 미확정) */
  const 보조 = [
    ...PL_KEEP.map((k) => ({ 이름: k.id, turnkey: k.turnkey, steps: plSubSteps(k.turnkey) })),
    ...PL_RESTORE.map((r) => ({ 이름: r.id, turnkey: 턴키(r), steps: r.settlementSteps })),
  ];

  it('다섯 케이스 전부다 — 유지 3 + 복원 2', () => {
    expect(보조.map((b) => b.turnkey)).toEqual([2_400_000, 2_600_000, 2_400_000, 2_000_000, 2_200_000]);
  });

  for (const b of 보조) {
    it(`${b.이름} — 20만 / (턴키−20만)÷2 / 잔액`, () => {
      const 절반 = (b.turnkey - 200_000) / 2;
      expect(stepUnits(b.steps, b.turnkey)).toEqual([200_000, 절반, 절반]);
      /* 합이 턴키와 맞는지는 잔액이 늘 맞춰 주지만, 그 잔액이 앞 차수와 같은 값이어야 「50%」다 */
      expect(checkSettlementSteps(b.steps, b.turnkey)).toEqual([]);
    });
  }

  it('트리거는 환경부 승인 → 착공 → 준공마감 순이다', () => {
    for (const b of 보조) {
      expect(b.steps.map((s) => s.trigger)).toEqual(['환경부 승인', '착공', '준공마감']);
    }
  });

  it('20만을 뺀 나머지가 반으로 안 갈리는 턴키는 거절한다 — 원 단위가 조용히 깎이지 않게', () => {
    expect(() => plSubSteps(2_300_001)).toThrow(/반으로 안 갈립니다/);
  });
});

describe('자체투자·연동 2단계 — 20만 먼저, 나머지는 준공 이후', () => {
  /* 「연동도 자투에 포함돼」 (한백 지시 2026-09-04) — 다섯 케이스가 규칙 한 행을 같이 쓴다 */
  const 자투연동 = [...plNewRules(), ...linkRules().filter((r) => r.cpo === '플러그링크')];

  /* 자투 상업 10년(120만)은 걷었다 (한백 2026-09-05) — 영업비 0 인데 1차가 영업비 20만이었다 */
  it('네 케이스다 — 자투 2 + 연동 2', () => {
    expect(자투연동.map((r) => 턴키(r))).toEqual([2_200_000, 2_400_000, 550_000, 750_000]);
  });

  it('단계 정의가 넷 다 같다 — 규칙 표에 한 행으로 모인다', () => {
    const keys = new Set(자투연동.map((r) => settlementStepsKeyOf(r.settlementSteps)));
    expect(keys).toEqual(new Set([settlementStepsKeyOf(PL_INV_STEPS)]));
  });

  it('첫 차수는 착공이다 — 자투·연동에는 환경부 승인이 없다', () => {
    expect(PL_INV_STEPS.map((s) => s.trigger)).toEqual(['착공', '준공마감']);
  });

  for (const r of 자투연동) {
    it(`${r.caseName} — 20만 + 잔액`, () => {
      const t = 턴키(r);
      expect(stepUnits(r.settlementSteps, t)).toEqual([200_000, t - 200_000]);
      expect(checkSettlementSteps(r.settlementSteps, t)).toEqual([]);
    });
  }

  it('연동 55만도 20만을 먼저 받고 35만이 남는다 — 잔액이 0 으로 깎이지 않는다', () => {
    expect(stepUnits(PL_INV_STEPS, 550_000)).toEqual([200_000, 350_000]);
  });
});

describe('기성은 3차까지다 — 이번 변경이 그 상한을 처음 쓴다', () => {
  it('4차를 넣으면 막는다', () => {
    const 네차 = [
      ...plSubSteps(2_400_000).slice(0, 2),
      { trigger: '착공' as const, basis: { kind: '고정' as const, unit: 100_000 } },
      { trigger: '준공마감' as const, basis: { kind: '잔액' as const } },
    ];
    expect(checkSettlementSteps(네차, 2_400_000).join(' ')).toMatch(/3차까지/);
  });
});

describe('9월 1일 벌 — 보조금 +50만(마진 30만) · 연동 120/140만 (한백 2026-09-06)', () => {
  const rules = pl2609Rules();
  const byId = new Map(rules.map((r) => [r.id, r]));

  it('여섯 개다 — 보조금 4 + 연동 2. 자투·상업은 이 벌에 없다', () => {
    expect(rules).toHaveLength(6);
    expect(rules.filter((r) => r.bizType === '환경부')).toHaveLength(4);
    expect(rules.filter((r) => r.bizType === '연동')).toHaveLength(2);
    expect(rules.some((r) => r.bizType === '자체투자')).toBe(false);
    expect(rules.some((r) => r.bldgTypes.includes('상업시설'))).toBe(false);
  });

  it('전부 저장 전 검증을 통과한다', () => {
    for (const r of rules) expect(checkPricingRule(r)).toEqual([]);
  });

  /*
   * ★7/1 벌 + 50만이 이 벌의 정의다.★ 분해(영업·시공·마진)를 따로 적으면 합이 총액과
   * 어긋나도 아무도 모른다 — 총액과 마진에서 영업비를 되계산해 못 박는다.
   */
  it('보조금 넷 — 받는 단가가 7/1 벌보다 50만 높고, 마진 30만 · 시공 95만 · 나머지 영업비', () => {
    const 기대 = [
      { id: 'pl-2609-y7-mother-new-apt', 전: 2_400_000, 총: 2_900_000 },
      { id: 'pl-2609-y10-mother-new-apt', 전: 2_600_000, 총: 3_100_000 },
      { id: 'pl-2609-y7-kepco-new-apt', 전: 2_000_000, 총: 2_500_000 },
      { id: 'pl-2609-y10-kepco-new-apt', 전: 2_200_000, 총: 2_700_000 },
    ];
    for (const e of 기대) {
      const r = byId.get(e.id) as NewPricingRule;
      expect(e.총 - e.전).toBe(500_000);
      expect(turnkeyUnit(r)).toBe(e.총);
      expect(r.margin).toBe(300_000);
      expect(r.consUnit).toBe(950_000);
      expect(r.salesUnit).toBe(e.총 - 950_000 - 300_000);
    }
  });

  it('연동 둘 — 7년 120만 · 10년 140만, 시공 0 · 마진 20만', () => {
    for (const [id, 총] of [['pl-2609-y7-link-apt', 1_200_000], ['pl-2609-y10-link-apt', 1_400_000]] as const) {
      const r = byId.get(id) as NewPricingRule;
      expect(turnkeyUnit(r)).toBe(총);
      expect(r.consUnit).toBe(0);
      expect(r.margin).toBe(200_000);
      expect(r.salesUnit).toBe(총 - 200_000);
    }
  });

  it('기성은 7/1 벌과 같은 꼴이고 2차는 새 턴키로 다시 계산된다', () => {
    for (const r of rules.filter((x) => x.bizType === '환경부')) {
      const t = turnkeyUnit(r) as number;
      expect(stepUnits(r.settlementSteps, t)).toEqual([200_000, (t - 200_000) / 2, (t - 200_000) / 2]);
      expect(checkSettlementSteps(r.settlementSteps, t)).toEqual([]);
    }
    for (const r of rules.filter((x) => x.bizType === '연동')) {
      const t = turnkeyUnit(r) as number;
      expect(stepUnits(r.settlementSteps, t)).toEqual([200_000, t - 200_000]);
      expect(settlementStepsKeyOf(r.settlementSteps)).toBe(settlementStepsKeyOf(PL_INV_STEPS));
    }
  });

  /* id 가 옛 케이스와 겹치면 on conflict 로 조용히 안 들어간다 — 프로덕션 id 와 견준다 */
  it('id 가 옛 벌과 겹치지 않는다', () => {
    const 옛것 = [
      'pl-h1-y7-mother-new-apt', 'pl-h1-y10-mother-new-apt', 'pl-h1-y10-kepco-new-apt',
      'pl-h2-y7-mother-new-apt', 'pl-h2-y10-mother-new-apt',
      'pl-h2-y7-kepco-new-apt', 'pl-h2-y10-kepco-new-apt',
      'pl-y10-mother-new-biz-2026', 'pl-y7-mother-inplace-apt-2026', 'pl-y10-mother-inplace-apt-2026',
      'pl-y7-mother-link-apt-2026', 'pl-y10-mother-link-apt-2026',
    ];
    for (const r of rules) expect(옛것).not.toContain(r.id);
  });

  it('적용 시작이 9월 1일이라 시기 축에서 7/1 벌보다 뒤에 선다', () => {
    for (const r of rules) expect(r.startDate).toBe('2026년 9월 1일 ~ 12월 31일');
    /* 시기 목록은 이 키의 문자열 정렬이다 — 9월이 7월 뒤에 서야 매트릭스가 새 벌을 최신으로 연다 */
    expect(startKey({ startDate: '2026년 9월 1일 ~ 12월 31일', bizYear: 2026 })).toBe('2026-09-01');
    expect(startKey({ startDate: '2026년 9월 1일 ~ 12월 31일', bizYear: 2026 })
      .localeCompare(startKey({ startDate: '2026년 7월 1일 ~ 8월 31일', bizYear: 2026 }))).toBeGreaterThan(0);
  });
});

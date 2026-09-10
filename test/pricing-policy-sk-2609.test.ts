/**
 * SK일렉링크 2026-09-01 정책 — 정의 파일을 그물 안에 들인다.
 *
 * ★왜 이 시험이 있나★ 한백이 준 것은 「받는 총액 + 한백 마진」이고 케이스는 영업·시공·마진
 * 셋으로 저장된다. 그 분해가 틀려도 checkPricingRule 은 모른다(형태만 본다). 여기서 총액과
 * 협력사 몫(영업+시공)을 한백이 준 숫자로 다시 못 박는다 — 시공비 상수를 바꾸면 영업비가
 * 따라 움직이되 협력사 몫은 그대로여야 한다.
 */
import { describe, expect, it } from 'vitest';
import {
  SK_2609_INV_CONS, SK_2609_LINK_CONS, SK_2609_START, SK_2609_SUB_CONS, SK_H2_KEPCO_FIX,
  SK_LUMP_STEPS, SK_SUB_STEPS, sk2609Rules,
} from '@/lib/pricing-policy-sk-2609';
import { checkPricingRule, startKey } from '@/lib/pricing-match';
import { checkSettlementSteps, settlementStepsKeyOf, stepUnits, turnkeyUnit } from '@/lib/settlement';
import { SETTLEMENT_RULE_BY_ID } from '@/lib/data/seed/settlement-rules';
import { SPLITS_SELF_REPL } from '@/types/project';

const rules = sk2609Rules();
const byId = new Map(rules.map((r) => [r.id, r]));
const 만 = (n: number) => n * 10_000;

describe('케이스가 저장 전 검증을 통과한다', () => {
  for (const r of rules) {
    it(r.caseName, () => {
      expect(checkPricingRule(r)).toEqual([]);
    });
  }
});

describe('한백이 준 숫자 — 받는 총액과 마진 (2026-09-10)', () => {
  const 기대: Array<[id: string, 총액: number, 마진: number]> = [
    ['sk-2609-y7-mother-new', 만(280), 만(20)],
    ['sk-2609-y10-mother-new', 만(290), 만(30)],
    ['sk-2609-y7-kepco-new', 만(250), 만(20)],
    ['sk-2609-y10-kepco-new', 만(260), 만(30)],
    ['sk-2609-y7-mother-inplace-both', 만(220), 만(20)],
    ['sk-2609-y10-mother-inplace-both', 만(230), 만(20)],
    ['sk-2609-y7-mother-link-both', 만(220), 만(40)],
    ['sk-2609-y10-mother-link-both', 만(230), 만(40)],
  ];

  it('여덟 칸이 전부 있고 그 밖은 없다', () => {
    expect(rules.map((r) => r.id)).toEqual(기대.map(([id]) => id));
  });

  for (const [id, 총액, 마진] of 기대) {
    it(`${id} — 영업+시공+마진 = ${총액 / 10_000}만, 마진 ${마진 / 10_000}만`, () => {
      const r = byId.get(id)!;
      expect(r.salesUnit + r.consUnit + r.margin).toBe(총액);
      expect(turnkeyUnit(r)).toBe(총액);
      expect(r.margin).toBe(마진);
      expect(r.total).toBe(총액);
      expect(r.salesUnit).toBeGreaterThan(0);
    });
  }

  it('★협력사 몫(영업+시공)은 시공비 상수와 무관하다★ — 마진을 뺀 총액 그대로', () => {
    for (const r of rules) expect(r.salesUnit + r.consUnit).toBe(r.total - r.margin);
    /* 한백이 말한 그대로: 보조 모자 260·260 · 보조 한전 230·230 · 자투 200·210 · 연동 180·190 */
    expect(rules.map((r) => (r.salesUnit + r.consUnit) / 10_000)).toEqual([260, 260, 230, 230, 200, 210, 180, 190]);
  });
});

describe('시공비 — 유형마다 하나, 보조는 수전방식 무관', () => {
  it('보조 넷은 같은 시공비다 — 한전불입만 다르던 것이 노션 오기였다(한백 2026-09-10)', () => {
    const 보조 = rules.filter((r) => r.bizType === '환경부');
    expect(보조).toHaveLength(4);
    for (const r of 보조) expect(r.consUnit).toBe(SK_2609_SUB_CONS);
    expect(SK_2609_SUB_CONS).toBe(만(110));
  });

  it('자투도 110 (하반기 90 에서 인상, 한백 2026-09-10 「영업비 90/100 시공비 110 마진 20」), 연동은 0', () => {
    for (const r of rules.filter((r) => r.bizType === '자체투자')) expect(r.consUnit).toBe(SK_2609_INV_CONS);
    for (const r of rules.filter((r) => r.bizType === '기설치 연동')) expect(r.consUnit).toBe(SK_2609_LINK_CONS);
    expect(SK_2609_INV_CONS).toBe(만(110));
    expect(SK_2609_LINK_CONS).toBe(0);
    /* 한백이 준 영업비 그대로 — 7년 90 · 10년 100 */
    expect(rules.filter((r) => r.bizType === '자체투자').map((r) => r.salesUnit)).toEqual([만(90), 만(100)]);
  });
});

describe('축 — 7/20 케이스와 어긋나지 않게', () => {
  it('7년과 10년이 따로 선다 — 마진이 갈리므로 「7·10년 한 칸」이 아니다', () => {
    for (const r of rules) expect(r.termYears).toHaveLength(1);
  });

  it('자투는 제자리교체 한 칸이다 — SK 는 더 안 가른다', () => {
    const 자투 = rules.filter((r) => r.bizType === '자체투자');
    for (const r of 자투) expect(r.replType).toBe('자체투자 (제자리교체)');
    expect(SPLITS_SELF_REPL.has('SK일렉링크')).toBe(false);
  });

  it('한전불입은 보조 신규에만 있다 — 자투·연동은 모자분리 조건', () => {
    for (const r of rules) {
      if (r.bizType !== '환경부') expect(r.powerType).toBe('모자분리');
    }
    expect(rules.filter((r) => r.powerType === '한전불입').map((r) => r.termYears[0])).toEqual([7, 10]);
  });

  it('건축물유형은 전체(공동+상업) — 7/20 케이스와 같다', () => {
    for (const r of rules) expect(r.bldgTypes).toEqual(['공동주택', '상업시설']);
  });

  it('★시작일이 7/20 뒤라 후보 목록 맨 위에 선다★ (lib/pricing-match byStart)', () => {
    /* ★구간으로 적는다★ — PL 과 같은 꼴(한백 2026-09-10). 정렬은 앞 날짜를 읽는다 */
    expect(SK_2609_START).toBe('2026년 9월 1일 ~ 12월 31일');
    for (const r of rules) expect(r.caseName).toContain(`(${SK_2609_START})`);
    for (const r of rules) {
      expect(startKey(r) > startKey({ startDate: '2026년 7월 20일', bizYear: 2026 })).toBe(true);
    }
  });

  it('id 는 sk-2609- 로 시작하고 서로 겹치지 않는다 — pricingRuleId 의 축 충돌(감사 H4)을 피한다', () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('sk-2609-')).toBe(true);
  });
});

describe('정산 — 보조는 착공 80만 → 잔액, 자투·연동은 준공 일시금', () => {
  it('보조 단계는 기존 sk-2step 규칙과 같은 모양이다 — 같은 규칙이 두 얼굴로 쌓이지 않게', () => {
    expect(settlementStepsKeyOf(SK_SUB_STEPS)).toBe(settlementStepsKeyOf(SETTLEMENT_RULE_BY_ID.get('sk-2step')!.steps));
    for (const r of rules.filter((r) => r.bizType === '환경부')) expect(r.settlementSteps).toBe(SK_SUB_STEPS);
  });

  it('자투·연동 단계는 기존 lump-100 과 같은 모양이다', () => {
    expect(settlementStepsKeyOf(SK_LUMP_STEPS)).toBe(settlementStepsKeyOf(SETTLEMENT_RULE_BY_ID.get('lump-100')!.steps));
    for (const r of rules.filter((r) => r.bizType !== '환경부')) expect(r.settlementSteps).toBe(SK_LUMP_STEPS);
  });

  it('보조: 착공 80만 뒤 잔액이 턴키에 맞고, 합 검사를 통과한다', () => {
    for (const r of rules.filter((r) => r.bizType === '환경부')) {
      const 턴키 = turnkeyUnit(r) as number;
      expect(stepUnits(r.settlementSteps, 턴키)).toEqual([만(80), 턴키 - 만(80)]);
      expect(checkSettlementSteps(r.settlementSteps, 턴키)).toEqual([]);
    }
  });
});

describe('7/20 한전불입 시공비 정정 — 120 → 100', () => {
  it('협력사 몫(영업+시공 = 220)은 그대로다 — 나눔만 바뀐다', () => {
    const { before, after } = SK_H2_KEPCO_FIX;
    expect(before.salesUnit + before.consUnit).toBe(after.salesUnit + after.consUnit);
    expect(after.consUnit).toBe(만(100));
    expect(SK_H2_KEPCO_FIX.id).toBe('sk-h2-y10-kepco-new');
  });
});

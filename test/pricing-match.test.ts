/**
 * 단가 케이스 — 축으로 후보를 좁히고, 저장 전에 앞뒤를 본다.
 *
 * ★케이스는 라인이 참조하면 불변이고 삭제도 안 된다★ — 잘못 만든 케이스는 중지 말고는
 * 치울 길이 없다. 그래서 저장 전 검증이 유일한 방어다.
 */
import { describe, expect, it } from 'vitest';
import { cellsOf, checkPricingRule, duplicateOf, matchingRules, normalizePricingRule, pricingRuleId, startKey } from '@/lib/pricing-match';
import { bizLabel, bizTypeOf, powerTypesOfRepl, replLabel, SPLITS_SELF_REPL } from '@/types/project';
import type { NewPricingRule, PricingRule } from '@/types/project';

const 케이스 = (o: Partial<PricingRule>): PricingRule => ({
  id: 'x', caseName: 'x', cpo: '에버온', bizType: '환경부', powerType: '모자분리',
  termYears: [5], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
  bizYear: 2026, startDate: '2026년 7월 1일', salesUnit: 1_000_000, consUnit: 1_000_000,
  margin: 200_000, active: true, ...o,
}) as PricingRule;

const 새케이스 = (o: Partial<NewPricingRule>): NewPricingRule => ({
  caseName: '시험', cpo: '에버온', bizType: '환경부', powerType: '모자분리',
  termYears: [5], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
  bizYear: 2026, startDate: '2026년 7월 1일', salesUnit: 1_000_000, consUnit: 1_000_000,
  margin: 200_000, supervisionBearer: null, safetyFeeBearer: null, supplyItems: null,
  promo: null, promoExtend: null, chargeRate: null, installTerms: null, otherSupport: null,
  coexistTerms: null, miscTerms: null, note: null, settlementSteps: [], ...o,
}) as NewPricingRule;

describe('matchingRules — 축으로 좁힌다', () => {
  const all = [
    케이스({ id: 'a', powerType: '모자분리' }),
    케이스({ id: 'b', powerType: '한전불입' }),
    케이스({ id: 'c', cpo: '나이스인프라' }),
    케이스({ id: 'd', active: false }),
  ];
  const 현장 = { cpo: '에버온' as const, bizType: '환경부' as const, replType: null, bldgType: '공동주택' as const };

  it('운영사가 다르면 후보에도 안 든다', () => {
    const { exact, others } = matchingRules(현장, { termYears: 5, powerType: '모자분리', replType: '환경부 신규' }, all);
    expect(exact.map((r) => r.id)).toEqual(['a']);
    expect(others.map((r) => r.id)).not.toContain('c');
  });

  it('★중지된 케이스는 새로 못 붙는다★', () => {
    const { exact, others } = matchingRules(현장, { termYears: 5, powerType: '모자분리', replType: '환경부 신규' }, all);
    expect([...exact, ...others].map((r) => r.id)).not.toContain('d');
  });

  it('수전방식이 비면 그 축을 건너뛴다 — 혼용 현장이 그렇다', () => {
    const { exact, usedAxes } = matchingRules(현장, { termYears: 5, powerType: null, replType: '환경부 신규' }, all);
    expect(exact.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(usedAxes).not.toContain('수전방식');
  });

  it('무엇으로 좁혔는지 알려준다 — 사람이 판단할 수 있게', () => {
    const { usedAxes } = matchingRules(현장, { termYears: 5, powerType: '모자분리', replType: '환경부 신규' }, all);
    expect(usedAxes).toEqual(['운영사', '계약연수', '사업구분', '수전방식', '교체유형', '건축물유형']);
  });
});

describe('설치위치 — 실내 · 실외로 받는 단가가 갈리는 케이스 (2026-11-24 나이스 자체투자)', () => {
  const 자투 = { cpo: '나이스인프라' as const, bizType: '자체투자' as const, replType: '자체투자 (제자리교체)' as const, termYears: [10] };
  const 실내 = 케이스({ ...자투, id: 'in', installLoc: '실내', startDate: '2026년 10월 6일' });
  const 실외 = 케이스({ ...자투, id: 'out', installLoc: '실외', startDate: '2026년 10월 6일' });
  const 옛것 = 케이스({ ...자투, id: 'old', installLoc: null, startDate: '2026년 8월 1일' });
  const 라인 = { termYears: 10, powerType: '모자분리' as const, replType: '자체투자 (제자리교체)' as const };
  const 현장 = (installLoc: '실내' | '실외' | '실내·실외' | null) =>
    ({ cpo: '나이스인프라' as const, bizType: '자체투자' as const, replType: null, bldgType: '공동주택' as const, installLoc });

  it('구분 없는 케이스는 실내 · 실외 두 칸을 다 덮고, 정한 케이스는 제 칸만 덮는다', () => {
    expect(cellsOf(옛것)).toHaveLength(2);
    expect(cellsOf(실외)).toEqual(['자체투자 (제자리교체)|모자분리|10|공동주택|턴키|실외']);
  });

  it('★같은 시기에 실내 · 실외 케이스가 나란히 선다★ — 구분 없는 케이스와는 겹친다', () => {
    expect(duplicateOf(실외, [실내])).toBeNull();
    expect(duplicateOf(실외, [실외])?.id).toBe('out');
    expect(duplicateOf({ ...실외, installLoc: null }, [실내])?.id).toBe('in');
    // 시기가 다르면 개정이다 — 옛 시기의 구분 없는 케이스와는 안 겹친다
    expect(duplicateOf(실외, [옛것])).toBeNull();
  });

  it('실외 현장에는 실내 케이스가 안 붙는다 — 구분 없는 옛 케이스는 그대로 후보다', () => {
    const { exact, others, usedAxes } = matchingRules(현장('실외'), 라인, [실내, 실외, 옛것]);
    expect(exact.map((r) => r.id)).toEqual(['out', 'old']);
    expect(others.map((r) => r.id)).toEqual(['in']);
    expect(usedAxes).toContain('설치위치');
  });

  it('실내·실외 현장 · 설치위치 미지정 현장은 둘 다 후보다 — 사람이 고른다', () => {
    for (const loc of ['실내·실외', null] as const) {
      const { exact, usedAxes } = matchingRules(현장(loc), 라인, [실외, 옛것, 실내]);
      // 같은 시기면 실내 → 실외 차례, 늦게 시작한 것이 위
      expect(exact.map((r) => r.id)).toEqual(['in', 'out', 'old']);
      expect(usedAxes).not.toContain('설치위치');
    }
  });

  it('설치위치를 안 싣는 부르는 곳(스크립트)도 그대로 돈다', () => {
    const { exact } = matchingRules({ cpo: '나이스인프라', bizType: '자체투자', replType: null, bldgType: '공동주택' }, 라인, [실내, 실외]);
    expect(exact).toHaveLength(2);
  });

  it('저장값은 실내 · 실외 · 비움뿐이다 — 현장 값 「실내·실외」는 케이스의 값이 아니다', () => {
    expect(checkPricingRule(새케이스({ installLoc: '실외' }))).toEqual([]);
    expect(checkPricingRule(새케이스({ installLoc: null }))).toEqual([]);
    expect(checkPricingRule(새케이스({ installLoc: '실내·실외' as never })).join()).toContain('설치위치');
    // 칸을 모르는 옛 정의(installLoc 없음)는 구분 없음으로 저장된다
    expect(normalizePricingRule(새케이스({})).installLoc).toBeNull();
  });

  it('위치를 정한 케이스는 id 에도 드러난다', () => {
    expect(pricingRuleId(새케이스({ installLoc: '실외' }), new Set())).toContain('-out-');
    expect(pricingRuleId(새케이스({}), new Set())).not.toMatch(/-(in|out)-/);
  });
});

describe('pricingRuleId — 축에서 만든다', () => {
  it('같은 축이면 같은 id 를 노린다 — 겹치면 번호가 붙는다', () => {
    const r = 새케이스({});
    const first = pricingRuleId(r, new Set());
    expect(pricingRuleId(r, new Set([first]))).toBe(`${first}-2`);
  });

  it('수전방식·교체유형이 id 에 드러난다', () => {
    expect(pricingRuleId(새케이스({ powerType: '한전불입' }), new Set())).toContain('kepco');
    expect(pricingRuleId(새케이스({}), new Set())).toContain('mother');
  });
});

describe('checkPricingRule — 저장 전 검산', () => {
  it('제대로 된 케이스는 통과', () => {
    expect(checkPricingRule(새케이스({}))).toEqual([]);
  });

  it('★받는 단가가 0원인 케이스는 만들 수 없다★', () => {
    expect(checkPricingRule(새케이스({ salesUnit: 0, consUnit: 0, margin: 0 })).join())
      .toMatch(/0 ?원/);
  });

  it('교체유형과 사업구분이 어긋나면 막는다 — 어느 현장에도 안 맞는 케이스가 된다', () => {
    expect(checkPricingRule(새케이스({ replType: '자체투자 (제자리교체)', bizType: '환경부' })).join())
      .toMatch(/사업구분/);
  });

  it('연동은 모자분리 전제다 — 한전불입 연동은 설 자리가 없다', () => {
    expect(checkPricingRule(새케이스({ replType: '기설치 연동', bizType: '기설치 연동', powerType: '한전불입' })).join())
      .toMatch(/모자분리/);
  });

  /* 한전불입금은 보조사업에서 운영사가 대주는 돈이다 — 제 돈으로 까는 투자사업에는
     그 자리가 없고, 해주는 운영사도 없다(한백 2026-08-30) */
  it.each(['자체투자 (제자리교체)', '자체투자 (신규위치)'] as const)(
    '%s 도 모자분리만이다 — 한전불입을 해주는 운영사가 없다',
    (replType) => {
      expect(checkPricingRule(새케이스({ replType, bizType: '자체투자', powerType: '한전불입' })).join())
        .toMatch(/모자분리/);
      expect(checkPricingRule(새케이스({ replType, bizType: '자체투자', powerType: '모자분리' })))
        .toEqual([]);
    }
  );

  it('한전불입이 붙는 것은 환경부 신규뿐이다', () => {
    expect(powerTypesOfRepl('환경부 신규')).toContain('한전불입');
    for (const r of ['자체투자 (제자리교체)', '자체투자 (신규위치)', '기설치 연동'] as const) {
      expect(powerTypesOfRepl(r)).toEqual(['모자분리']);
    }
  });

  it('기성 단계 합이 받는 단가와 다르면 막는다', () => {
    const bad = 새케이스({
      settlementSteps: [{ trigger: '착공', basis: { kind: '고정', unit: 100 } }],
    });
    expect(checkPricingRule(bad).join()).toMatch(/기성 단계 합/);
  });

  it('운영사 이름에 오타(뒤 공백)가 있으면 막는다 — 문자열 완전 일치라 어느 라인에도 안 맞는다', () => {
    expect(checkPricingRule(새케이스({ cpo: '에버온 ' as never })).join()).toMatch(/운영사/);
  });
});

describe('replLabel — 교체유형을 안 가르는 운영사', () => {
  it('에버온·SK 만 제자리교체·신규위치를 가른다', () => {
    expect(SPLITS_SELF_REPL.has('에버온')).toBe(true);
    /*
     * ★SK 는 가른다★ (한백 2026-09-17). 9/1 정책이 「구분없이」라고 2026-09-10 에 뺐다가
     * 되돌렸다 — 이 집합은 운영사만 보고 시기를 못 봐서, 빼는 순간 9/1 ★이전★ 계약분까지
     * 같이 눕었다(7/20~8/31 은 150 대 200·210 으로 실제로 갈린다). 값이 같은 9/1 은
     * 케이스를 두 벌 두는 쪽으로 풀었다(migrations/0079).
     */
    expect(SPLITS_SELF_REPL.has('SK일렉링크')).toBe(true);
    expect(SPLITS_SELF_REPL.has('나이스인프라')).toBe(false);
  });

  it('★안 가르는 운영사는 「자체투자」 한 마디다★', () => {
    expect(replLabel('나이스인프라', '자체투자 (제자리교체)')).toBe('자체투자');
    expect(replLabel('현대엔지니어링', '자체투자 (신규위치)')).toBe('자체투자');
  });

  it('가르는 운영사는 괄호를 그대로 둔다', () => {
    expect(replLabel('에버온', '자체투자 (제자리교체)')).toBe('자체투자 (제자리교체)');
  });

  it('환경부 신규는 어느 운영사든 「기후부 신규」로 적는다 — 저장값은 그대로(2026-11-17 한백 「둘다 해」)', () => {
    expect(replLabel('나이스인프라', '환경부 신규')).toBe('기후부 신규');
    expect(replLabel('SK일렉링크', '환경부 신규')).toBe('기후부 신규');
  });
});

describe('startKey — 적용 시작을 견줄 수 있는 값으로', () => {
  /*
   * 플러그링크 하반기는 「2026년 7월 1일 ~ 8월 31일」처럼 끝까지 적는다(한백 2026-09-06).
   * 정렬·시기 탭·중복 판정이 전부 이 키를 보므로, 범위 표기가 앞 날짜로 읽히지 않으면
   * 케이스가 상반기 탭으로 옮겨 가거나 매트릭스에서 사라진다.
   */
  it('범위 표기는 앞 날짜로 읽는다 — 시기 목록·정렬이 그 값으로 선다', () => {
    expect(startKey({ startDate: '2026년 7월 1일 ~ 8월 31일', bizYear: 2026 })).toBe('2026-07-01');
  });
  it('연도가 빠진 표기는 못 읽는다 — 그래서 연도를 뺀 「7월 1일 ~ 8월 31일」로는 저장하지 않는다', () => {
    expect(startKey({ startDate: '7월 1일 ~ 8월 31일', bizYear: 2026 })).toBe('2026-00-00');
  });
  it('시기 목록은 이 키로 정렬된다 — 상반기가 위, 하반기가 아래', () => {
    const dates = ['2026년 7월 1일 ~ 8월 31일', '2026년 1월 20일'];
    const sorted = [...dates].sort((a, b) =>
      startKey({ startDate: a, bizYear: 0 }).localeCompare(startKey({ startDate: b, bizYear: 0 })));
    expect(sorted).toEqual(['2026년 1월 20일', '2026년 7월 1일 ~ 8월 31일']);
  });
  it('날짜·반기·ISO 표기가 같은 축에서 견줘진다', () => {
    expect(startKey({ startDate: '2026년 1월 20일', bizYear: 2026 })).toBe('2026-01-20');
    expect(startKey({ startDate: '2026년 하반기', bizYear: 2026 })).toBe('2026-07-00');
    expect(startKey({ startDate: '2026-08-22', bizYear: 2026 })).toBe('2026-08-22');
  });
});

/*
 * 사업구분의 화면 이름 — 저장값 「환경부」는 「기후부」로 보이고, 사람이 적은 글은 두 이름 다 받는다
 * (2026-11-17 한백 「둘다 해」 — 머리말의 「사업구분」 수정이 화면 이름을 보낸다 · store setProjectAxes)
 */
describe('bizLabel · bizTypeOf — 사업구분은 화면에만 「기후부」', () => {
  it('저장값 「환경부」는 「기후부」로 적고, 나머지는 그대로다', () => {
    expect(bizLabel('환경부')).toBe('기후부');
    expect(bizLabel('자체투자')).toBe('자체투자');
    expect(bizLabel('기설치 연동')).toBe('기설치 연동');
    expect(bizLabel(null)).toBeNull();
  });

  it('적은 글은 화면 이름 · 저장값을 둘 다 저장값으로 받는다 — 모르는 글은 null', () => {
    expect(bizTypeOf('기후부')).toBe('환경부');
    expect(bizTypeOf(' 환경부 ')).toBe('환경부');
    expect(bizTypeOf('자체투자')).toBe('자체투자');
    expect(bizTypeOf('기후부 신규')).toBeNull();
    expect(bizTypeOf('')).toBeNull();
  });
});

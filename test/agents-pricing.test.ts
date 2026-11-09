/**
 * 운영사 담당이 읽는 단가표(lib/agents/pricing-table)와 담당마다 쥐는 도구(lib/agents/brain toolsOf) — 한백 2026-11-04
 * 「영업정책 업데이트 되면 키단가표 업데이트 필요 (원자료는 내가 제공할 예정)」. 새 영업정책과 견주려면 지금 단가표를 알아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { caseLineOf, pricingTableText } from '@/lib/agents/pricing-table';
import { toolsOf } from '@/lib/agents/brain';
import type { PricingRule } from '@/types/project';
import type { Agent } from '@/types/agents';

/** 개발 DB 의 실제 나이스 케이스 하나를 본뜬 것 */
function rule(over: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'nice-jan-10', caseName: '나이스인프라 (2026년 1월 27일) | 공동주택 | 10년 환경부 신규 | 모자분리', cpo: '나이스인프라',
    bizType: '환경부', powerType: '모자분리', termYears: [10], bldgTypes: ['공동주택'], replType: '환경부 신규', channel: '턴키',
    bizYear: 2026, startDate: '2026년 1월 27일', salesUnit: 1_150_000, consUnit: 1_000_000, margin: 250_000,
    supplyItems: null, promo: null, promoExtend: null, chargeRate: null, installTerms: null, otherSupport: null,
    coexistTerms: null, miscTerms: null, defaultSettlementRuleId: 'rule', supervisionBearer: '운영사',
    safetyFeeBearer: '한백 대납(회수)', note: null, active: true,
    ...over,
  };
}

const AUG = rule({
  id: 'nice-aug-10', caseName: '나이스인프라 (2026년 8월 1일) | 공동주택 | 10년 자체투자 | 모자분리', startDate: '2026년 8월 1일',
  promo: [{ months: 6, rate: 149 }, { months: 6, rate: 220 }], chargeRate: 295,
  miscTerms: '· 열화상카메라 설치비 1대당 10만원 (시공사 지급)\n· 교체 전 입주민 의향조사',
});
const STOPPED = rule({ id: 'nice-old', caseName: '나이스인프라 (2025년 7월 1일) | 공동주택 | 7년', startDate: '2025년 7월 1일', active: false });
const SK = rule({ id: 'sk', cpo: 'SK일렉링크', caseName: 'SK일렉링크 (2026년 9월 1일) | 공동주택 | 10년' });

describe('운영사 담당이 읽는 단가표', () => {
  it('그 운영사의 쓰는 케이스만 — 적용 시작이 늦은 것부터, 중지한 것은 개수만', () => {
    const text = pricingTableText([rule(), SK, STOPPED, AUG], '나이스인프라');
    expect(text).toContain('케이스 2개 · 중지 1개는 뺐다');
    expect(text).not.toContain('SK일렉링크');
    expect(text).not.toContain('2025년 7월 1일');
    expect(text.indexOf('2026년 8월 1일')).toBeLessThan(text.indexOf('2026년 1월 27일'));
  });

  it('머리에 한백 안의 값이라고 적는다 — 운영사에 보내는 메일에 영업비 · 시공비 · 마진이 새지 않게', () => {
    expect(pricingTableText([rule()], '나이스인프라')).toContain('운영사에 보내는 메일에 쓰지 않는다');
  });

  it('턴키 = 영업 + 시공 + 마진 — 원 단위 그대로', () => {
    expect(caseLineOf(rule())).toContain('턴키 2,400,000원 = 영업 1,150,000 + 시공 1,000,000 + 마진 250,000');
  });

  it('프로모션은 미지정 · 없음 · 구간을 가른다(화면 규칙 10)', () => {
    expect(caseLineOf(rule())).toContain('프로모션 미지정');
    expect(caseLineOf(rule({ promo: [] }))).toContain('프로모션 없음');
    expect(caseLineOf(AUG)).toContain('프로모션 6개월 149원 → 6개월 220원');
    expect(caseLineOf(AUG)).toContain('충전요금 295원');
  });

  it('여러 줄 조건은 한 줄로 — 화면에 없는 부담 주체는 싣지 않는다', () => {
    const line = caseLineOf(AUG);
    expect(line).toContain('기타 · 열화상카메라 설치비 1대당 10만원 (시공사 지급) / · 교체 전 입주민 의향조사');
    expect(line).not.toContain('\n');
    expect(line).not.toContain('대납');
  });

  it('쓰는 케이스가 없으면 없다고 한다', () => {
    expect(pricingTableText([], '에버온')).toBe('[에버온 단가표] 쓰는 케이스가 없다.');
    expect(pricingTableText([STOPPED], '나이스인프라')).toBe('[나이스인프라 단가표] 쓰는 케이스가 없다 · 중지 1개는 뺐다.');
  });
});

describe('담당마다 쥐는 도구', () => {
  const NICE: Agent = { id: 'op-nice', kind: 'operator', biz: 'ev', company: null, cpo: '나이스인프라', name: '나이스인프라 담당' };
  const SETTLE: Agent = { id: 'settlement', kind: 'settlement', biz: 'ev', company: null, cpo: null, name: '정산 담당' };
  const PLAN: Agent = { id: 'strategy', kind: 'strategy', biz: 'ev', company: null, cpo: null, name: '전략·기획 담당' };
  const names = (tools: unknown[]) => tools.map((t) => (t as { name: string }).name);
  const read = async () => '';
  const mail = async () => ({ id: 'm', subject: 's', plan: 'create', to: [], checks: [] });

  it('운영사 담당은 단가표를 읽는다 — 라우트가 손을 이어 줄 때만', () => {
    expect(names(toolsOf(NICE, { pricingTable: read, siteMail: mail }))).toEqual(
      ['add_task', 'complete_task', 'draft_mail', 'site_mail', 'pricing_table'],
    );
    expect(names(toolsOf(NICE, {}))).not.toContain('pricing_table');
  });

  it('정산 · 전략·기획은 단가표 도구가 없다', () => {
    expect(names(toolsOf(SETTLE, { pricingTable: read }))).not.toContain('pricing_table');
    expect(names(toolsOf(PLAN, { pricingTable: read }))).toEqual(['add_task', 'complete_task', 'draft_mail', 'web_search']);
  });

  it('아지트 글 초안(agit_post)은 정산 담당만 — 라우트가 손을 이어 줄 때만 (한백 2026-11-08)', () => {
    const agit = async () => ({ id: 'a', plan: 'create' as const, name: '11월 10일 정기결제', batches: 1, total: 1, urgent: null });
    expect(names(toolsOf(SETTLE, { agitDraft: agit }))).toEqual(['add_task', 'complete_task', 'draft_mail', 'agit_post']);
    expect(names(toolsOf(SETTLE, {}))).not.toContain('agit_post');
    expect(names(toolsOf(NICE, { agitDraft: agit }))).not.toContain('agit_post');
    expect(names(toolsOf(PLAN, { agitDraft: agit }))).not.toContain('agit_post');
  });
});

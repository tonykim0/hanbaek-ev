/**
 * 태양광 AI에이전트 — lib/agents/solar-brief · 도구 (한백 지시 2026-11-04 「태양광도 AI 에이전트 붙여줘. 운영사 담당자가 아니라
 * 사업자 담당자 — 타이런트아이, 에이치에너지, 루모라 이렇게 3개. 나머지는 동일하게」 · migrations/0118).
 *
 * 태양광 콘솔에는 상담 접수한 현장뿐이다. 보는 것: 전략·기획은 흐름을 세고, 사업자 담당은 전체 현장을 받되 「현장에 사업자가
 * 안 적힌다」를 같이 듣고, 정산은 「기록이 없다」를 듣는다. 카드는 사업자마다 전체 수를 적지 않는다(그 사업자의 현장으로 읽힌다).
 * 도구는 전기차와 같되 할 일에 전기차 현장(관리번호)을 붙이는 칸이 없다.
 */
import { describe, expect, it } from 'vitest';
import { solarBriefOf, solarHeadlineOf, SOLAR_SITE_LIMIT, type SolarScopeData } from '@/lib/agents/solar-brief';
import { toolsOf } from '@/lib/agents/brain';
import { roleLineOf } from '@/components/agents/status';
import type { SolarSite } from '@/lib/solar/sites';
import type { Agent } from '@/types/agents';
import { AGENT_KIND_LABEL, agentAuditKey, isCounterpart } from '@/types/agents';

const TODAY = '2026-11-04';

function site(n: number, over: Partial<SolarSite> = {}): SolarSite {
  return {
    id: `SL-2026-${String(n).padStart(3, '0')}`,
    name: `현장 ${n}`,
    address: `경기 화성시 ${n}`,
    kind: 'roof',
    customer: '김고객',
    phone: '010-0000-0000',
    memo: null,
    org: '에코일렉',
    createdBy: 'u1',
    createdAt: '2026-11-03T01:00:00.000Z',
    updatedAt: null,
    files: [],
    ...over,
  };
}

const HENERGY: Agent = { id: 'solar-henergy', kind: 'owner', biz: 'solar', cpo: null, company: '에이치에너지', name: '에이치에너지 담당' };
const PLAN: Agent = { id: 'solar-strategy', kind: 'strategy', biz: 'solar', cpo: null, company: null, name: '전략·기획 담당' };
const SETTLE: Agent = { id: 'solar-settlement', kind: 'settlement', biz: 'solar', cpo: null, company: null, name: '정산 담당' };

describe('태양광 담당이 읽는 자료', () => {
  const data: SolarScopeData = {
    today: TODAY,
    sites: [
      site(3, { kind: 'ground', org: '보승이앤씨', memo: '지상형 부지 — 진입로 확인 필요' }),
      site(2, { createdAt: '2026-10-20T03:00:00.000Z' }),
      site(1, { org: null, createdAt: '2026-09-30T16:00:00.000Z' }), // 한국 시각 10-01 01:00 — 10월로 센다
    ],
  };

  it('사업자 담당은 전체 현장을 받되, 현장에 사업자가 안 적힌다고 듣는다', () => {
    const text = solarBriefOf(HENERGY, data);
    expect(text).toContain('[태양광 현장 — 2026-11-04 콘솔 기준 · 상담 접수한 현장 전체 3곳]');
    expect(text).toContain('현장에는 아직 사업자가 적히지 않는다');
    expect(text).toContain('그중 에이치에너지의 현장은');
    expect(text).toContain('- SL-2026-003 현장 3 | 경기 화성시 3 | 지상형 | 담당 협력사 보승이앤씨 | 접수 2026-11-03 | 파일 0 | 메모 지상형 부지 — 진입로 확인 필요');
    expect(text).toContain('담당 협력사 미지정');
    /* 연락처는 싣지 않는다 — 에이전트가 쓸 일이 없다 */
    expect(text).not.toContain('010-0000-0000');
  });

  it('현장이 많으면 최근 것부터 자르고 남은 수를 적는다', () => {
    const many = Array.from({ length: SOLAR_SITE_LIMIT + 5 }, (_, i) => site(i + 1));
    const text = solarBriefOf(HENERGY, { today: TODAY, sites: many });
    expect(text).toContain(`상담 접수한 현장 전체 ${SOLAR_SITE_LIMIT + 5}곳`);
    expect(text).toContain('… 그 밖에 5곳(오래된 접수)');
  });

  it('전략·기획은 상담 접수 흐름을 센다 — 달은 한국 달력', () => {
    const text = solarBriefOf(PLAN, data);
    expect(text).toContain('월별 상담 접수 (최근 12개월): 2026-10 2곳 · 2026-11 1곳');
    expect(text).toContain('누적 3곳 — 형태: 지붕형 2곳 · 지상형 1곳 · 담당 협력사: 미지정 1곳 · 보승이앤씨 1곳 · 에코일렉 1곳');
  });

  it('정산은 태양광 정산 기록이 콘솔에 없다고 듣는다', () => {
    expect(solarBriefOf(SETTLE, data)).toContain('콘솔에는 아직 태양광의 기성 · 지급 기록이 없다');
  });

  it('카드 — 전략·기획만 센다. 사업자 담당 · 정산은 비운다', () => {
    expect(solarHeadlineOf(PLAN, data).counts).toEqual([
      { label: '이번 달 상담', value: '1곳' },
      { label: '누적', value: '3곳' },
    ]);
    expect(solarHeadlineOf(HENERGY, data).counts).toEqual([]);
    expect(solarHeadlineOf(SETTLE, data).counts).toEqual([]);
  });

  it('현장이 없으면 없다고 한다', () => {
    expect(solarBriefOf(HENERGY, { today: TODAY, sites: [] })).toContain('- 없음');
    expect(solarBriefOf(PLAN, { today: TODAY, sites: [] })).toContain('월별 상담 접수 (최근 12개월): 없음');
  });
});

describe('태양광 담당이 쥐는 도구', () => {
  const names = (tools: unknown[]) => tools.map((t) => (t as { name: string }).name);
  const siteParam = (tools: unknown[]) => {
    const add = tools.find((t) => (t as { name: string }).name === 'add_task') as { input_schema: { properties: Record<string, unknown> } };
    return 'site' in add.input_schema.properties;
  };
  const read = async () => '';
  const mail = async () => ({ id: 'm', subject: 's', plan: 'create', to: [] });

  it('사업자 담당 — 할 일 · 메일 초안. 양식 메일 · 단가표는 없다(손을 이어 줘도)', () => {
    const tools = toolsOf(HENERGY, { pricingTable: read, siteMail: mail });
    expect(names(tools)).toEqual(['add_task', 'complete_task', 'draft_mail', 'search_history', 'read_file']);
    expect(siteParam(tools)).toBe(false);
  });

  it('전략·기획은 웹 검색을 쥔다 — 전기차와 같다', () => {
    expect(names(toolsOf(PLAN, {}))).toEqual(['add_task', 'complete_task', 'draft_mail', 'search_history', 'read_file', 'web_search']);
  });

  it('전기차 담당의 할 일에는 현장(관리번호) 칸이 그대로 있다', () => {
    const NICE: Agent = { id: 'op-nice', kind: 'operator', biz: 'ev', cpo: '나이스인프라', company: null, name: '나이스인프라 담당' };
    expect(siteParam(toolsOf(NICE, {}))).toBe(true);
  });
});

describe('사업자 담당의 이름', () => {
  it('부서 · 직함 줄', () => {
    expect(AGENT_KIND_LABEL.owner).toBe('사업자 담당');
    expect(isCounterpart('owner')).toBe(true);
    expect(isCounterpart('operator')).toBe(true);
    expect(isCounterpart('settlement')).toBe(false);
    expect(roleLineOf(HENERGY)).toBe('현장 진행 · 사업자 소통');
  });

  it('감사기록의 열쇠는 사업마다 — 같은 이름(정산 담당)이어도 주간 기록이 섞이지 않는다', () => {
    expect(agentAuditKey(SETTLE)).toBe('태양광 · 정산 담당');
    expect(agentAuditKey({ biz: 'ev', name: '정산 담당' })).toBe('정산 담당'); // 전기차는 그전 기록 그대로 이름
  });
});

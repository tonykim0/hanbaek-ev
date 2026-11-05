/**
 * AI에이전트의 팀 — lib/agents/team · 팀장의 도구 (한백 2026-11-04 「결국엔 전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는
 * 실무자들이야. 각 실무자들이 알고 있는 히스토리에 대해서 전략 및 기획이 알고있어야하고, 전략및기획에서 세우는 목표나 OKR
 * 방향성 또는 다른 사업구조에 대해서도 밑에 실무자들이 알아야하는 상호보완구조여야해. 이건 전기차, 태양광 둘 다 같아」).
 *
 * 서로 채우는 갈래를 본다: 실무자의 시스템에는 팀장이 세운 목표 · 방향이 서고(아래로), 마지막 지시 곁에는 다른 팀원들의 기록이
 * 붙는다 — 2026-11-05 부터 팀장만이 아니라 모두에게(한백 「각 담당자들끼리 서로 정보 공유 필요해. 즉 모든 에이전트들간 대화필요」).
 * 고칠 줄의 id 와 목표 · 방향을 바꾸는 도구는 팀장만 쥐고, 팀원을 깊이 읽고 말을 남기는 도구는 모두가 쥔다.
 */
import { describe, expect, it } from 'vitest';
import {
  directionsBlock, memberOf, TEAM_DAYS, teamDigestOf, teamHistoryOf, teamLineOf, teammatesOf,
} from '@/lib/agents/team';
import { toolsOf } from '@/lib/agents/brain';
import type { Agent, AgentDirection, AgentMessage, AgentTask, TeamMemberLog } from '@/types/agents';
import { isLead } from '@/types/agents';

const LEAD: Agent = { id: 'strategy', kind: 'strategy', biz: 'ev', cpo: null, company: null, name: '전략·기획 담당' };
const NICE: Agent = { id: 'op-nice', kind: 'operator', biz: 'ev', cpo: '나이스인프라', company: null, name: '나이스인프라 담당' };
const HEC: Agent = { id: 'op-hec', kind: 'operator', biz: 'ev', cpo: '현대엔지니어링', company: null, name: '현대엔지니어링 담당' };
const SETTLE: Agent = { id: 'settlement', kind: 'settlement', biz: 'ev', cpo: null, company: null, name: '정산 담당' };
const LUMORA: Agent = { id: 'solar-lumora', kind: 'owner', biz: 'solar', cpo: null, company: '루모라', name: '루모라 담당' };
const TEAM = { lead: LEAD, members: [HEC, NICE, SETTLE] };

const GOAL: AgentDirection = {
  id: 'd1', title: '4분기 목표', body: '계약 300기 · 나이스 비중 40%', author: '김정우', byAgent: false, updatedAt: null, createdAt: '2026-11-04 10:00',
};

function said(over: Partial<AgentMessage> & Pick<AgentMessage, 'role' | 'body'>): AgentMessage {
  return { id: `m-${Math.random()}`, author: '김정우', at: '2026-11-04 09:30', meta: null, files: [], ...over };
}

function task(over: Partial<AgentTask> & Pick<AgentTask, 'title'>): AgentTask {
  return {
    id: `t-${Math.random()}`, note: null, projectId: null, projectName: null, due: null, doneAt: null, author: '김정우', byAgent: false,
    createdAt: '2026-11-04 09:00', ...over,
  };
}

function log(agent: Agent, over: Partial<TeamMemberLog> = {}): TeamMemberLog {
  return { agent, duties: [], tasks: [], messages: [], total: 0, ...over };
}

describe('팀장 · 실무자 — 누가 팀장인가', () => {
  it('전략·기획이 팀장이다 — 전기차 · 태양광 둘 다', () => {
    expect(isLead('strategy')).toBe(true);
    for (const k of ['operator', 'owner', 'settlement'] as const) expect(isLead(k)).toBe(false);
  });
});

describe('시스템 — 팀에서의 자리 (teamLineOf)', () => {
  it('팀장은 실무자 모두를 알고, 실무자의 기록을 읽고 목표 · 방향을 올린다', () => {
    const line = teamLineOf(LEAD, TEAM);
    expect(line).toContain('너는 이 팀의 팀장이다');
    expect(line).toContain('현대엔지니어링 담당 · 나이스인프라 담당 · 정산 담당');
    expect(line).toContain('[팀 소식]');
    expect(line).toContain('save_direction');
    expect(line).toContain('한백과 합의한 것만');
  });

  it('실무자는 팀장의 목표 · 방향에 맞추고, 팀원 모두와 서로 읽고 남긴다 — 같은 팀 실무자에 자신은 빠진다', () => {
    const line = teamLineOf(NICE, TEAM);
    expect(line).toContain('너는 이 팀의 실무자다');
    expect(line).toContain('팀장은 전략·기획 담당이다');
    expect(line).toContain('네 것도 팀원 모두가 읽는다');
    expect(line).toContain('[팀 소식]');
    expect(line).toContain('team_history');
    expect(line).toContain('tell_teammate');
    expect(line).toContain('같은 팀의 실무자: 현대엔지니어링 담당 · 정산 담당.');
    expect(line).not.toContain('save_direction');
  });

  it('팀원 — 팀장 먼저, 자기 자신은 빠진다', () => {
    expect(teammatesOf(NICE, TEAM)).toEqual([LEAD, HEC, SETTLE]);
    expect(teammatesOf(LEAD, TEAM)).toEqual([HEC, NICE, SETTLE]);
    expect(teammatesOf(NICE, { lead: null, members: [NICE] })).toEqual([]);
  });
});

describe('시스템 — 팀 목표 · 방향 (directionsBlock)', () => {
  it('실무자는 내용만, 팀장은 고칠 줄의 id 까지', () => {
    const member = directionsBlock([GOAL], false);
    const lead = directionsBlock([GOAL], true);
    expect(member).toContain('[팀 목표 · 방향');
    expect(member).toContain('1. 4분기 목표\n계약 300기 · 나이스 비중 40%');
    expect(member).not.toContain('id=d1');
    expect(lead).toContain('1. 4분기 목표 (id=d1)');
  });

  it('없으면 없다고 — 팀장에게는 올리는 길을 같이', () => {
    expect(directionsBlock([], false)).toMatch(/아직 없다\.$/);
    expect(directionsBlock([], true)).toContain('save_direction');
  });
});

describe('마지막 지시 곁 — 다른 팀원들의 기록 (teamDigestOf)', () => {
  it('팀원마다 업무 정의 · 할 일 · 최근 말 — 누가 한 말인지 · 넘긴 파일 · 답이 한 일 · 팀원의 말까지', () => {
    const text = teamDigestOf([
      log(LEAD, {
        messages: [said({ role: 'agent', author: '전략·기획 담당', body: '나이스 쪽에 알렸습니다.', meta: { told: ['나이스인프라 담당'] } })],
        total: 1,
      }),
      log(NICE, {
        duties: [{ id: 'u1', title: '영업정책이 바뀌면 단가표 업데이트', body: '', updatedAt: null }],
        tasks: [task({ title: '계약서 초안 메일 보내기', due: '2026-11-07' }), task({ title: '단가 회신 확인', doneAt: '2026-11-03 12:00' })],
        messages: [
          said({ role: 'note', body: '나이스 김대리와 통화 — 11월부터 공동주택 단가 인하', files: [{ id: 'f', name: '정책.pdf', url: 'u', size: 1, contentType: null }] }),
          said({ role: 'agent', author: '나이스인프라 담당', body: '정리했습니다.', meta: { added: ['단가 회신 확인'] } }),
          said({ role: 'peer', author: '전략·기획 담당', body: '4분기 나이스 비중 40% 목표', meta: { from: { id: 'strategy', name: '전략·기획 담당' } } }),
        ],
        total: 3,
      }),
      log(SETTLE),
    ]);
    expect(text).toContain(`[팀 소식 — 다른 팀원 3명이 최근 ${TEAM_DAYS}일 동안 한백 · 팀원과 나눈 것`);
    expect(text).toContain('[팀장 · 전략·기획 담당 · id=strategy]');
    expect(text).toContain('답: 나이스 쪽에 알렸습니다. [팀원에게 남김: 나이스인프라 담당]');
    expect(text).toContain('팀원 전략·기획 담당의 말: 4분기 나이스 비중 40% 목표');
    expect(text).toContain('[실무자 · 나이스인프라 담당 · id=op-nice]');
    expect(text).toContain('업무 정의 1: 영업정책이 바뀌면 단가표 업데이트');
    expect(text).toContain('열린 할 일 1: 계약서 초안 메일 보내기(기한 11-07)');
    expect(text).toContain('끝낸 할 일 1: 단가 회신 확인');
    expect(text).toContain('- 11-04 09:30 기록(김정우): 나이스 김대리와 통화 — 11월부터 공동주택 단가 인하 [넘긴 파일: 정책.pdf]');
    expect(text).toContain('답: 정리했습니다. [할 일 적음: 단가 회신 확인]');
    /* 말이 없는 실무자도 자리를 지킨다 — 0건 */
    expect(text).toContain('[실무자 · 정산 담당 · id=settlement]\n업무 정의 0\n열린 할 일 0\n대화 0건');
  });

  it('한 말은 한 줄로 자른다 — 답은 더 짧게, 실린 것보다 많으면 「최근 n건」', () => {
    const long = '가'.repeat(500);
    const text = teamDigestOf([log(HEC, {
      messages: [said({ role: 'user', body: `${long}\n둘째 줄` }), said({ role: 'agent', author: 'x', body: long })],
      total: 9,
    })]);
    expect(text).toContain('대화 9건 — 최근 2건');
    expect(text).toContain(`한백 지시(김정우): ${'가'.repeat(200)}…`);
    expect(text).toContain(`답: ${'가'.repeat(160)}…`);
    expect(text).not.toContain('둘째 줄');
  });
});

describe('team_history — 팀원 하나를 깊이 (teamHistoryOf · memberOf)', () => {
  it('업무 정의 전문 · 할 일(열린 것 · 끝낸 것) · 대화 전문(오래된 것부터)', () => {
    const text = teamHistoryOf(log(NICE, {
      duties: [{ id: 'u1', title: '계약서 접수되면 계약서 초안 메일 보내기', body: '정해진 양식 · 승인 뒤 나간다', updatedAt: null }],
      tasks: [
        task({ title: '계약서 초안 메일 보내기', due: '2026-11-07', projectName: '세아청솔' }),
        task({ title: '지난주 회신', doneAt: '2026-11-02 18:00' }),
      ],
      messages: [said({ role: 'auto', author: '나이스인프라 담당', body: '계약서 초안 메일 초안을 올렸습니다.\n받는 사람 미지정' })],
      total: 1,
    }), 30);
    expect(text).toContain('[나이스인프라 담당 · id=op-nice — 최근 30일]');
    expect(text).toContain('1. 계약서 접수되면 계약서 초안 메일 보내기\n정해진 양식 · 승인 뒤 나간다');
    expect(text).toContain('- 계약서 초안 메일 보내기 | 기한 2026-11-07 | 현장 세아청솔 | 적은 쪽 김정우');
    expect(text).toContain('- 11-02 18:00 끝냄 · 지난주 회신');
    expect(text).toContain('자동: 계약서 초안 메일 초안을 올렸습니다.\n받는 사람 미지정');
  });

  it('팀원은 id 로 찾고, 이름 · 운영사 · 사업자로도 찾는다 — 목록에 없는 담당은 못 찾는다', () => {
    const members = [HEC, NICE, SETTLE, LUMORA];
    expect(memberOf(members, 'op-nice')).toBe(NICE);
    expect(memberOf(members, '현대엔지니어링 담당')).toBe(HEC);
    expect(memberOf(members, '나이스인프라')).toBe(NICE);
    expect(memberOf(members, '루모라')).toBe(LUMORA);
    expect(memberOf(members, 'strategy')).toBeNull();
    expect(memberOf(members, '  ')).toBeNull();
  });
});

describe('도구 — 목표 · 방향은 팀장만, 팀원 읽기 · 남기기와 기억은 모두', () => {
  const names = (tools: unknown[]) => tools.map((t) => (t as { name: string }).name);
  const hands = { saveDirection: async () => ({ id: 'x', title: 'x' }), tellTeammate: async () => '정산 담당' };

  it('팀장은 라우트가 손을 이어 줄 때 팀의 도구 · save_direction · delete_direction 을 쥔다(웹 검색은 그대로)', () => {
    expect(names(toolsOf(LEAD, hands))).toEqual([
      'add_task', 'complete_task', 'draft_mail', 'search_history', 'read_file', 'team_history', 'tell_teammate',
      'save_direction', 'delete_direction', 'web_search',
    ]);
    expect(names(toolsOf({ ...LEAD, id: 'solar-strategy', biz: 'solar' }, hands))).toContain('tell_teammate');
    expect(names(toolsOf(LEAD, {}))).not.toContain('save_direction');
    expect(names(toolsOf(LEAD, {}))).not.toContain('tell_teammate');
  });

  it('실무자도 팀원을 읽고 남긴다 — 목표 · 방향은 손이 이어져도 쥐지 않는다', () => {
    for (const a of [NICE, SETTLE, LUMORA]) {
      const got = names(toolsOf(a, hands));
      expect(got, a.id).not.toContain('save_direction');
      expect(got, a.id).toContain('team_history');
      expect(got, a.id).toContain('tell_teammate');
      expect(got, a.id).toContain('search_history');
      expect(got, a.id).toContain('read_file');
    }
  });
});

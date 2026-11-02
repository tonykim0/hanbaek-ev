/**
 * 에이전트의 모양 — 서버·화면이 같이 본다. 아무것도 끌어오지 않는다(화면 번들에 저장소가 딸려 오지 않게).
 *
 * 에이전트 = 한백의 일을 나눠 맡는 AI 담당 (한백 지시 2026-11-01·02, migrations/0103). 담당마다 셋이 남는다:
 *   업무 정의  한백이 적는다 — 에이전트는 이것을 지시로 읽는다
 *   할 일      한백이 적거나, 대화 중에 에이전트가 적는다
 *   대화       지시와 보고가 그대로 남는다 — 커뮤니케이션 기록이다
 * 에이전트가 보는 현장·지급·기성은 저장하지 않는다 — 부를 때마다 콘솔이 셈한 것을 읽는다(lib/agents/scope).
 */
import type { CpoName } from './project';

/**
 * 담당의 갈래 — 갈래마다 보는 자료와 손에 쥔 도구가 다르다(lib/agents/scope · lib/agents/brain).
 *   operator    운영사 하나의 현장 — 칸 · 차례 · 정체 · 반려
 *   settlement  지급(배치)과 받을 기성
 *   purchase    열린구매 — 나갈 지급을 아지트에 올릴 지출 글로 쓴다
 *   strategy    전략·기획 — 시장 정보(웹 검색)와 수주 흐름
 */
export type AgentKind = 'operator' | 'settlement' | 'purchase' | 'strategy';
export const AGENT_KINDS = ['operator', 'settlement', 'purchase', 'strategy'] as const satisfies readonly AgentKind[];

/** 화면의 묶음 이름 — 현황 화면이 이 순서로 줄을 세운다 */
export const AGENT_KIND_LABEL: Record<AgentKind, string> = {
  operator: '운영사 담당',
  settlement: '정산',
  purchase: '열린구매',
  strategy: '전략·기획',
};

export interface Agent {
  id: string;
  kind: AgentKind;
  /** 운영사 담당만 — 나머지는 null */
  cpo: CpoName | null;
  name: string;
}

export interface AgentDuty {
  id: string;
  title: string;
  body: string;
  /** 마지막으로 고친 때(YYYY-MM-DD HH:mm) — 처음 적은 그대로면 null */
  updatedAt: string | null;
}

export interface AgentTask {
  id: string;
  title: string;
  note: string | null;
  /** 관련 현장 — 현장 상세로 가는 고리. 현장이 지워졌으면 null */
  projectId: string | null;
  projectName: string | null;
  /** 기한 YYYY-MM-DD */
  due: string | null;
  /** 끝낸 때(YYYY-MM-DD HH:mm) — 열려 있으면 null */
  doneAt: string | null;
  /** 적은 쪽 — 사람 이름 또는 에이전트 이름 */
  author: string;
  byAgent: boolean;
  createdAt: string;
}

/**
 * 말의 종류 —
 *   user   한백의 지시. 에이전트가 답한다
 *   note   기록만. 에이전트를 부르지 않는다(운영사 담당자와 통화한 내용 같은 것)
 *   agent  에이전트의 말
 */
export type AgentMessageRole = 'user' | 'note' | 'agent';

export interface AgentSource {
  url: string;
  title: string | null;
}

/** 에이전트의 말에 붙는 것 — 무엇으로 얼마 들여 답했나 · 무엇을 찾아봤나 · 할 일을 무엇을 바꿨나 */
export interface AgentMessageMeta {
  model?: string;
  /** 걸린 시간(ms) */
  ms?: number;
  /** 비용 어림(달러) — 청구서가 아니다(lib/llm-usage 와 같은 단가표) */
  usd?: number;
  /** 웹 검색으로 찾아본 출처 */
  sources?: AgentSource[];
  /** 이 답에서 적은 할 일·끝낸 할 일의 제목 */
  added?: string[];
  done?: string[];
}

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  author: string;
  body: string;
  /** YYYY-MM-DD HH:mm (한국 시각) */
  at: string;
  meta: AgentMessageMeta | null;
}

/** 현황 화면의 카드 한 장 */
export interface AgentSummary extends Agent {
  duties: number;
  openTasks: number;
  /** 기한이 지난 열린 할 일 */
  lateTasks: number;
  /** 마지막 말 — 없으면 null */
  last: { role: AgentMessageRole; at: string; line: string } | null;
  /** 최근 7일(한국 달력, 오래된 날부터 오늘까지)의 말 수 — 가지 줄의 활동 칸 */
  activity: Array<{ day: string; n: number }>;
  /** 오늘 에이전트의 답에 든 비용 어림(달러) */
  usdToday: number;
}

export interface AgentDetail {
  agent: Agent;
  duties: AgentDuty[];
  /** 열린 것이 위(기한 이른 순), 끝낸 것은 아래(최근 끝낸 순) */
  tasks: AgentTask[];
  /** 오래된 것이 앞 — 대화처럼 읽힌다 */
  messages: AgentMessage[];
}

/** 에이전트가 지금 맡은 범위의 한 줄 — 카드와 머리말에 선다(lib/agents/brief headlineOf) */
export interface AgentHeadline {
  /** 「현장 42」처럼 짧은 셈 여럿 — tone 이 warn 이면 노랑 꼬리표 */
  counts: Array<{ label: string; value: string; tone?: 'warn' | 'stop' }>;
}

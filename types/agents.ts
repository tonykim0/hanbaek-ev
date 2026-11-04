/**
 * 에이전트의 모양 — 서버·화면이 같이 본다. 아무것도 끌어오지 않는다(화면 번들에 저장소가 딸려 오지 않게).
 *
 * 에이전트 = 한백의 일을 나눠 맡는 AI 담당 (한백 지시 2026-11-01·02, migrations/0109). 담당마다 셋이 남는다:
 *   업무 정의  한백이 적는다 — 에이전트는 이것을 지시로 읽는다
 *   할 일      한백이 적거나, 대화 중에 에이전트가 적는다
 *   대화       지시와 보고가 그대로 남는다 — 커뮤니케이션 기록이다
 * 에이전트가 보는 현장·지급·기성은 저장하지 않는다 — 부를 때마다 콘솔이 셈한 것을 읽는다(lib/agents/scope).
 */
import type { CpoName } from './project';
import type { Biz } from '@/lib/biz';

/**
 * 담당의 갈래 — 갈래마다 보는 자료와 손에 쥔 도구가 다르다(lib/agents/scope · lib/agents/brain).
 *   strategy    전략·기획 — 시장 정보(웹 검색)와 수주 흐름. ★팀장이다★ — 실무자의 기록을 읽고 팀의 목표 · 방향을 세운다(isLead)
 *   operator    운영사 하나의 현장 — 칸 · 차례 · 정체 · 반려
 *   settlement  정산 — 기성관리(운영사에게서 수금) · 지급관리(협력사에게 영업비·시공비) · 열린구매(지급을 위한 아지트 지출
 *               글과 자료). 열린구매는 따로 있던 담당을 2026-11-02 여기 합쳤다(한백 「정산담당이 열린구매까지 같이하는거야」)
 *   owner       태양광 사업자 하나 — 전기차 운영사 담당의 자리(한백 지시 2026-11-04 「운영사 담당자가 아니라 사업자 담당자」)
 *
 * 담당은 사업마다 따로다(biz — migrations/0118): 전기차는 전략·기획 · 운영사 담당 다섯 · 정산, 태양광은 전략·기획 · 사업자
 * 담당 셋(타이런트아이 · 에이치에너지 · 루모라) · 정산. 전략·기획과 정산은 갈래가 같고 읽는 자료가 사업마다 다르다.
 */
export type AgentKind = 'strategy' | 'operator' | 'owner' | 'settlement';
export const AGENT_KINDS = ['strategy', 'operator', 'owner', 'settlement'] as const satisfies readonly AgentKind[];

/** 화면의 묶음 이름 */
export const AGENT_KIND_LABEL: Record<AgentKind, string> = {
  strategy: '전략·기획',
  operator: '운영사 담당',
  owner: '사업자 담당',
  settlement: '정산',
};

/** 상대 회사를 하나씩 맡는 갈래 — 팀 화면에서 한 줄로 서는 실무자들(전기차 운영사 · 태양광 사업자) */
export const isCounterpart = (kind: AgentKind): boolean => kind === 'operator' || kind === 'owner';

/**
 * ★AI에이전트는 팀이다★ (한백 2026-11-04 「결국엔 전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는 실무자들이야」).
 * 팀장 = 전략·기획, 실무자 = 나머지(운영사 · 사업자 담당과 정산 — 팀장 밑의 모두). 사업마다 한 팀이다(전기차 · 태양광 둘 다 같다).
 * 서로 채운다: 팀장은 실무자가 한백과 나눈 것을 읽고(store/agent-team agentTeamLog), 실무자는 팀장이 세운 목표 · 방향을 읽는다
 * (agent_directions · lib/agents/team).
 */
export const isLead = (kind: AgentKind): boolean => kind === 'strategy';

/**
 * 감사기록에서 담당을 가리키는 열쇠(audit_log.field) — 주간 기록이 이것으로 그 담당의 일(업무 정의 · 할 일 · 메일)을 찾는다.
 * 전기차는 이름 그대로다(그전 기록이 이름으로 남아 있다). 태양광은 「태양광 · 이름」 — 태양광 AI에이전트는 전기차와 따로인 조직이라
 * 담당 이름이 같다(전략·기획 담당 · 정산 담당, 한백 2026-11-04 「태양광전용으로 하나 · 기존 전기차 AI에이전트에 붙이지 말고」).
 */
export const agentAuditKey = (a: { biz: string; name: string }): string => (a.biz === 'solar' ? `태양광 · ${a.name}` : a.name);

export interface Agent {
  id: string;
  kind: AgentKind;
  /** 사업 — 전기차 · 태양광. 조직도 · 읽는 자료 · 도구가 사업마다다 */
  biz: Biz;
  /** 운영사 담당만 — 나머지는 null */
  cpo: CpoName | null;
  /** 사업자 담당만 — 맡은 태양광 사업자 이름. 나머지는 null */
  company: string | null;
  name: string;
}

export interface AgentDuty {
  id: string;
  title: string;
  body: string;
  /** 마지막으로 고친 때(YYYY-MM-DD HH:mm) — 처음 적은 그대로면 null */
  updatedAt: string | null;
}

/**
 * 팀 목표 · 방향 한 줄 — 팀장(전략·기획 담당)이 세운 목표 · OKR · 방향 · 사업 구조(migrations/0120). 그 사업의 실무자 모두가
 * 부를 때마다 읽는다. 한백이 화면에서 적거나 팀장이 대화 중에 올린다.
 */
export interface AgentDirection {
  id: string;
  title: string;
  body: string;
  /** 적은 쪽 — 사람 이름 또는 팀장의 이름 */
  author: string;
  byAgent: boolean;
  /** 마지막으로 고친 때(YYYY-MM-DD HH:mm) — 처음 적은 그대로면 null */
  updatedAt: string | null;
  createdAt: string;
}

/** 사업 하나의 팀 — 팀장 · 실무자(조직 순서) · 팀장이 세운 목표 · 방향 */
export interface AgentTeam {
  lead: Agent | null;
  members: Agent[];
  directions: AgentDirection[];
}

/**
 * 실무자 한 사람이 한백과 나눈 것 — 팀장이 읽는다(store/agent-team agentTeamLog · lib/agents/team). 날수 안의 것만이다.
 */
export interface TeamMemberLog {
  agent: Agent;
  duties: AgentDuty[];
  /** 열린 것 전부와, 날수 안에 끝낸 것 */
  tasks: AgentTask[];
  /** 날수 안의 말 — 오래된 것이 앞, 최근 것부터 상한만큼 */
  messages: AgentMessage[];
  /** 날수 안의 말 전체 수(실린 것보다 많을 수 있다) */
  total: number;
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
 *   auto   자동 — 콘솔이 규칙대로 그 담당의 이름으로 한 일(계약서가 접수되면 할 일 · 양식 메일 초안, lib/site-mail).
 *          모델을 부르지 않는다 — 답 수 · 비용(사용량 표)에 세지 않는다
 */
export type AgentMessageRole = 'user' | 'note' | 'agent' | 'auto';
export const AGENT_MESSAGE_ROLES = ['user', 'note', 'agent', 'auto'] as const satisfies readonly AgentMessageRole[];

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
  /** 이 답에서 올린 메일 초안의 제목 */
  mails?: string[];
  /** 이 답에서 팀장이 올리거나 고치거나 지운 목표 · 방향의 이름 */
  directions?: string[];
  /**
   * 이 답에 든 토큰 — 도구를 쓰고 다시 부른 바퀴까지 합친 것(2026-11-03 부터 적는다 · 그 전 답에는 없다).
   * 캐시 읽기가 많을수록 싸다(입력 값의 5%) — 사용량 표가 그 몫을 보여 준다.
   */
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** 웹 검색 횟수 — 한 번에 1센트(전략·기획만) */
  searches?: number;
  /** 자동의 말이 짚는 현장 — 대화에서 현장 상세로 가는 고리 */
  site?: { id: string; name: string };
  /** 정기 알림의 열쇠(open-purchase:2026-11-10) — 같은 알림을 두 번 남기지 않게 이 줄로 가른다(store/agents agentRemind) */
  remind?: string;
  /** 자동의 말이 짚는 화면 — 「거래명세서 보기 →」 */
  link?: { href: string; label: string };
}

/**
 * 에이전트 사용량 — 한 달(한국 달력) 동안의 답 수 · 비용 어림 · 토큰 (한백 2026-11-03 「사용량 추적도 해야할듯」).
 * 셈은 답마다 남긴 meta 에서 한다(agent_messages) — 따로 표를 두지 않는다. 비용은 토큰 × 단가표(lib/llm-usage)의 어림이다.
 */
export interface AgentUsage {
  /** 이번 달 · 지난달 'YYYY-MM' */
  month: string;
  prevMonth: string;
  /** 담당마다 — 조직도 순서 */
  byAgent: Array<{ agentId: string; name: string; replies: number; usd: number; prevReplies: number; prevUsd: number }>;
  /** 이번 달 토큰 — 토큰을 적기 시작한 뒤의 답만 센다(replies 가 그 답 수) */
  tokens: { replies: number; input: number; output: number; cacheRead: number; cacheWrite: number; searches: number };
}

/**
 * 보낼 메일의 자리 (migrations/0111) —
 *   draft      승인 대기. 에이전트가 올렸고 한백이 아직 누르지 않았다
 *   sending    보내는 중 — 두 번 나가지 않게 이 상태로 먼저 잡는다
 *   sent       나갔다
 *   failed     메일 서버가 받지 않았다 — 고쳐서 다시 보낼 수 있다
 *   discarded  버렸다 — 되살릴 수 있다(화면 규칙 7)
 */
export type AgentMailStatus = 'draft' | 'sending' | 'sent' | 'failed' | 'discarded';
export const AGENT_MAIL_STATUSES = ['draft', 'sending', 'sent', 'failed', 'discarded'] as const satisfies readonly AgentMailStatus[];

/**
 * 담당이 올린 메일 초안 — ★한백이 승인해야 나간다★(한백 2026-11-03 「난 그거에 대해 승인을 하고 너가 메일을 보내는건데」).
 * 보내는 계정은 콘솔에 연결한 한백의 다음 메일 하나다(MailAccountInfo).
 */
export interface AgentMail {
  id: string;
  /** 초안을 쓴 에이전트의 답 — 대화에서 그 답 밑에 선다. 답이 지워졌으면 null */
  messageId: string | null;
  /** 현장 메일(계약서 초안처럼 현장 서류를 붙인 양식 메일)이면 그 현장과 양식 이름 — 아니면 null */
  projectId: string | null;
  kind: string | null;
  status: AgentMailStatus;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** 붙일 파일 — 그 담당에게 넘긴 파일 */
  files: AgentFile[];
  /** 보내지 못한 까닭(failed) */
  error: string | null;
  /** 보낸 계정 */
  from: string | null;
  /** YYYY-MM-DD HH:mm (한국 시각) */
  createdAt: string;
  sentAt: string | null;
  /** 승인하고 보낸 사람 */
  sentBy: string | null;
}

/** 콘솔이 메일을 보내는 계정 — 토큰은 싣지 않는다 */
export interface MailAccountInfo {
  email: string;
  /** YYYY-MM-DD HH:mm */
  connectedAt: string;
  connectedBy: string;
}

/** 담당에게 넘긴 파일 — 지시나 기록에 붙는다(migrations/0110) */
export interface AgentFile {
  id: string;
  name: string;
  url: string;
  /** 바이트 */
  size: number;
  contentType: string | null;
}

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  author: string;
  /** 파일만 넘긴 말이면 빈 글일 수 있다 */
  body: string;
  /** YYYY-MM-DD HH:mm (한국 시각) */
  at: string;
  meta: AgentMessageMeta | null;
  files: AgentFile[];
}

/**
 * 한 주(월요일부터 일요일까지, 한국 달력)에 그 담당과 오간 것의 셈 — 「주간 기록」의 한 줄
 * (한백 지시 2026-11-02 「각 담당자마다 주단위로 뭐했는지도 과거 이력 조회 필요」).
 */
export interface AgentWeek {
  /** 그 주 월요일 YYYY-MM-DD */
  start: string;
  /** 그 주 일요일 YYYY-MM-DD */
  end: string;
  /** 한백의 지시 · 기록만 · 에이전트의 답 · 자동(콘솔이 담당의 이름으로 한 일) */
  user: number;
  note: number;
  agent: number;
  auto: number;
  /** 그 주에 적힌 할 일 · 끝난 할 일 */
  tasksAdded: number;
  tasksDone: number;
  /** 업무 정의를 넣고 · 고치고 · 지운 수 */
  dutyChanges: number;
  /** 팀 목표 · 방향을 넣고 · 고치고 · 지운 수 — 팀장(전략·기획)에게만 선다 */
  directionChanges: number;
  files: number;
  /** 그 주에 나간 메일 */
  mails: number;
  /** 에이전트의 답에 든 비용 어림(달러) */
  usd: number;
}

/** 주간 기록에서 대화 사이에 끼는 일 — 할 일이 적히고 끝나고, 업무 정의가 바뀌고, 메일이 나간 때 */
export interface AgentEvent {
  /** YYYY-MM-DD HH:mm (한국 시각) */
  at: string;
  kind:
    | 'task-added' | 'task-done' | 'duty-added' | 'duty-edited' | 'duty-deleted' | 'mail-sent'
    | 'direction-added' | 'direction-edited' | 'direction-deleted';
  title: string;
  /** 적은 쪽 — 사람 이름 또는 에이전트 이름 */
  by: string;
  byAgent: boolean;
  /** 업무 정의 · 목표 · 방향이 바뀌었을 때 — 앞의 내용과 바뀐 내용(감사기록 그대로, 길면 잘려 있다) */
  before?: string | null;
  after?: string | null;
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
  /** 승인을 기다리는 메일(승인 대기 · 보내지 못함) */
  pendingMails: number;
}

export interface AgentDetail {
  agent: Agent;
  duties: AgentDuty[];
  /** 열린 것이 위(기한 이른 순), 끝낸 것은 아래(최근 끝낸 순) */
  tasks: AgentTask[];
  /** 오래된 것이 앞 — 대화처럼 읽힌다. 한 주를 고르면 그 주의 말 전부 */
  messages: AgentMessage[];
  /**
   * 실린 말에 딸린 메일 초안(그 답 밑에 선다) — 지금 대화면 답에 이어지지 못한 초안(답을 남기다 끊긴 것)도 싣는다.
   * 오래된 것이 앞
   */
  mails: AgentMail[];
  /** 승인을 기다리는 메일(승인 대기 · 보내지 못함) — 실린 말 밖의 것까지 */
  pendingMails: number;
  /** 무엇이든 오간 주 — 최근 주가 앞 */
  weeks: AgentWeek[];
  /** 한 주를 골랐을 때만 — 그 주와, 대화 사이에 끼는 일(할 일 · 업무 정의) */
  week: { start: string; end: string; events: AgentEvent[] } | null;
}

/** 에이전트가 지금 맡은 범위의 한 줄 — 카드와 머리말에 선다(lib/agents/brief headlineOf) */
export interface AgentHeadline {
  /** 「현장 42」처럼 짧은 셈 여럿 — tone 이 warn 이면 노랑 꼬리표 */
  counts: Array<{ label: string; value: string; tone?: 'warn' | 'stop' }>;
}

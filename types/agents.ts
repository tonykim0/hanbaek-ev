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

/**
 * 담당의 갈래 — 갈래마다 보는 자료와 손에 쥔 도구가 다르다(lib/agents/scope · lib/agents/brain).
 *   strategy    전략·기획 — 시장 정보(웹 검색)와 수주 흐름. 조직도의 맨 위(한백 바로 밑)다
 *   operator    운영사 하나의 현장 — 칸 · 차례 · 정체 · 반려
 *   settlement  정산 — 기성관리(운영사에게서 수금) · 지급관리(협력사에게 영업비·시공비) · 열린구매(지급을 위한 아지트 지출
 *               글과 자료). 열린구매는 따로 있던 담당을 2026-11-02 여기 합쳤다(한백 「정산담당이 열린구매까지 같이하는거야」)
 */
export type AgentKind = 'strategy' | 'operator' | 'settlement';
export const AGENT_KINDS = ['strategy', 'operator', 'settlement'] as const satisfies readonly AgentKind[];

/** 화면의 묶음 이름 */
export const AGENT_KIND_LABEL: Record<AgentKind, string> = {
  strategy: '전략·기획',
  operator: '운영사 담당',
  settlement: '정산',
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
  /** 이 답에서 올린 메일 초안의 제목 */
  mails?: string[];
}

/**
 * 보낼 메일의 자리 (migrations/0111) —
 *   draft      승인 대기. 에이전트가 올렸고 한백이 아직 누르지 않았다
 *   sending    보내는 중 — 두 번 나가지 않게 이 상태로 먼저 잡는다
 *   sent       나갔다
 *   failed     구글이 받지 않았다 — 고쳐서 다시 보낼 수 있다
 *   discarded  버렸다 — 되살릴 수 있다(화면 규칙 7)
 */
export type AgentMailStatus = 'draft' | 'sending' | 'sent' | 'failed' | 'discarded';
export const AGENT_MAIL_STATUSES = ['draft', 'sending', 'sent', 'failed', 'discarded'] as const satisfies readonly AgentMailStatus[];

/**
 * 담당이 올린 메일 초안 — ★한백이 승인해야 나간다★(한백 2026-11-03 「난 그거에 대해 승인을 하고 너가 메일을 보내는건데」).
 * 보내는 계정은 콘솔에 연결한 Gmail 하나다(MailAccountInfo).
 */
export interface AgentMail {
  id: string;
  /** 초안을 쓴 에이전트의 답 — 대화에서 그 답 밑에 선다. 답이 지워졌으면 null */
  messageId: string | null;
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
  /** 한백의 지시 · 기록만 · 에이전트의 답 */
  user: number;
  note: number;
  agent: number;
  /** 그 주에 적힌 할 일 · 끝난 할 일 */
  tasksAdded: number;
  tasksDone: number;
  /** 업무 정의를 넣고 · 고치고 · 지운 수 */
  dutyChanges: number;
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
  kind: 'task-added' | 'task-done' | 'duty-added' | 'duty-edited' | 'duty-deleted' | 'mail-sent';
  title: string;
  /** 적은 쪽 — 사람 이름 또는 에이전트 이름 */
  by: string;
  byAgent: boolean;
  /** 업무 정의가 바뀌었을 때 — 앞의 내용과 바뀐 내용(감사기록 그대로, 길면 잘려 있다) */
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

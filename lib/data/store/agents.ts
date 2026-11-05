/**
 * 에이전트 — 업무 정의 · 할 일 · 오간 말 (한백 지시 2026-11-01·02, migrations/0109).
 *
 * ★한백 관리자만★ 읽고 쓴다 — 화면은 (write) 안에 있고(/admin/agents), 라우트는 adminWrite 다. 여기서도 한 번 더 본다
 * (저장소를 바로 부르는 시험·스크립트의 문).
 *
 * ★에이전트가 적는 것도 이 문을 지난다★ — 대화 중에 에이전트가 할 일을 적거나 끝내면(lib/agents/brain 의 도구) 그 대화를
 * 연 관리자가 actor 이고, 적은 쪽(author)에는 에이전트 이름이 남는다(byAgent). 감사기록에 「에이전트가 적음」으로 가른다.
 *
 * 에이전트가 보는 현장·지급·기성은 여기 없다 — 콘솔이 이미 셈하는 것을 부를 때마다 읽는다(lib/agents/scope).
 */
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { agentDuties, agentFiles, agentMails, agentMessages, agents, agentTasks, auditLog, projects } from '@/lib/db/schema';
import { shiftMonths, stampOf, today } from '@/lib/date';
import { allSlots } from '../db-slot';
import type {
  Agent, AgentDetail, AgentDuty, AgentEvent, AgentFile, AgentKind, AgentMessage, AgentMessageMeta, AgentMessageRole,
  AgentSummary, AgentTask, AgentUsage, AgentWeek,
} from '@/types/agents';
import { AGENT_KINDS, AGENT_MESSAGE_ROLES, agentAuditKey } from '@/types/agents';
import { AGENT_FILES_PER_MESSAGE, agentFileName, agentFilePrefix } from '@/lib/agents/files';
import { mondayOf, shiftDay } from '@/lib/agents/weeks';
import { asBiz, type Biz } from '@/lib/biz';
import type { CpoName } from '@/types/project';
import type { Actor, ProjectRepository } from '../repository';
import { assertAdmin } from './shared';
import { mailsForMessages } from './agent-mail';
import { notifyAgentRemind } from './notifications';

/** 글 상한 — 지시·기록은 메모 결이고, 에이전트의 말은 아지트 글 초안처럼 길 수 있다 */
const MAX = { dutyTitle: 60, dutyBody: 4000, taskTitle: 120, taskNote: 1000, said: 6000, agentSaid: 20000 } as const;
/** 화면에 싣는 대화 — 최근 것부터 이만큼. 에이전트가 읽는 것은 lib/agents/brain 이 따로 자른다 */
const THREAD_LIMIT = 300;
/** 현황의 활동 칸 — 이레 */
const ACTIVITY_DAYS = 7;
/** 주간 기록에 싣는 주 — 최근 한 해 */
const WEEKS_LIMIT = 52;
/** 한 주를 펼칠 때 싣는 말 상한 */
const WEEK_THREAD_LIMIT = 1000;

/*
 * 주간 기록이 감사기록에서 읽는 일 — 할 일이 적히고 끝나고, 업무 정의가 바뀐 때. 감사기록은 지운 할 일·업무 정의의 흔적도
 * 남아 있어 「그 주에 무엇을 했나」를 그대로 보여준다(할 일 표는 지금 상태만 안다). 이름은 아래 쓰기들이 남기는 그대로다.
 */
const DUTY_ACTION = { add: '에이전트 업무 정의', edit: '에이전트 업무 정의 수정', del: '에이전트 업무 정의 삭제' } as const;
const TASK_ADDED = ['에이전트 할 일', '에이전트 할 일 (에이전트가 적음)'];
const TASK_DONE = ['에이전트 할 일 끝냄', '에이전트 할 일 끝냄 (에이전트가 적음)'];
/** 메일이 나간 때 — store/agent-mail finishAgentMail 이 남긴다 */
const MAIL_SENT = '에이전트 메일 보냄';
/** 에이전트가 한 쓰기의 감사기록 꼬리 — 사람이 한 것과 가른다 */
export const BY_AGENT = ' (에이전트가 적음)';
/** 업무 정의가 바뀐 때 — 담당이 대화 중에 했으면(한백이 시켜서) 꼬리가 붙는다(2026-11-05) */
const DUTY_ACTIONS = Object.values(DUTY_ACTION).flatMap((a) => [a, `${a}${BY_AGENT}`]);
/**
 * 팀 목표 · 방향이 바뀐 때 — store/agent-team 이 팀장의 열쇠로 남긴다(migrations/0120). 팀장이 대화 중에 했으면 꼬리가 붙는다
 */
export const DIRECTION_ACTION = { add: '에이전트 목표 · 방향', edit: '에이전트 목표 · 방향 수정', del: '에이전트 목표 · 방향 삭제' } as const;
const DIRECTION_ACTIONS = Object.values(DIRECTION_ACTION).flatMap((a) => [a, `${a}${BY_AGENT}`]);
const EVENT_ACTIONS = [...DUTY_ACTIONS, ...TASK_ADDED, ...TASK_DONE, MAIL_SENT, ...DIRECTION_ACTIONS];
/** 승인을 기다리는 메일 */
const PENDING_MAIL = ['draft', 'failed'];

/** 한국 시각으로 그 날 0시 */
export const kstStart = (day: string) => new Date(`${day}T00:00:00+09:00`);

/** 시각 열 → 그 시각이 든 주의 월요일(한국 달력) 글자. 고른 칸과 묶는 칸에 같은 것을 쓴다 */
const weekOf = (col: PgColumn): SQL<string> =>
  sql<string>`to_char(date_trunc('week', ${col} at time zone 'Asia/Seoul'), 'YYYY-MM-DD')`;

/** 감사기록의 「이름(아이디)」에서 이름만 */
const actorName = (a: string) => a.replace(/\([^()]*\)$/, '');
/** 업무 정의 감사값 「제목 — 내용」의 제목 */
const dutyTitleOf = (v: string | null) => (v ?? '').split(' — ')[0];

function eventOf(row: typeof auditLog.$inferSelect, agentName: string): AgentEvent | null {
  const at = stampOf(row.at);
  const by = actorName(row.actor);
  /* 목표 · 방향 · 업무 정의 — 담당이 대화 중에 했으면 적은 쪽이 담당이다 */
  const byAgent = row.action.endsWith(BY_AGENT);
  const direction = byAgent ? row.action.slice(0, -BY_AGENT.length) : row.action;
  const who = byAgent ? { by: agentName, byAgent: true } : { by, byAgent: false };
  switch (direction) {
    case DIRECTION_ACTION.add:
      return { at, kind: 'direction-added', title: dutyTitleOf(row.newValue), ...who, after: row.newValue };
    case DIRECTION_ACTION.edit:
      return { at, kind: 'direction-edited', title: dutyTitleOf(row.newValue), ...who, before: row.oldValue, after: row.newValue };
    case DIRECTION_ACTION.del:
      return { at, kind: 'direction-deleted', title: dutyTitleOf(row.oldValue), ...who, before: row.oldValue };
  }
  switch (direction) {
    case DUTY_ACTION.add:
      return { at, kind: 'duty-added', title: dutyTitleOf(row.newValue), ...who, after: row.newValue };
    case DUTY_ACTION.edit:
      return { at, kind: 'duty-edited', title: dutyTitleOf(row.newValue), ...who, before: row.oldValue, after: row.newValue };
    case DUTY_ACTION.del:
      return { at, kind: 'duty-deleted', title: dutyTitleOf(row.oldValue), ...who, before: row.oldValue };
  }
  switch (row.action) {
    case '에이전트 할 일':
      return { at, kind: 'task-added', title: row.newValue ?? '', by, byAgent: false };
    case '에이전트 할 일 (에이전트가 적음)':
      return { at, kind: 'task-added', title: row.newValue ?? '', by: agentName, byAgent: true };
    case '에이전트 할 일 끝냄':
      return { at, kind: 'task-done', title: row.oldValue ?? '', by, byAgent: false };
    case '에이전트 할 일 끝냄 (에이전트가 적음)':
      return { at, kind: 'task-done', title: row.oldValue ?? '', by: agentName, byAgent: true };
    case MAIL_SENT:
      return { at, kind: 'mail-sent', title: row.newValue ?? '', by, byAgent: false };
    default:
      return null;
  }
}

export function fileOf(r: typeof agentFiles.$inferSelect): AgentFile {
  return { id: r.id, name: r.name, url: r.url, size: r.size, contentType: r.contentType };
}


const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function clip(v: string | null | undefined, max: number, what: string): string {
  const s = (v ?? '').trim();
  if (s.length > max) throw new Error(`${what}은(는) ${max}자까지입니다.`);
  return s;
}

export function agentOf(r: typeof agents.$inferSelect): Agent {
  const kind = (AGENT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as AgentKind) : 'operator';
  return {
    id: r.id, kind, biz: asBiz(r.biz), cpo: (r.cpo as CpoName | null) ?? null, company: r.company ?? null, name: r.name,
  };
}

export async function agentRow(id: string): Promise<Agent> {
  const [row] = await getDb().select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) throw new Error('담당을 찾을 수 없습니다.');
  return agentOf(row);
}

/** 모르는 종류는 기록으로 — 답을 바라지도, 에이전트의 말로 읽히지도 않게 */
const roleOf = (v: string): AgentMessageRole =>
  ((AGENT_MESSAGE_ROLES as readonly string[]).includes(v) ? v : 'note') as AgentMessageRole;

export function messageOf(r: typeof agentMessages.$inferSelect, files: AgentFile[] = []): AgentMessage {
  return {
    id: r.id,
    role: roleOf(r.role),
    author: r.author,
    body: r.body,
    at: stampOf(r.at),
    meta: r.meta ?? null,
    files,
  };
}

/** 할 일 한 줄 — 적은 쪽이 그 담당의 이름이면 에이전트가 적은 것이다 */
export function taskOf(t: typeof agentTasks.$inferSelect, projectName: string | null, agentName: string): AgentTask {
  return {
    id: t.id,
    title: t.title,
    note: t.note,
    projectId: t.projectId,
    projectName,
    due: t.due,
    doneAt: t.doneAt ? stampOf(t.doneAt) : null,
    author: t.author,
    byAgent: t.author === agentName,
    createdAt: stampOf(t.createdAt),
  };
}

/** 열린 것이 위 — 기한 이른 순(기한 없는 것은 그 뒤), 끝낸 것은 아래 — 최근 끝낸 순 */
export function taskOrder(a: AgentTask, b: AgentTask): number {
  if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1;
  if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
  if (a.due !== b.due) return (a.due ?? '9999').localeCompare(b.due ?? '9999');
  return a.createdAt.localeCompare(b.createdAt);
}

export const agentStore: Pick<
  ProjectRepository,
  | 'listAgents' | 'getAgent' | 'saveAgentDuty' | 'deleteAgentDuty'
  | 'addAgentTask' | 'setAgentTaskDone' | 'deleteAgentTask' | 'addAgentMessage' | 'agentUsage' | 'agentRemind'
> = {
  /*
   * 사용량 — 이번 달 · 지난달(한국 달력)의 답 수와 비용 어림, 이번 달 토큰 (한백 2026-11-03 「사용량 추적도 해야할듯」).
   * 따로 표를 두지 않는다 — 답마다 남긴 meta(usd · tokens · searches)를 달로 묶는다. 토큰은 적기 시작한(2026-11-03) 뒤의 답만 있다.
   * 사업마다 센다(biz — 조직도가 사업마다다, migrations/0118).
   */
  async agentUsage(actor, biz: Biz = 'ev'): Promise<AgentUsage> {
    assertAdmin(actor, '에이전트');
    const db = getDb();
    const month = today().slice(0, 7);
    const prevMonth = shiftMonths(`${month}-01`, -1).slice(0, 7);
    const monthOf = sql<string>`to_char(${agentMessages.at} at time zone 'Asia/Seoul', 'YYYY-MM')`;
    /* 그 사업의 담당이 한 답만 */
    const said = and(
      eq(agentMessages.role, 'agent'),
      inArray(agentMessages.agentId, db.select({ id: agents.id }).from(agents).where(eq(agents.biz, biz))),
    );
    const [rows, sums, [t]] = await allSlots([
      () => db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.biz, biz)).orderBy(asc(agents.sort)),
      () => db.select({
        agentId: agentMessages.agentId,
        month: monthOf,
        n: sql<number>`count(*)::int`,
        usd: sql<number>`coalesce(sum((${agentMessages.meta}->>'usd')::float8), 0)::float8`,
      }).from(agentMessages)
        .where(and(said, gte(agentMessages.at, kstStart(`${prevMonth}-01`))))
        .groupBy(agentMessages.agentId, monthOf),
      () => db.select({
        replies: sql<number>`(count(*) filter (where ${agentMessages.meta}->'tokens' is not null))::int`,
        input: sql<number>`coalesce(sum((${agentMessages.meta}->'tokens'->>'input')::float8), 0)::float8`,
        output: sql<number>`coalesce(sum((${agentMessages.meta}->'tokens'->>'output')::float8), 0)::float8`,
        cacheRead: sql<number>`coalesce(sum((${agentMessages.meta}->'tokens'->>'cacheRead')::float8), 0)::float8`,
        cacheWrite: sql<number>`coalesce(sum((${agentMessages.meta}->'tokens'->>'cacheWrite')::float8), 0)::float8`,
        searches: sql<number>`coalesce(sum((${agentMessages.meta}->>'searches')::float8), 0)::float8`,
      }).from(agentMessages).where(and(said, gte(agentMessages.at, kstStart(`${month}-01`)))),
    ] as const);
    const cell = (agentId: string, m: string) => sums.find((s) => s.agentId === agentId && s.month === m);
    return {
      month,
      prevMonth,
      byAgent: rows.map((r) => ({
        agentId: r.id,
        name: r.name,
        replies: cell(r.id, month)?.n ?? 0,
        usd: Number(cell(r.id, month)?.usd ?? 0),
        prevReplies: cell(r.id, prevMonth)?.n ?? 0,
        prevUsd: Number(cell(r.id, prevMonth)?.usd ?? 0),
      })),
      tokens: {
        replies: t?.replies ?? 0,
        input: Number(t?.input ?? 0),
        output: Number(t?.output ?? 0),
        cacheRead: Number(t?.cacheRead ?? 0),
        cacheWrite: Number(t?.cacheWrite ?? 0),
        searches: Number(t?.searches ?? 0),
      },
    };
  },

  /** 그 사업의 담당만 — 조직도가 사업마다다(migrations/0118) */
  async listAgents(actor, biz: Biz = 'ev'): Promise<AgentSummary[]> {
    assertAdmin(actor, '에이전트');
    const db = getDb();
    const now = today();
    /* 활동 칸 이레 — 한국 달력으로 오늘부터 엿새 전까지 */
    const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => shiftDay(now, i - (ACTIVITY_DAYS - 1)));
    const dayOfAt = sql<string>`to_char(${agentMessages.at} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;
    const [rows, duties, tasks, lasts, recent, mails, openRows] = await allSlots([
      () => db.select().from(agents).where(eq(agents.biz, biz)).orderBy(asc(agents.sort)),
      () => db.select({ agentId: agentDuties.agentId, n: sql<number>`count(*)::int` })
        .from(agentDuties).groupBy(agentDuties.agentId),
      () => db.select({
        agentId: agentTasks.agentId,
        open: sql<number>`(count(*) filter (where ${agentTasks.doneAt} is null))::int`,
        late: sql<number>`(count(*) filter (where ${agentTasks.doneAt} is null and ${agentTasks.due} < ${now}))::int`,
      }).from(agentTasks).groupBy(agentTasks.agentId),
      () => db.selectDistinctOn([agentMessages.agentId], {
        agentId: agentMessages.agentId, role: agentMessages.role, body: agentMessages.body, at: agentMessages.at,
      }).from(agentMessages).orderBy(agentMessages.agentId, desc(agentMessages.at)),
      () => db.select({
        agentId: agentMessages.agentId,
        day: dayOfAt,
        n: sql<number>`count(*)::int`,
        usd: sql<number>`coalesce(sum((${agentMessages.meta}->>'usd')::float8), 0)::float8`,
      }).from(agentMessages)
        .where(sql`${agentMessages.at} >= ${`${days[0]}T00:00:00+09:00`}::timestamptz`)
        .groupBy(agentMessages.agentId, dayOfAt),
      () => db.select({ agentId: agentMails.agentId, n: sql<number>`count(*)::int` })
        .from(agentMails).where(inArray(agentMails.status, PENDING_MAIL)).groupBy(agentMails.agentId),
      /* 「지금 하는 일」 — 그 사업 담당의 열린 할 일(끝낸 것은 안 읽는다 · 열린 것은 몇 안 된다) */
      () => db.select({ t: agentTasks, projectName: projects.name, agentName: agents.name })
        .from(agentTasks)
        .innerJoin(agents, eq(agents.id, agentTasks.agentId))
        .leftJoin(projects, eq(projects.id, agentTasks.projectId))
        .where(and(eq(agents.biz, biz), isNull(agentTasks.doneAt))),
    ] as const);
    /* 담당마다 맨 앞의 할 일 — 담당 화면의 할 일 목록과 같은 차례(taskOrder: 기한 지난 것 · 이른 것이 앞) */
    const topOf = new Map<string, AgentTask>();
    for (const { t, projectName, agentName } of openRows) {
      const task = taskOf(t, projectName ?? null, agentName);
      const cur = topOf.get(t.agentId);
      if (!cur || taskOrder(task, cur) < 0) topOf.set(t.agentId, task);
    }
    const mailOf = new Map(mails.map((m) => [m.agentId, m.n]));
    const dutyOf = new Map(duties.map((d) => [d.agentId, d.n]));
    /* 담당마다 열린 · 기한 지난 할 일 수 — 이름이 위 taskOf(할 일 한 줄 짓기)를 가리지 않게 */
    const countOf = new Map(tasks.map((t) => [t.agentId, t]));
    const lastOf = new Map(lasts.map((m) => [m.agentId, m]));
    const dayKey = (agentId: string, day: string) => `${agentId}|${day}`;
    const recentOf = new Map(recent.map((x) => [dayKey(x.agentId, x.day), x]));
    return rows.map((r) => {
      const last = lastOf.get(r.id);
      return {
        ...agentOf(r),
        duties: dutyOf.get(r.id) ?? 0,
        openTasks: countOf.get(r.id)?.open ?? 0,
        lateTasks: countOf.get(r.id)?.late ?? 0,
        topTask: topOf.get(r.id) ?? null,
        activity: days.map((day) => ({ day, n: recentOf.get(dayKey(r.id, day))?.n ?? 0 })),
        usdToday: Number(recentOf.get(dayKey(r.id, now))?.usd ?? 0),
        pendingMails: mailOf.get(r.id) ?? 0,
        last: last
          ? {
            role: roleOf(last.role),
            at: stampOf(last.at),
            line: last.body.replace(/\s+/g, ' ').trim().slice(0, 80),
          }
          : null,
      };
    });
  },

  async getAgent(id, actor, opts): Promise<AgentDetail> {
    assertAdmin(actor, '에이전트');
    const agent = await agentRow(id);
    const db = getDb();
    /* 한 주를 골랐으면 그 주(월요일 0시 ~ 다음 월요일 0시, 한국 시각)의 말 전부, 아니면 최근 말 */
    const start = opts?.week && DAY_RE.test(opts.week) ? mondayOf(opts.week) : null;
    const range = start ? { from: kstStart(start), to: kstStart(shiftDay(start, 7)) } : null;
    const msgWeek = weekOf(agentMessages.at);
    const logWeek = weekOf(auditLog.at);
    const fileWeek = weekOf(agentFiles.at);
    const [duties, tasks, said, msgWeeks, logWeeks, fileWeeks, pending] = await allSlots([
      () => db.select().from(agentDuties).where(eq(agentDuties.agentId, id))
        .orderBy(asc(agentDuties.sort), asc(agentDuties.createdAt)),
      () => db.select({ t: agentTasks, projectName: projects.name })
        .from(agentTasks).leftJoin(projects, eq(projects.id, agentTasks.projectId))
        .where(eq(agentTasks.agentId, id)),
      () => (range
        ? db.select().from(agentMessages)
          .where(and(eq(agentMessages.agentId, id), gte(agentMessages.at, range.from), lt(agentMessages.at, range.to)))
          .orderBy(desc(agentMessages.at)).limit(WEEK_THREAD_LIMIT)
        : db.select().from(agentMessages).where(eq(agentMessages.agentId, id))
          .orderBy(desc(agentMessages.at)).limit(THREAD_LIMIT)),
      () => db.select({
        week: msgWeek,
        role: agentMessages.role,
        n: sql<number>`count(*)::int`,
        usd: sql<number>`coalesce(sum((${agentMessages.meta}->>'usd')::float8), 0)::float8`,
      }).from(agentMessages).where(eq(agentMessages.agentId, id)).groupBy(msgWeek, agentMessages.role),
      () => db.select({ week: logWeek, action: auditLog.action, n: sql<number>`count(*)::int` })
        .from(auditLog).where(and(eq(auditLog.field, agentAuditKey(agent)), inArray(auditLog.action, EVENT_ACTIONS)))
        .groupBy(logWeek, auditLog.action),
      () => db.select({ week: fileWeek, n: sql<number>`count(*)::int` })
        .from(agentFiles).where(eq(agentFiles.agentId, id)).groupBy(fileWeek),
      () => db.select({ n: sql<number>`count(*)::int` })
        .from(agentMails).where(and(eq(agentMails.agentId, id), inArray(agentMails.status, PENDING_MAIL))),
    ] as const);

    const rows = said.reverse();
    /* 메일 초안은 그것을 쓴 답 밑에 선다 — 지금 대화면 답에 이어지지 못한 초안(답을 남기다 끊긴 것)도 */
    const mails = await mailsForMessages(id, rows.map((m) => m.id), !range);
    const [files, logs] = await allSlots([
      () => (rows.length
        ? db.select().from(agentFiles).where(inArray(agentFiles.messageId, rows.map((m) => m.id))).orderBy(asc(agentFiles.at))
        : Promise.resolve([] as Array<typeof agentFiles.$inferSelect>)),
      () => (range
        ? db.select().from(auditLog)
          .where(and(
            eq(auditLog.field, agentAuditKey(agent)), inArray(auditLog.action, EVENT_ACTIONS),
            gte(auditLog.at, range.from), lt(auditLog.at, range.to),
          ))
          .orderBy(asc(auditLog.at))
        : Promise.resolve([] as Array<typeof auditLog.$inferSelect>)),
    ] as const);
    const filesOf = new Map<string, AgentFile[]>();
    for (const f of files) filesOf.set(f.messageId, [...(filesOf.get(f.messageId) ?? []), fileOf(f)]);

    /* 주마다 셈 — 말 · 할 일 · 업무 정의 · 파일 중 하나라도 있던 주 */
    const weeks = new Map<string, AgentWeek>();
    const weekRow = (w: string): AgentWeek => {
      let x = weeks.get(w);
      if (!x) {
        x = {
          start: w, end: shiftDay(w, 6), user: 0, note: 0, agent: 0, auto: 0, peer: 0, tasksAdded: 0, tasksDone: 0, dutyChanges: 0,
          directionChanges: 0, files: 0, mails: 0, usd: 0,
        };
        weeks.set(w, x);
      }
      return x;
    };
    for (const r of msgWeeks) {
      const x = weekRow(r.week);
      if (r.role === 'user') x.user += r.n;
      else if (r.role === 'agent') x.agent += r.n;
      else if (r.role === 'auto') x.auto += r.n;
      else if (r.role === 'peer') x.peer += r.n;
      else x.note += r.n;
      x.usd += Number(r.usd ?? 0);
    }
    for (const r of logWeeks) {
      const x = weekRow(r.week);
      if (DUTY_ACTIONS.includes(r.action)) x.dutyChanges += r.n;
      else if (DIRECTION_ACTIONS.includes(r.action)) x.directionChanges += r.n;
      else if (TASK_ADDED.includes(r.action)) x.tasksAdded += r.n;
      else if (TASK_DONE.includes(r.action)) x.tasksDone += r.n;
      else if (r.action === MAIL_SENT) x.mails += r.n;
    }
    for (const r of fileWeeks) weekRow(r.week).files += r.n;

    return {
      agent,
      duties: duties.map((d): AgentDuty => ({
        id: d.id, title: d.title, body: d.body, updatedAt: d.updatedAt ? stampOf(d.updatedAt) : null,
      })),
      tasks: tasks.map(({ t, projectName }) => taskOf(t, projectName ?? null, agent.name)).sort(taskOrder),
      messages: rows.map((m) => messageOf(m, filesOf.get(m.id) ?? [])),
      mails,
      pendingMails: pending[0]?.n ?? 0,
      weeks: [...weeks.values()].sort((x, y) => y.start.localeCompare(x.start)).slice(0, WEEKS_LIMIT),
      week: start
        ? {
          start,
          end: shiftDay(start, 6),
          events: logs.map((l) => eventOf(l, agent.name)).filter((e): e is AgentEvent => e !== null),
        }
        : null,
    };
  },

  async saveAgentDuty(input, actor): Promise<string> {
    assertAdmin(actor, '업무 정의');
    const agent = await agentRow(input.agentId);
    const tail = input.byAgent ? BY_AGENT : '';
    const title = clip(input.title, MAX.dutyTitle, '업무 이름');
    if (!title) throw new Error('업무 이름을 적어주세요.');
    const body = clip(input.body, MAX.dutyBody, '업무 정의');
    const db = getDb();

    if (input.id) {
      const [old] = await db.select().from(agentDuties)
        .where(and(eq(agentDuties.id, input.id), eq(agentDuties.agentId, agent.id))).limit(1);
      if (!old) throw new Error('업무 정의를 찾을 수 없습니다.');
      if (old.title === title && old.body === body) return old.id;
      await db.transaction(async (tx) => {
        await tx.update(agentDuties).set({ title, body, updatedAt: new Date() }).where(eq(agentDuties.id, old.id));
        await writeAudit(tx, {
          projectId: null, actor, action: `${DUTY_ACTION.edit}${tail}`, field: agentAuditKey(agent),
          oldValue: `${old.title} — ${old.body}`.slice(0, 2000), newValue: `${title} — ${body}`.slice(0, 2000),
        });
      });
      return old.id;
    }

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const [{ top }] = await tx.select({ top: sql<number>`coalesce(max(${agentDuties.sort}), 0)::int` })
        .from(agentDuties).where(eq(agentDuties.agentId, agent.id));
      await tx.insert(agentDuties).values({ id, agentId: agent.id, title, body, sort: top + 10 });
      await writeAudit(tx, {
        projectId: null, actor, action: `${DUTY_ACTION.add}${tail}`, field: agentAuditKey(agent),
        oldValue: null, newValue: `${title} — ${body}`.slice(0, 2000),
      });
    });
    return id;
  },

  async deleteAgentDuty(input, actor): Promise<{ title: string }> {
    assertAdmin(actor, '업무 정의');
    const agent = await agentRow(input.agentId);
    const db = getDb();
    const [old] = await db.select().from(agentDuties)
      .where(and(eq(agentDuties.id, input.id), eq(agentDuties.agentId, agent.id))).limit(1);
    if (!old) throw new Error('업무 정의를 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx.delete(agentDuties).where(eq(agentDuties.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: `${DUTY_ACTION.del}${input.byAgent ? BY_AGENT : ''}`, field: agentAuditKey(agent),
        oldValue: `${old.title} — ${old.body}`.slice(0, 2000), newValue: null,
      });
    });
    return { title: old.title };
  },

  async addAgentTask(input, actor): Promise<{ id: string; title: string }> {
    assertAdmin(actor, '에이전트 할 일');
    const agent = await agentRow(input.agentId);
    const title = clip(input.title, MAX.taskTitle, '할 일');
    if (!title) throw new Error('할 일을 적어주세요.');
    const note = clip(input.note, MAX.taskNote, '덧붙일 말') || null;
    const due = input.due?.trim() || null;
    if (due && !DAY_RE.test(due)) throw new Error('기한은 YYYY-MM-DD 로 적어주세요.');
    const db = getDb();
    let projectId: string | null = input.projectId?.trim() || null;
    if (projectId) {
      const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!p) throw new Error('현장을 찾을 수 없습니다.');
      projectId = p.id;
    }
    const id = crypto.randomUUID();
    const author = input.byAgent ? agent.name : actor.name;
    await db.transaction(async (tx) => {
      await tx.insert(agentTasks).values({ id, agentId: agent.id, title, note, projectId, due, author });
      await writeAudit(tx, {
        projectId, actor, action: input.byAgent ? '에이전트 할 일 (에이전트가 적음)' : '에이전트 할 일', field: agentAuditKey(agent),
        oldValue: null, newValue: [title, due && `기한 ${due}`, note].filter(Boolean).join(' · ').slice(0, 2000),
      });
    });
    return { id, title };
  },

  async setAgentTaskDone(input, actor): Promise<{ title: string }> {
    assertAdmin(actor, '에이전트 할 일');
    const agent = await agentRow(input.agentId);
    const db = getDb();
    const [old] = await db.select().from(agentTasks)
      .where(and(eq(agentTasks.id, input.id), eq(agentTasks.agentId, agent.id))).limit(1);
    if (!old) throw new Error('할 일을 찾을 수 없습니다.');
    // 이미 그 상태면 할 것이 없다 — 에이전트가 끝난 일을 또 끝내도 감사기록이 두 줄 남지 않게
    if (Boolean(old.doneAt) === input.done) return { title: old.title };
    await db.transaction(async (tx) => {
      await tx.update(agentTasks).set({ doneAt: input.done ? new Date() : null }).where(eq(agentTasks.id, old.id));
      await writeAudit(tx, {
        projectId: old.projectId, actor,
        action: input.done
          ? (input.byAgent ? '에이전트 할 일 끝냄 (에이전트가 적음)' : '에이전트 할 일 끝냄')
          : '에이전트 할 일 되살림',
        field: agentAuditKey(agent), oldValue: old.title, newValue: input.done ? '끝냄' : '열림',
      });
    });
    return { title: old.title };
  },

  async deleteAgentTask(input, actor): Promise<void> {
    assertAdmin(actor, '에이전트 할 일');
    const agent = await agentRow(input.agentId);
    const db = getDb();
    const [old] = await db.select().from(agentTasks)
      .where(and(eq(agentTasks.id, input.id), eq(agentTasks.agentId, agent.id))).limit(1);
    if (!old) throw new Error('할 일을 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx.delete(agentTasks).where(eq(agentTasks.id, old.id));
      await writeAudit(tx, {
        projectId: old.projectId, actor, action: '에이전트 할 일 삭제', field: agentAuditKey(agent),
        oldValue: [old.title, old.note].filter(Boolean).join(' · ').slice(0, 2000), newValue: null,
      });
    });
  },

  /**
   * 담당의 정기 알림 — 할 일 · 대화 한 줄(자동) · 한백 관리자 알림(lib/agents/remind-run · 정산 담당의 열린구매 상신, 한백 지시 2026-11-04).
   * ★열쇠마다 한 번★ — 대화의 그 줄(meta.remind)로 가른다. 할 일은 한백이 지울 수 있지만 대화는 지워지지 않아서다(할 일로 가르면 지운
   * 다음 날 아침 크론이 또 적는다). 담당 줄을 잠가 크론이 겹쳐 돌아도 하나만 선다. 셋이 같이 남거나 같이 안 남는다.
   */
  async agentRemind(input, actor) {
    assertAdmin(actor, '에이전트 알림');
    const title = clip(input.task.title, MAX.taskTitle, '할 일');
    const note = clip(input.task.note, MAX.taskNote, '덧붙일 말') || null;
    const due = input.task.due?.trim() || null;
    if (due && !DAY_RE.test(due)) throw new Error('기한은 YYYY-MM-DD 로 적어주세요.');
    const body = clip(input.say, MAX.agentSaid, '글');
    return getDb().transaction(async (tx) => {
      const [agent] = await tx.select({ id: agents.id, name: agents.name, biz: agents.biz }).from(agents)
        .where(eq(agents.id, input.agentId)).for('update');
      if (!agent) throw new Error('담당을 찾을 수 없습니다.');
      const [had] = await tx.select({ id: agentMessages.id }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, agent.id), sql`${agentMessages.meta}->>'remind' = ${input.key}`)).limit(1);
      if (had) return { created: false, taskId: null, messageId: null, alarmed: 0 };

      const taskId = crypto.randomUUID();
      await tx.insert(agentTasks).values({ id: taskId, agentId: agent.id, title, note, due, kind: input.key, author: agent.name });
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 할 일 (에이전트가 적음)', field: agentAuditKey(agent), oldValue: null,
        newValue: [title, due && `기한 ${due}`, note].filter(Boolean).join(' · ').slice(0, 2000),
      });
      const messageId = crypto.randomUUID();
      const meta: AgentMessageMeta = { remind: input.key, added: [title], ...(input.link ? { link: input.link } : {}) };
      await tx.insert(agentMessages).values({ id: messageId, agentId: agent.id, role: 'auto', author: agent.name, body, meta });
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 자동', field: agentAuditKey(agent), oldValue: null, newValue: body.slice(0, 2000),
      });
      const alarmed = await notifyAgentRemind(tx, { agentId: agent.id, ...input.alarm });
      return { created: true, taskId, messageId, alarmed };
    });
  },

  async addAgentMessage(input, actor): Promise<AgentMessage> {
    assertAdmin(actor, '에이전트 대화');
    // 자동의 말은 그 일을 하는 트랜잭션이 남긴다(store/agent-mail siteMail) — 여기로 오면 사람 이름이 붙은 가짜 자동이 된다
    if (input.role === 'auto') throw new Error('자동의 말은 여기서 남기지 않습니다.');
    const agent = await agentRow(input.agentId);
    const fromAgent = input.role === 'agent';
    const body = clip(input.body, fromAgent ? MAX.agentSaid : MAX.said, '글');
    /* 파일은 사람이 넘긴다 — 에이전트의 말에는 붙지 않는다. 자리는 라우트가 우리 Blob 에서 확인한 것이고, 여기서 한 번 더 본다 */
    const given = fromAgent ? [] : input.files ?? [];
    if (given.length > AGENT_FILES_PER_MESSAGE) throw new Error(`파일은 한 번에 ${AGENT_FILES_PER_MESSAGE}개까지입니다.`);
    for (const f of given) {
      if (!f.pathname.startsWith(agentFilePrefix(agent.id)) || f.pathname.includes('..')) throw new Error('이 담당의 파일이 아닙니다.');
    }
    if (!body && given.length === 0) throw new Error('내용을 적어주세요.');
    const id = crypto.randomUUID();
    const author = fromAgent ? agent.name : actor.name;
    const meta: AgentMessageMeta | null = fromAgent ? input.meta ?? null : null;
    const db = getDb();
    const [row, saved] = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(agentMessages)
        .values({ id, agentId: agent.id, role: input.role, author, authorId: fromAgent ? null : actor.id, body, meta })
        .returning();
      const filed = given.length
        ? await tx.insert(agentFiles).values(given.map((f) => ({
          id: crypto.randomUUID(),
          agentId: agent.id,
          messageId: id,
          name: agentFileName(f.name),
          pathname: f.pathname,
          url: f.url,
          size: Math.max(0, Math.round(f.size)),
          contentType: f.contentType,
        }))).returning()
        : [];
      await writeAudit(tx, {
        projectId: null, actor,
        action: input.role === 'user' ? '에이전트 지시' : input.role === 'note' ? '에이전트 기록' : '에이전트 답',
        field: agentAuditKey(agent), oldValue: null,
        newValue: [body.slice(0, 200), filed.length ? `파일 ${filed.map((f) => f.name).join(', ')}` : '']
          .filter(Boolean).join(' · ').slice(0, 2000),
      });
      return [inserted, filed] as const;
    });
    return messageOf(row, saved.map(fileOf));
  },
};

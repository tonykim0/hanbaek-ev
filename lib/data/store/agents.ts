/**
 * 에이전트 — 업무 정의 · 할 일 · 오간 말 (한백 지시 2026-11-01·02, migrations/0103).
 *
 * ★한백 관리자만★ 읽고 쓴다 — 화면은 (write) 안에 있고(/admin/agents), 라우트는 adminWrite 다. 여기서도 한 번 더 본다
 * (저장소를 바로 부르는 시험·스크립트의 문).
 *
 * ★에이전트가 적는 것도 이 문을 지난다★ — 대화 중에 에이전트가 할 일을 적거나 끝내면(lib/agents/brain 의 도구) 그 대화를
 * 연 관리자가 actor 이고, 적은 쪽(author)에는 에이전트 이름이 남는다(byAgent). 감사기록에 「에이전트가 적음」으로 가른다.
 *
 * 에이전트가 보는 현장·지급·기성은 여기 없다 — 콘솔이 이미 셈하는 것을 부를 때마다 읽는다(lib/agents/scope).
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { agentDuties, agentMessages, agents, agentTasks, projects } from '@/lib/db/schema';
import { stampOf, today } from '@/lib/date';
import { allSlots } from '../db-slot';
import type {
  Agent, AgentDetail, AgentDuty, AgentKind, AgentMessage, AgentMessageMeta, AgentMessageRole, AgentSummary, AgentTask,
} from '@/types/agents';
import { AGENT_KINDS } from '@/types/agents';
import type { CpoName } from '@/types/project';
import type { Actor, ProjectRepository } from '../repository';
import { assertAdmin } from './shared';

/** 글 상한 — 지시·기록은 메모 결이고, 에이전트의 말은 아지트 글 초안처럼 길 수 있다 */
const MAX = { dutyTitle: 60, dutyBody: 4000, taskTitle: 120, taskNote: 1000, said: 6000, agentSaid: 20000 } as const;
/** 화면에 싣는 대화 — 최근 것부터 이만큼. 에이전트가 읽는 것은 lib/agents/brain 이 따로 자른다 */
const THREAD_LIMIT = 300;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function clip(v: string | null | undefined, max: number, what: string): string {
  const s = (v ?? '').trim();
  if (s.length > max) throw new Error(`${what}은(는) ${max}자까지입니다.`);
  return s;
}

function agentOf(r: typeof agents.$inferSelect): Agent {
  const kind = (AGENT_KINDS as readonly string[]).includes(r.kind) ? (r.kind as AgentKind) : 'operator';
  return { id: r.id, kind, cpo: (r.cpo as CpoName | null) ?? null, name: r.name };
}

async function agentRow(id: string): Promise<Agent> {
  const [row] = await getDb().select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) throw new Error('담당을 찾을 수 없습니다.');
  return agentOf(row);
}

function messageOf(r: typeof agentMessages.$inferSelect): AgentMessage {
  return {
    id: r.id,
    role: (['user', 'note', 'agent'].includes(r.role) ? r.role : 'note') as AgentMessageRole,
    author: r.author,
    body: r.body,
    at: stampOf(r.at),
    meta: r.meta ?? null,
  };
}

/** 열린 것이 위 — 기한 이른 순(기한 없는 것은 그 뒤), 끝낸 것은 아래 — 최근 끝낸 순 */
function taskOrder(a: AgentTask, b: AgentTask): number {
  if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1;
  if (a.doneAt && b.doneAt) return b.doneAt.localeCompare(a.doneAt);
  if (a.due !== b.due) return (a.due ?? '9999').localeCompare(b.due ?? '9999');
  return a.createdAt.localeCompare(b.createdAt);
}

export const agentStore: Pick<
  ProjectRepository,
  | 'listAgents' | 'getAgent' | 'saveAgentDuty' | 'deleteAgentDuty'
  | 'addAgentTask' | 'setAgentTaskDone' | 'deleteAgentTask' | 'addAgentMessage'
> = {
  async listAgents(actor): Promise<AgentSummary[]> {
    assertAdmin(actor, '에이전트');
    const db = getDb();
    const now = today();
    const [rows, duties, tasks, lasts] = await allSlots([
      () => db.select().from(agents).orderBy(asc(agents.sort)),
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
    ] as const);
    const dutyOf = new Map(duties.map((d) => [d.agentId, d.n]));
    const taskOf = new Map(tasks.map((t) => [t.agentId, t]));
    const lastOf = new Map(lasts.map((m) => [m.agentId, m]));
    return rows.map((r) => {
      const last = lastOf.get(r.id);
      return {
        ...agentOf(r),
        duties: dutyOf.get(r.id) ?? 0,
        openTasks: taskOf.get(r.id)?.open ?? 0,
        lateTasks: taskOf.get(r.id)?.late ?? 0,
        last: last
          ? {
            role: (['user', 'note', 'agent'].includes(last.role) ? last.role : 'note') as AgentMessageRole,
            at: stampOf(last.at),
            line: last.body.replace(/\s+/g, ' ').trim().slice(0, 80),
          }
          : null,
      };
    });
  },

  async getAgent(id, actor): Promise<AgentDetail> {
    assertAdmin(actor, '에이전트');
    const agent = await agentRow(id);
    const db = getDb();
    const [duties, tasks, said] = await allSlots([
      () => db.select().from(agentDuties).where(eq(agentDuties.agentId, id))
        .orderBy(asc(agentDuties.sort), asc(agentDuties.createdAt)),
      () => db.select({ t: agentTasks, projectName: projects.name })
        .from(agentTasks).leftJoin(projects, eq(projects.id, agentTasks.projectId))
        .where(eq(agentTasks.agentId, id)),
      () => db.select().from(agentMessages).where(eq(agentMessages.agentId, id))
        .orderBy(desc(agentMessages.at)).limit(THREAD_LIMIT),
    ] as const);
    return {
      agent,
      duties: duties.map((d): AgentDuty => ({
        id: d.id, title: d.title, body: d.body, updatedAt: d.updatedAt ? stampOf(d.updatedAt) : null,
      })),
      tasks: tasks.map(({ t, projectName }): AgentTask => ({
        id: t.id,
        title: t.title,
        note: t.note,
        projectId: t.projectId,
        projectName: projectName ?? null,
        due: t.due,
        doneAt: t.doneAt ? stampOf(t.doneAt) : null,
        author: t.author,
        byAgent: t.author === agent.name,
        createdAt: stampOf(t.createdAt),
      })).sort(taskOrder),
      messages: said.reverse().map(messageOf),
    };
  },

  async saveAgentDuty(input, actor): Promise<string> {
    assertAdmin(actor, '업무 정의');
    const agent = await agentRow(input.agentId);
    const title = clip(input.title, MAX.dutyTitle, '업무 이름');
    if (!title) throw new Error('업무 이름을 적어주세요.');
    const body = clip(input.body, MAX.dutyBody, '업무 정의');
    const db = getDb();

    if (input.id) {
      const [old] = await db.select().from(agentDuties)
        .where(and(eq(agentDuties.id, input.id), eq(agentDuties.agentId, agent.id))).limit(1);
      if (!old) throw new Error('업무 정의를 찾을 수 없습니다.');
      await db.transaction(async (tx) => {
        await tx.update(agentDuties).set({ title, body, updatedAt: new Date() }).where(eq(agentDuties.id, old.id));
        await writeAudit(tx, {
          projectId: null, actor, action: '에이전트 업무 정의 수정', field: agent.name,
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
        projectId: null, actor, action: '에이전트 업무 정의', field: agent.name,
        oldValue: null, newValue: `${title} — ${body}`.slice(0, 2000),
      });
    });
    return id;
  },

  async deleteAgentDuty(input, actor): Promise<void> {
    assertAdmin(actor, '업무 정의');
    const agent = await agentRow(input.agentId);
    const db = getDb();
    const [old] = await db.select().from(agentDuties)
      .where(and(eq(agentDuties.id, input.id), eq(agentDuties.agentId, agent.id))).limit(1);
    if (!old) throw new Error('업무 정의를 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx.delete(agentDuties).where(eq(agentDuties.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 업무 정의 삭제', field: agent.name,
        oldValue: `${old.title} — ${old.body}`.slice(0, 2000), newValue: null,
      });
    });
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
        projectId, actor, action: input.byAgent ? '에이전트 할 일 (에이전트가 적음)' : '에이전트 할 일', field: agent.name,
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
        field: agent.name, oldValue: old.title, newValue: input.done ? '끝냄' : '열림',
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
        projectId: old.projectId, actor, action: '에이전트 할 일 삭제', field: agent.name,
        oldValue: [old.title, old.note].filter(Boolean).join(' · ').slice(0, 2000), newValue: null,
      });
    });
  },

  async addAgentMessage(input, actor): Promise<AgentMessage> {
    assertAdmin(actor, '에이전트 대화');
    const agent = await agentRow(input.agentId);
    const fromAgent = input.role === 'agent';
    const body = clip(input.body, fromAgent ? MAX.agentSaid : MAX.said, '글');
    if (!body) throw new Error('내용을 적어주세요.');
    const id = crypto.randomUUID();
    const author = fromAgent ? agent.name : actor.name;
    const meta: AgentMessageMeta | null = fromAgent ? input.meta ?? null : null;
    const db = getDb();
    const [row] = await db.transaction(async (tx) => {
      const inserted = await tx.insert(agentMessages)
        .values({ id, agentId: agent.id, role: input.role, author, authorId: fromAgent ? null : actor.id, body, meta })
        .returning();
      await writeAudit(tx, {
        projectId: null, actor,
        action: input.role === 'user' ? '에이전트 지시' : input.role === 'note' ? '에이전트 기록' : '에이전트 답',
        field: agent.name, oldValue: null, newValue: body.slice(0, 200),
      });
      return inserted;
    });
    return messageOf(row);
  },
};

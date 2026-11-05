/**
 * AI에이전트의 팀 — 팀장(전략·기획)과 실무자(운영사 · 사업자 담당과 정산) (한백 2026-11-04 「결국엔 전략 및 기획담당이 팀장이고
 * 그 운영사/사업자 담당자는 실무자들이야 … 상호보완구조여야해. 이건 전기차, 태양광 둘 다 같아」, migrations/0120).
 *
 * 둘이 서로 채운다 —
 *   아래로  팀 목표 · 방향(agent_directions) — 팀장이 세우고 그 사업의 실무자 모두가 부를 때마다 읽는다(lib/agents/team). 한백이
 *          화면에서 적거나 팀장이 대화 중에 올린다(lib/agents/brain save_direction — 적은 쪽에 팀장 이름, 감사기록에 꼬리 BY_AGENT)
 *   위로    실무자가 한백과 나눈 것(agentTeamLog) — ★저장하지 않는다★. 팀장을 부를 때 실무자의 대화 · 할 일 · 업무 정의를 그때 읽는다
 *          (에이전트가 보는 콘솔 자료와 같은 원칙 — 두 벌이면 갈린다)
 *
 * ★한백 관리자만★ — 에이전트의 다른 쓰기와 같은 문(assertAdmin). 목표 · 방향의 감사기록 열쇠는 팀장의 것이라(agentAuditKey) 팀장의
 * 주간 기록에 바뀐 일이 선다(store/agents eventOf).
 */
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { agentDirections, agentDuties, agentFiles, agentMessages, agents, agentTasks, projects } from '@/lib/db/schema';
import { stampOf, today } from '@/lib/date';
import { shiftDay } from '@/lib/agents/weeks';
import type { Biz } from '@/lib/biz';
import type { AgentDirection, AgentDuty, AgentFile, AgentTeam, TeamMemberLog } from '@/types/agents';
import { agentAuditKey, isLead } from '@/types/agents';
import { allSlots } from '../db-slot';
import type { ProjectRepository } from '../repository';
import { assertAdmin } from './shared';
import {
  agentOf, agentRow, BY_AGENT, clip, DIRECTION_ACTION, fileOf, kstStart, messageOf, taskOf, taskOrder,
} from './agents';

/** 글 상한 — 업무 정의와 같다(이름 한 줄 · 내용은 OKR 처럼 길 수 있다) */
const MAX = { title: 60, body: 4000 } as const;
/** 팀장이 실무자 기록을 읽는 날수 상한 — team_history 가 넉넉히 물어도 석 달까지 */
const MAX_DAYS = 90;
/** 실무자 한 사람에게서 읽는 말의 상한 */
const MAX_PER_MEMBER = 200;
/** 팀원에게 남기는 말의 글 상한 — 한백의 지시와 같은 결이다 */
const PEER_MAX = 4000;
/** 팀원의 말 감사기록 — 받은 담당의 열쇠로 남는다 */
export const PEER_ACTION = '에이전트 팀원 말';

function directionOf(r: typeof agentDirections.$inferSelect, leadName: string): AgentDirection {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    author: r.author,
    byAgent: r.author === leadName,
    updatedAt: r.updatedAt ? stampOf(r.updatedAt) : null,
    createdAt: stampOf(r.createdAt),
  };
}

/** 팀장인가 — 목표 · 방향은 팀장의 것이다 */
async function leadRow(id: string) {
  const lead = await agentRow(id);
  if (!isLead(lead.kind)) throw new Error('목표 · 방향은 팀장(전략·기획 담당)이 세웁니다.');
  return lead;
}

const dirAudit = (title: string, body: string) => `${title} — ${body}`.slice(0, 2000);

export const agentTeamStore: Pick<
  ProjectRepository, 'agentTeam' | 'saveAgentDirection' | 'deleteAgentDirection' | 'agentTeamLog' | 'tellAgent'
> = {
  /** 사업 하나의 팀 — 팀장 · 실무자(조직 순서) · 팀장이 세운 목표 · 방향 */
  async agentTeam(actor, biz: Biz): Promise<AgentTeam> {
    assertAdmin(actor, '에이전트');
    const db = getDb();
    const rows = await db.select().from(agents).where(eq(agents.biz, biz)).orderBy(asc(agents.sort));
    const all = rows.map(agentOf);
    const lead = all.find((a) => isLead(a.kind)) ?? null;
    const members = all.filter((a) => a !== lead);
    const directions = lead
      ? await db.select().from(agentDirections).where(eq(agentDirections.agentId, lead.id))
        .orderBy(asc(agentDirections.sort), asc(agentDirections.createdAt))
      : [];
    return { lead, members, directions: directions.map((d) => directionOf(d, lead!.name)) };
  },

  /** 목표 · 방향 넣기 · 고치기 — id 가 있으면 그 줄을 고친다. byAgent 면 적은 쪽에 팀장 이름이 남는다(대화 중 팀장의 도구) */
  async saveAgentDirection(input, actor): Promise<{ id: string; title: string }> {
    assertAdmin(actor, '목표 · 방향');
    const lead = await leadRow(input.leadId);
    const title = clip(input.title, MAX.title, '목표 · 방향의 이름');
    if (!title) throw new Error('목표 · 방향의 이름을 적어주세요.');
    const body = clip(input.body, MAX.body, '목표 · 방향');
    const author = input.byAgent ? lead.name : actor.name;
    const tail = input.byAgent ? BY_AGENT : '';
    const db = getDb();

    if (input.id) {
      const [old] = await db.select().from(agentDirections)
        .where(and(eq(agentDirections.id, input.id), eq(agentDirections.agentId, lead.id))).limit(1);
      if (!old) throw new Error('목표 · 방향을 찾을 수 없습니다.');
      // 바뀐 것이 없으면 할 것이 없다 — 팀장이 같은 줄을 또 올려도 감사기록 · 주간 기록이 두 줄 남지 않게
      if (old.title === title && old.body === body) return { id: old.id, title };
      await db.transaction(async (tx) => {
        await tx.update(agentDirections).set({ title, body, author, updatedAt: new Date() }).where(eq(agentDirections.id, old.id));
        await writeAudit(tx, {
          projectId: null, actor, action: `${DIRECTION_ACTION.edit}${tail}`, field: agentAuditKey(lead),
          oldValue: dirAudit(old.title, old.body), newValue: dirAudit(title, body),
        });
      });
      return { id: old.id, title };
    }

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const [{ top }] = await tx.select({ top: sql<number>`coalesce(max(${agentDirections.sort}), 0)::int` })
        .from(agentDirections).where(eq(agentDirections.agentId, lead.id));
      await tx.insert(agentDirections).values({ id, agentId: lead.id, title, body, author, sort: top + 10 });
      await writeAudit(tx, {
        projectId: null, actor, action: `${DIRECTION_ACTION.add}${tail}`, field: agentAuditKey(lead),
        oldValue: null, newValue: dirAudit(title, body),
      });
    });
    return { id, title };
  },

  /** 목표 · 방향 지우기 — 지운 것은 감사기록에 통째로 남는다(팀장의 주간 기록에서 앞을 본다) */
  async deleteAgentDirection(input, actor): Promise<{ title: string }> {
    assertAdmin(actor, '목표 · 방향');
    const lead = await leadRow(input.leadId);
    const db = getDb();
    const [old] = await db.select().from(agentDirections)
      .where(and(eq(agentDirections.id, input.id), eq(agentDirections.agentId, lead.id))).limit(1);
    if (!old) throw new Error('목표 · 방향을 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx.delete(agentDirections).where(eq(agentDirections.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: `${DIRECTION_ACTION.del}${input.byAgent ? BY_AGENT : ''}`, field: agentAuditKey(lead),
        oldValue: dirAudit(old.title, old.body), newValue: null,
      });
    });
    return { title: old.title };
  },

  /**
   * 팀원이 한백 · 다른 팀원과 나눈 것 — 같은 사업의 담당 모두가 서로 읽는다(한백 2026-11-05 「각 담당자들끼리 서로 정보 공유 필요해」 —
   * 그전에는 팀장만 실무자를 읽었다). 최근 날수(오늘 포함, 한국 달력) 안의 말을 팀원마다 최근 것부터 상한만큼, 열린 할 일 전부와
   * 그 안에 끝낸 할 일, 업무 정의. exclude 는 읽는 담당 자신(자기 대화는 따로 읽는다), memberId 를 주면 그 팀원 하나만(team_history).
   */
  async agentTeamLog(actor, biz: Biz, opts): Promise<TeamMemberLog[]> {
    assertAdmin(actor, '에이전트');
    const days = Math.min(MAX_DAYS, Math.max(1, Math.round(opts.days)));
    const perMember = Math.min(MAX_PER_MEMBER, Math.max(1, Math.round(opts.perMember)));
    const db = getDb();
    const rows = await db.select().from(agents)
      .where(and(
        eq(agents.biz, biz),
        ...(opts.exclude ? [ne(agents.id, opts.exclude)] : []),
        ...(opts.memberId ? [eq(agents.id, opts.memberId)] : []),
      ))
      .orderBy(asc(agents.sort));
    const members = rows.map(agentOf);
    if (members.length === 0) return [];
    const ids = members.map((m) => m.id);
    const from = kstStart(shiftDay(today(), -(days - 1)));

    const [duties, tasks, totals] = await allSlots([
      () => db.select().from(agentDuties).where(inArray(agentDuties.agentId, ids))
        .orderBy(asc(agentDuties.sort), asc(agentDuties.createdAt)),
      () => db.select({ t: agentTasks, projectName: projects.name })
        .from(agentTasks).leftJoin(projects, eq(projects.id, agentTasks.projectId))
        .where(and(inArray(agentTasks.agentId, ids), or(isNull(agentTasks.doneAt), gte(agentTasks.doneAt, from)))),
      () => db.select({ agentId: agentMessages.agentId, n: sql<number>`count(*)::int` })
        .from(agentMessages).where(and(inArray(agentMessages.agentId, ids), gte(agentMessages.at, from)))
        .groupBy(agentMessages.agentId),
    ] as const);
    /* 실무자마다 최근 것부터 상한만큼 — 한 사람이 말이 많아도 다른 사람의 몫을 밀어내지 않게 따로 묻는다 */
    const said = await allSlots(members.map((m) => () => db.select().from(agentMessages)
      .where(and(eq(agentMessages.agentId, m.id), gte(agentMessages.at, from)))
      .orderBy(desc(agentMessages.at)).limit(perMember)));
    const messageIds = said.flat().map((r) => r.id);
    const files = messageIds.length
      ? await db.select().from(agentFiles).where(inArray(agentFiles.messageId, messageIds)).orderBy(asc(agentFiles.at))
      : [];
    const filesOf = new Map<string, AgentFile[]>();
    for (const f of files) filesOf.set(f.messageId, [...(filesOf.get(f.messageId) ?? []), fileOf(f)]);
    const totalOf = new Map(totals.map((t) => [t.agentId, t.n]));

    return members.map((agent, i): TeamMemberLog => ({
      agent,
      duties: duties.filter((d) => d.agentId === agent.id).map((d): AgentDuty => ({
        id: d.id, title: d.title, body: d.body, updatedAt: d.updatedAt ? stampOf(d.updatedAt) : null,
      })),
      tasks: tasks.filter(({ t }) => t.agentId === agent.id)
        .map(({ t, projectName }) => taskOf(t, projectName ?? null, agent.name)).sort(taskOrder),
      messages: said[i].slice().reverse().map((m) => messageOf(m, filesOf.get(m.id) ?? [])),
      total: totalOf.get(agent.id) ?? 0,
    }));
  },
  /**
   * 팀원에게 말을 남긴다(tell_teammate) — 같은 사업의 다른 담당의 대화에 「팀원」의 말(peer)로 선다. 받은 담당을 부르지 않는다 —
   * 다음에 한백이 부를 때 읽는다(types/agents peer). 사업이 다르면 거절한다 — 전기차와 태양광은 나누는 것이 없다(0119).
   */
  async tellAgent(input, actor): Promise<{ id: string; name: string }> {
    assertAdmin(actor, '에이전트');
    const from = await agentRow(input.fromId);
    const to = await agentRow(input.toId);
    if (from.id === to.id) throw new Error('자기 자신에게는 남기지 않는다.');
    if (from.biz !== to.biz) throw new Error(`「${to.name}」은(는) 다른 사업의 담당이다 — 같은 사업의 팀원에게만 남긴다.`);
    const body = clip(input.body, PEER_MAX, '팀원에게 남기는 말');
    if (!body) throw new Error('남길 말이 비었다.');
    const id = crypto.randomUUID();
    await getDb().transaction(async (tx) => {
      await tx.insert(agentMessages).values({
        id, agentId: to.id, role: 'peer', author: from.name, authorId: null, body, meta: { from: { id: from.id, name: from.name } },
      });
      await writeAudit(tx, {
        projectId: null, actor, action: PEER_ACTION, field: agentAuditKey(to), oldValue: null,
        newValue: `${from.name} → ${to.name} · ${body.slice(0, 200)}`,
      });
    });
    return { id: to.id, name: to.name };
  },
};

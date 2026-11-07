/**
 * 담당의 기억 — 최근 대화 · 원문 찾기 · 지난 파일 · 메모장 (한백 2026-11-05 「담당자가 내가 말한 모든 정보를 기억해주길 바래」 →
 * 「모든 대화를 매번 다 읽는건 너무 비효율적」 → 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는 방법」 · migrations/0122).
 *
 * 부를 때 읽는 것은 최근 대화(agentRecent)와 메모(agentMemos)뿐이다. 원문은 담당이 찾을 때(searchAgentMessages) · 지난 파일은 열 때
 * (agentFileOf)만 DB 에서 읽는다 — 대화가 쌓여도 부를 때 읽는 양이 그대로다(lib/agents/memory · memos).
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { agentFiles, agentMemos, agentMessages, agents } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { shiftDay } from '@/lib/agents/weeks';
import { recentStart, REPLY_CLAIM_SECONDS } from '@/lib/agents/memory';
import { MEMO_MAX, MEMOS_PER_OWNER } from '@/lib/agents/memos';
import type { Agent, AgentFile, AgentMemo, AgentMemos, AgentMessage, MemoScope } from '@/types/agents';
import { agentAuditKey } from '@/types/agents';
import { allSlots } from '../db-slot';
import type { ProjectRepository } from '../repository';
import { assertAdmin } from './shared';
import { agentRow, BY_AGENT, clip, fileOf, kstStart, messageOf } from './agents';

/** 메모의 감사기록 — 적은 담당(또는 화면에서 고친 담당 화면)의 열쇠로 남는다 */
export const MEMO_ACTION = { add: '에이전트 메모', edit: '에이전트 메모 수정', del: '에이전트 메모 삭제' } as const;

/** LIKE 의 특수 글자를 글자 그대로 */
const likeOf = (term: string) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function withFiles(rows: Array<typeof agentMessages.$inferSelect>): Promise<AgentMessage[]> {
  if (rows.length === 0) return [];
  const files = await getDb().select().from(agentFiles)
    .where(inArray(agentFiles.messageId, rows.map((r) => r.id))).orderBy(asc(agentFiles.at));
  const filesOf = new Map<string, AgentFile[]>();
  for (const f of files) filesOf.set(f.messageId, [...(filesOf.get(f.messageId) ?? []), fileOf(f)]);
  return rows.map((m) => messageOf(m, filesOf.get(m.id) ?? []));
}

function memoOf(r: typeof agentMemos.$inferSelect): AgentMemo {
  return {
    id: r.id,
    scope: r.agentId ? 'mine' : 'team',
    title: r.title,
    body: r.body,
    author: r.author,
    byAgent: r.byAgent,
    updatedAt: r.updatedAt ? stampOf(r.updatedAt) : null,
    createdAt: stampOf(r.createdAt),
  };
}

/** 그 담당 · 그 범위의 메모를 고르는 조건 — 내 메모는 그 담당의 것, 팀 공용은 그 사업의 담당 없는 것 */
const ownerOf = (agent: Agent, scope: MemoScope): SQL =>
  scope === 'mine' ? eq(agentMemos.agentId, agent.id) : and(isNull(agentMemos.agentId), eq(agentMemos.biz, agent.biz))!;

/** 감사기록의 새 값 — 팀 공용이면 머리에 붙인다 */
const memoAudit = (scope: MemoScope, title: string, body: string) =>
  `${scope === 'team' ? '[팀 공용] ' : ''}${title} — ${body}`.slice(0, 2000);

export const agentMemoryStore: Pick<
  ProjectRepository,
  | 'agentRecent' | 'searchAgentMessages' | 'agentFileOf' | 'agentMemos' | 'saveAgentMemo' | 'deleteAgentMemo'
  | 'claimAgentReply' | 'releaseAgentReply'
> = {
  /**
   * 답 차례 잡기 — 표지가 비었거나 오래된 줄만 한 문장으로 바꾼다(동시에 둘이 와도 하나만 잡는다). 감사기록은 남기지 않는다 —
   * 잠깐 쥐는 자물쇠고, 남는 일(답)은 addAgentMessage 가 남긴다.
   */
  async claimAgentReply(agentId, actor): Promise<string | null> {
    assertAdmin(actor, '에이전트');
    const stamp = new Date();
    const got = await getDb().update(agents).set({ replyingAt: stamp })
      .where(and(
        eq(agents.id, agentId),
        or(isNull(agents.replyingAt), lt(agents.replyingAt, sql`now() - make_interval(secs => ${REPLY_CLAIM_SECONDS})`)),
      ))
      .returning({ id: agents.id });
    return got.length ? stamp.toISOString() : null;
  },

  async releaseAgentReply(agentId, claim, actor): Promise<void> {
    assertAdmin(actor, '에이전트');
    await getDb().update(agents).set({ replyingAt: null })
      .where(and(eq(agents.id, agentId), eq(agents.replyingAt, new Date(claim))));
  },

  /**
   * 최근 대화 — 시작이 20개씩 움직이는 20~39개(lib/agents/memory recentStart), 오래된 것부터. 맨 앞에 걸린 답은 뺀다(모델 대화의
   * 맨 앞은 사람 쪽 말이어야 한다 — 뺀 답도 원문 찾기로 찾는다).
   */
  async agentRecent(id, actor): Promise<AgentMessage[]> {
    assertAdmin(actor, '에이전트');
    const db = getDb();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(agentMessages).where(eq(agentMessages.agentId, id));
    const rows = await db.select().from(agentMessages).where(eq(agentMessages.agentId, id))
      .orderBy(asc(agentMessages.at), asc(agentMessages.id)).offset(recentStart(n));
    let start = 0;
    while (start < rows.length && rows[start].role === 'agent') start++;
    return withFiles(rows.slice(start));
  },

  /**
   * 대화 원문 찾기(search_history · team_history 의 query) — 낱말은 모두 들어 있어야 하고(글 · 쓴 사람 · 넘긴 파일 이름 중 어디든),
   * 날짜는 그날 포함(한국 달력). 맞은 것을 최근 것부터 limit 개, 맞은 전체 수와 함께.
   */
  async searchAgentMessages(id, actor, q, limit = 20): Promise<{ hits: AgentMessage[]; total: number }> {
    assertAdmin(actor, '에이전트');
    const db = getDb();
    const where = and(
      eq(agentMessages.agentId, id),
      ...q.terms.map((t) => or(
        ilike(agentMessages.body, likeOf(t)),
        ilike(agentMessages.author, likeOf(t)),
        sql`exists (select 1 from agent_files f where f.message_id = ${agentMessages.id} and f.name ilike ${likeOf(t)})`,
      )!),
      ...(q.from ? [gte(agentMessages.at, kstStart(q.from))] : []),
      ...(q.to ? [lt(agentMessages.at, kstStart(shiftDay(q.to, 1)))] : []),
    );
    const [rows, [{ n }]] = await allSlots([
      () => db.select().from(agentMessages).where(where).orderBy(desc(agentMessages.at)).limit(limit),
      () => db.select({ n: sql<number>`count(*)::int` }).from(agentMessages).where(where),
    ] as const);
    return { hits: await withFiles(rows), total: n };
  },

  /** 이 담당에게 넘긴 파일 하나(read_file) — 다른 담당의 파일이면 null */
  async agentFileOf(agentId, fileId, actor): Promise<AgentFile | null> {
    assertAdmin(actor, '에이전트');
    const [row] = await getDb().select().from(agentFiles)
      .where(and(eq(agentFiles.id, fileId), eq(agentFiles.agentId, agentId))).limit(1);
    return row ? fileOf(row) : null;
  },

  /** 담당 하나가 읽는 메모 — 자기 메모와 그 사업의 팀 공용 메모, 각각 최근에 고친 것부터 */
  async agentMemos(actor, agentId): Promise<AgentMemos> {
    assertAdmin(actor, '에이전트');
    const agent = await agentRow(agentId);
    const recent = desc(sql`coalesce(${agentMemos.updatedAt}, ${agentMemos.createdAt})`);
    const [mine, team] = await allSlots([
      () => getDb().select().from(agentMemos).where(ownerOf(agent, 'mine')).orderBy(recent),
      () => getDb().select().from(agentMemos).where(ownerOf(agent, 'team')).orderBy(recent),
    ] as const);
    return { mine: mine.map(memoOf), team: team.map(memoOf) };
  },

  /**
   * 메모 넣기 · 고치기 · 덧붙이기 — id 가 없으면 새로(이름 필수), 있으면 그 메모를 고친다(append 면 내용 끝에 줄을 덧붙인다).
   * byAgent 면 적은 쪽에 담당 이름(대화 중 save_memo), 아니면 한백 화면에서 고친 사람. 같은 것으로 고치면 아무것도 안 한다.
   */
  async saveAgentMemo(input, actor): Promise<{ id: string; title: string }> {
    assertAdmin(actor, '메모');
    const agent = await agentRow(input.agentId);
    const db = getDb();
    const author = input.byAgent ? agent.name : actor.name;
    const tail = input.byAgent ? BY_AGENT : '';
    const key = agentAuditKey(agent);

    if (input.id) {
      const [old] = await db.select().from(agentMemos)
        .where(and(eq(agentMemos.id, input.id), ownerOf(agent, input.scope))).limit(1);
      if (!old) throw new Error('메모를 찾을 수 없습니다.');
      const title = input.title === undefined ? old.title : clip(input.title, MEMO_MAX.title, '메모 이름');
      if (!title) throw new Error('메모 이름을 적어주세요.');
      const add = (input.body ?? '').trim();
      const body = input.append
        ? clip(add ? (old.body.trim() ? `${old.body.trim()}\n${add}` : add) : old.body, MEMO_MAX.body, '메모 내용')
        : clip(input.body ?? old.body, MEMO_MAX.body, '메모 내용');
      if (title === old.title && body === old.body) return { id: old.id, title };
      await db.transaction(async (tx) => {
        await tx.update(agentMemos).set({ title, body, author, byAgent: Boolean(input.byAgent), updatedAt: new Date() })
          .where(eq(agentMemos.id, old.id));
        await writeAudit(tx, {
          projectId: null, actor, action: `${MEMO_ACTION.edit}${tail}`, field: key,
          oldValue: memoAudit(input.scope, old.title, old.body), newValue: memoAudit(input.scope, title, body),
        });
      });
      return { id: old.id, title };
    }

    const title = clip(input.title, MEMO_MAX.title, '메모 이름');
    if (!title) throw new Error('메모 이름을 적어주세요.');
    const body = clip(input.body, MEMO_MAX.body, '메모 내용');
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(agentMemos).where(ownerOf(agent, input.scope));
      if (n >= MEMOS_PER_OWNER) {
        throw new Error(`메모가 ${MEMOS_PER_OWNER}장이다 — 같은 주제끼리 합치거나 지난 것을 지운 뒤 적는다.`);
      }
      await tx.insert(agentMemos).values({
        id, biz: agent.biz, agentId: input.scope === 'mine' ? agent.id : null, title, body, author, byAgent: Boolean(input.byAgent),
      });
      await writeAudit(tx, {
        projectId: null, actor, action: `${MEMO_ACTION.add}${tail}`, field: key,
        oldValue: null, newValue: memoAudit(input.scope, title, body),
      });
    });
    return { id, title };
  },

  /** 메모 지우기 — 지운 것은 감사기록에 통째로 남는다 */
  async deleteAgentMemo(input, actor): Promise<{ title: string }> {
    assertAdmin(actor, '메모');
    const agent = await agentRow(input.agentId);
    const db = getDb();
    const [old] = await db.select().from(agentMemos)
      .where(and(eq(agentMemos.id, input.id), ownerOf(agent, input.scope))).limit(1);
    if (!old) throw new Error('메모를 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await tx.delete(agentMemos).where(eq(agentMemos.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: `${MEMO_ACTION.del}${input.byAgent ? BY_AGENT : ''}`, field: agentAuditKey(agent),
        oldValue: memoAudit(input.scope, old.title, old.body), newValue: null,
      });
    });
    return { title: old.title };
  },
};

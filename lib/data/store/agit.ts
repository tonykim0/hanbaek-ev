/**
 * 아지트 열린구매 글 저장소 (migrations/0126) — 웹훅 연결 한 줄(과 요청 담당자)과 글(초안 · 올림).
 * (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — 글을 짓는 것은 lib/agit/post)
 *
 * ★정산 담당이 초안을 올리고 한백이 승인하면 올린다★(한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면
 * 정산담당에이전트가 아지트에 글을 올리는 구조」 — 메일 초안과 같은 길). 초안은 결제일마다 하나다: 다시 지으면(크론 · 담당의 agit_post ·
 * 승인 때 금액이 바뀌었을 때) 같은 줄을 지금 글로 고친다. 이미 올린 결제일은 again 으로만 새 초안이 선다.
 *
 * ★웹훅 주소가 곧 열쇠다★ — 그 주소만 있으면 누구든 그 그룹에 글을 쓴다. 그래서 잠가 두고(lib/agents/secret-box — 메일 앱 비밀번호와
 * 같은 열쇠) 화면 · 응답 · 감사기록에 싣지 않는다. 풀어 쓰는 것은 올리는 그 순간(agitHookFor)뿐이다.
 *
 * ★요청 담당자는 한 번 정해 둔다★(한백 2026-11-08 「아지트 글에서 담당자 설정도 필요해」 → 요청 글 담당자 칸 · 한 번 정해 두기) —
 * 아지트 ID 배열(assignees). ★연결과 따로다★(같은 날 「담당자는 미리 넣어둘수없나」) — 같은 줄에 두되 연결 전에도 넣고(token 이 빈 줄),
 * 끊기는 주소만 비운다. 올린 글에는 그때 붙인 사람을 같이 남긴다.
 *
 * ★두 번 올리지 않는다★ — 올리기는 두 걸음이다(메일과 같은 모양): claimAgitPost 가 결제일 잠금 안에서 초안을 「올리는 중」으로 세우고,
 * 라우트가 아지트에 보낸 뒤 finishAgitPost 가 결과를 적는다. 그 사이에 또 누르면 「올리는 중」에 걸린다.
 *
 * 올리면 정산 담당의 그 결제일 「열린구매 상신」 할 일이 끝나고(lib/agents/open-purchase 의 열쇠 — agent_tasks.kind) 그 대화에 자동의
 * 한 줄이 남는다 — 담당이 다음에 불릴 때 올렸다는 것을 안다.
 */
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { agentMessages, agents, agentTasks, agitHooks, agitPosts } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { getSecret } from '@/lib/auth/secret';
import { seal, unseal } from '@/lib/agents/secret-box';
import { OPEN_PURCHASE_AGENT, openPurchaseKey } from '@/lib/agents/open-purchase';
import { agentAuditKey, type AgentMessageMeta } from '@/types/agents';
import {
  AGIT_MAX_ASSIGNEES, AGIT_POST_STATUSES, agitAssigneesOf, agitPostedSay, agitTitleOf, agitWebhookOf, badAgitIds,
  type AgitHookInfo, type AgitPostRecord, type AgitPostStatus,
} from '@/lib/agit/post';
import type { ProjectRepository } from '../repository';
import { assertAdmin, assertHanbaek } from './shared';

const HOOK_ID = 'agit';
/** 감사기록의 칸 이름 */
const AUDIT_FIELD = '아지트';
/** 「올리는 중」이 이보다 오래면 멈춘 것으로 본다(보내기는 10초 안에 끝난다 — lib/agit/send) */
const SENDING_STALE_MS = 2 * 60_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 승인을 기다리는 줄 — 초안과 못 올린 것(다시 승인한다) */
const OPEN: AgitPostStatus[] = ['draft', 'failed'];

type Row = typeof agitPosts.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

const statusOf = (v: string): AgitPostStatus =>
  (AGIT_POST_STATUSES as readonly string[]).includes(v) ? (v as AgitPostStatus) : 'failed';

function recordOf(row: Row): AgitPostRecord {
  return {
    id: row.id,
    payDate: row.payDate,
    status: statusOf(row.status),
    title: agitTitleOf(row.body),
    body: row.body,
    total: row.total,
    batches: row.batches,
    error: row.error,
    postedBy: row.postedBy,
    assignees: row.assignees ?? [],
    messageId: row.messageId,
    again: row.again,
    agitUrl: row.agitUrl,
    createdAt: stampOf(row.createdAt),
    at: stampOf(row.status === 'draft' ? row.createdAt : row.postedAt ?? row.createdAt),
  };
}

const hookInfoOf = (row: typeof agitHooks.$inferSelect | undefined): AgitHookInfo => {
  const connected = Boolean(row?.token);
  return {
    connected,
    connectedBy: connected ? row?.connectedBy ?? null : null,
    connectedAt: connected && row?.connectedAt ? stampOf(row.connectedAt) : null,
    assignees: row?.assignees ?? [],
  };
};

/** 결제일 하나를 잠근다 — 초안 짓기 · 올리기가 같은 결제일에서 줄을 서게 */
const lockPayDate = (tx: Tx, payDate: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`hb_agit:${payDate}`}))`);

/** 같은 결제일을 지금 올리는 중인 줄(멈춘 것은 빼고) */
async function sendingOf(tx: Tx, payDate: string, except?: string): Promise<Row | undefined> {
  const fresh = new Date(Date.now() - SENDING_STALE_MS);
  const rows = await tx.select().from(agitPosts).where(and(
    eq(agitPosts.payDate, payDate), eq(agitPosts.status, 'sending'), gt(agitPosts.postedAt, fresh),
  ));
  return rows.find((r) => r.id !== except);
}

export const agitStore: Pick<
  ProjectRepository,
  | 'getAgitHook' | 'saveAgitHook' | 'saveAgitAssignees' | 'deleteAgitHook' | 'agitHookFor'
  | 'listAgitPosts' | 'getAgitPost' | 'draftAgitPost' | 'linkAgitPosts' | 'claimAgitPost' | 'finishAgitPost'
> = {
  async getAgitHook(actor): Promise<AgitHookInfo> {
    assertHanbaek(actor, '아지트 연결');
    const [row] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, HOOK_ID)).limit(1);
    return hookInfoOf(row);
  },

  async saveAgitHook(input, actor): Promise<AgitHookInfo> {
    assertAdmin(actor, '아지트 연결');
    const url = agitWebhookOf(input.url);
    if (!url) throw new Error('아지트 웹훅 주소가 아닙니다 — https://agit.io/webhook/… 를 그대로 붙여 넣어 주세요.');
    const token = seal(url, getSecret());
    await getDb().transaction(async (tx) => {
      const [old] = await tx.select({ token: agitHooks.token }).from(agitHooks).where(eq(agitHooks.id, HOOK_ID)).for('update');
      const at = new Date();
      await tx.insert(agitHooks).values({ id: HOOK_ID, token, connectedBy: actor.name, connectedAt: at })
        .onConflictDoUpdate({ target: agitHooks.id, set: { token, connectedBy: actor.name, connectedAt: at } });
      /* 주소는 적지 않는다 — 감사기록을 읽는 사람이 그 그룹에 글을 쓸 수 있게 된다 */
      await writeAudit(tx, {
        projectId: null, actor, action: '아지트 연결', field: AUDIT_FIELD, oldValue: old?.token ? '연결됨' : null, newValue: '웹훅 연결',
      });
    });
    return agitStore.getAgitHook(actor);
  },

  async saveAgitAssignees(input, actor): Promise<AgitHookInfo> {
    assertAdmin(actor, '아지트 담당자');
    const assignees = agitAssigneesOf(input.assignees);
    if (!assignees) {
      const bad = badAgitIds(input.assignees);
      throw new Error(bad.length
        ? `아지트 ID 가 아닙니다 — ${bad.slice(0, 3).join(', ')} (영문 · 숫자 · 점, 20자까지)`
        : `담당자는 ${AGIT_MAX_ASSIGNEES}명까지입니다.`);
    }
    await getDb().transaction(async (tx) => {
      const [old] = await tx.select({ assignees: agitHooks.assignees }).from(agitHooks).where(eq(agitHooks.id, HOOK_ID)).for('update');
      /* 연결 전이면 담당자만 든 줄을 세운다(주소 칸은 빈 채) */
      await tx.insert(agitHooks).values({ id: HOOK_ID, assignees })
        .onConflictDoUpdate({ target: agitHooks.id, set: { assignees } });
      await writeAudit(tx, {
        projectId: null, actor, action: '아지트 담당자', field: AUDIT_FIELD,
        oldValue: old?.assignees?.length ? old.assignees.join(', ') : null, newValue: assignees.length ? assignees.join(', ') : null,
      });
    });
    return agitStore.getAgitHook(actor);
  },

  async deleteAgitHook(actor): Promise<boolean> {
    assertAdmin(actor, '아지트 연결');
    return getDb().transaction(async (tx) => {
      /* 주소만 비운다 — 요청 담당은 남는다(다시 연결하면 그대로 쓴다) */
      const gone = await tx.update(agitHooks).set({ token: null, connectedBy: null, connectedAt: null })
        .where(and(eq(agitHooks.id, HOOK_ID), isNotNull(agitHooks.token))).returning({ id: agitHooks.id });
      if (!gone.length) return false;
      await writeAudit(tx, { projectId: null, actor, action: '아지트 연결 끊음', field: AUDIT_FIELD, oldValue: '연결됨', newValue: null });
      return true;
    });
  },

  async agitHookFor(actor): Promise<{ url: string; assignees: string[] }> {
    assertAdmin(actor, '아지트 올리기');
    const [row] = await getDb().select({ token: agitHooks.token, assignees: agitHooks.assignees }).from(agitHooks)
      .where(eq(agitHooks.id, HOOK_ID)).limit(1);
    if (!row?.token) throw new Error('아지트 미연결 — 정산 담당 화면의 「아지트 연결」에서 웹훅 주소를 넣어 주세요.');
    const url = unseal(row.token, getSecret());
    if (!url) throw new Error('아지트 연결을 풀 수 없습니다(서버 열쇠가 바뀜) — 다시 연결해 주세요.');
    return { url, assignees: row.assignees ?? [] };
  },

  async listAgitPosts(actor, messageIds): Promise<AgitPostRecord[]> {
    assertHanbaek(actor, '아지트 글');
    if (messageIds.length === 0) return [];
    const rows = await getDb().select().from(agitPosts)
      .where(inArray(agitPosts.messageId, messageIds)).orderBy(asc(agitPosts.createdAt));
    return rows.map(recordOf);
  },

  async getAgitPost(actor, id): Promise<AgitPostRecord | null> {
    assertHanbaek(actor, '아지트 글');
    const [row] = await getDb().select().from(agitPosts).where(eq(agitPosts.id, id)).limit(1);
    return row ? recordOf(row) : null;
  },

  async draftAgitPost(input, actor) {
    assertAdmin(actor, '아지트 글 초안');
    if (!DAY_RE.test(input.payDate)) throw new Error('결제일은 YYYY-MM-DD 로 적어주세요.');
    if (!input.body.trim()) throw new Error('올릴 글이 비었습니다.');
    const db = getDb();
    const { id, plan } = await db.transaction(async (tx) => {
      await lockPayDate(tx, input.payDate);
      if (await sendingOf(tx, input.payDate)) throw new Error('이 결제일 글을 올리는 중입니다 — 잠시 뒤 다시 보세요.');
      const title = agitTitleOf(input.body);
      const [open] = await tx.select().from(agitPosts)
        .where(and(eq(agitPosts.payDate, input.payDate), inArray(agitPosts.status, OPEN)))
        .orderBy(desc(agitPosts.createdAt)).limit(1);
      if (open) {
        const changed = open.body !== input.body;
        const moved = input.messageId !== null && input.messageId !== open.messageId;
        if (!changed && !moved) return { id: open.id, plan: 'keep' as const };
        await tx.update(agitPosts).set({
          body: input.body, total: input.total, batches: input.batches,
          ...(changed ? { status: 'draft', error: null } : {}),
          ...(moved ? { messageId: input.messageId } : {}),
        }).where(eq(agitPosts.id, open.id));
        if (changed) {
          await writeAudit(tx, { projectId: null, actor, action: '아지트 글 초안 고침', field: AUDIT_FIELD, oldValue: agitTitleOf(open.body), newValue: title });
        }
        return { id: open.id, plan: 'refresh' as const };
      }
      const [posted] = await tx.select().from(agitPosts)
        .where(and(eq(agitPosts.payDate, input.payDate), eq(agitPosts.status, 'posted')))
        .orderBy(desc(agitPosts.postedAt)).limit(1);
      if (posted && !input.again) {
        throw new Error(`이미 아지트에 올린 결제일입니다(${stampOf(posted.postedAt ?? posted.createdAt)} · 승인 ${posted.postedBy}) — `
          + '다시 올리려면 다시 올리라고 말해 주세요.');
      }
      const newId = crypto.randomUUID();
      await tx.insert(agitPosts).values({
        id: newId, payDate: input.payDate, status: 'draft', body: input.body, total: input.total, batches: input.batches,
        messageId: input.messageId, again: Boolean(posted), postedBy: actor.name,
      });
      await writeAudit(tx, { projectId: null, actor, action: '아지트 글 초안', field: AUDIT_FIELD, oldValue: null, newValue: title });
      return { id: newId, plan: 'create' as const };
    });
    const [row] = await db.select().from(agitPosts).where(eq(agitPosts.id, id)).limit(1);
    if (!row) throw new Error('초안을 찾을 수 없습니다.');
    return { post: recordOf(row), plan };
  },

  async linkAgitPosts(input, actor): Promise<void> {
    assertAdmin(actor, '아지트 글 초안');
    if (input.ids.length === 0) return;
    await getDb().update(agitPosts).set({ messageId: input.messageId }).where(inArray(agitPosts.id, input.ids));
  },

  async claimAgitPost(input, actor): Promise<AgitPostRecord> {
    assertAdmin(actor, '아지트 올리기');
    if (!input.body.trim()) throw new Error('올릴 글이 비었습니다.');
    const db = getDb();
    const [first] = await db.select({ payDate: agitPosts.payDate }).from(agitPosts).where(eq(agitPosts.id, input.id)).limit(1);
    if (!first) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
    await db.transaction(async (tx) => {
      await lockPayDate(tx, first.payDate);
      const [row] = await tx.select().from(agitPosts).where(eq(agitPosts.id, input.id)).for('update');
      if (!row) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
      const stale = row.status === 'sending' && (!row.postedAt || row.postedAt.getTime() < Date.now() - SENDING_STALE_MS);
      if (row.status === 'posted') throw new Error('이미 아지트에 올린 글입니다.');
      if (row.status === 'sending' && !stale) throw new Error('이 글을 올리는 중입니다 — 잠시 뒤 다시 보세요.');
      if (await sendingOf(tx, row.payDate, row.id)) throw new Error('이 결제일 글을 올리는 중입니다 — 잠시 뒤 다시 보세요.');
      if (!row.again) {
        const [posted] = await tx.select({ id: agitPosts.id }).from(agitPosts)
          .where(and(eq(agitPosts.payDate, row.payDate), eq(agitPosts.status, 'posted'))).limit(1);
        if (posted) throw new Error('이미 아지트에 올린 결제일입니다 — 다시 올리려면 정산 담당에게 다시 올리라고 말해 주세요.');
      }
      await tx.update(agitPosts).set({
        status: 'sending', body: input.body, total: input.total, batches: input.batches, assignees: input.assignees,
        error: null, postedBy: actor.name, postedAt: new Date(),
      }).where(eq(agitPosts.id, row.id));
    });
    const [row] = await db.select().from(agitPosts).where(eq(agitPosts.id, input.id)).limit(1);
    if (!row) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
    return recordOf(row);
  },

  async finishAgitPost(input, actor): Promise<AgitPostRecord> {
    assertAdmin(actor, '아지트 올리기');
    const db = getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(agitPosts).where(eq(agitPosts.id, input.id)).for('update');
      if (!row) throw new Error('올린 글을 찾을 수 없습니다.');
      if (row.status !== 'sending') throw new Error('올리는 중인 글이 아닙니다.');
      const title = agitTitleOf(row.body);
      if (!input.result.ok) {
        const error = input.result.error.slice(0, 500);
        await tx.update(agitPosts).set({ status: 'failed', error }).where(eq(agitPosts.id, row.id));
        await writeAudit(tx, { projectId: null, actor, action: '아지트 글 못 올림', field: AUDIT_FIELD, oldValue: title, newValue: error });
        return;
      }
      await tx.update(agitPosts).set({
        status: 'posted', error: null, postedAt: new Date(), ...(input.body ? { body: input.body } : {}),
        agitId: input.result.agitId ?? null, agitUrl: input.result.agitUrl ?? null,
      }).where(eq(agitPosts.id, row.id));
      await writeAudit(tx, {
        projectId: null, actor, action: '아지트 글 올림', field: AUDIT_FIELD, oldValue: null,
        newValue: `${title}${row.assignees?.length ? ` · 담당 ${row.assignees.join(', ')}` : ''}`,
      });

      /* 정산 담당 — 그 결제일의 상신 할 일을 끝내고 대화에 한 줄. 담당이 없는 DB(옛 개발 DB)면 건너뛴다 */
      const [agent] = await tx.select({ id: agents.id, name: agents.name, biz: agents.biz }).from(agents)
        .where(eq(agents.id, OPEN_PURCHASE_AGENT)).limit(1);
      if (!agent) return;
      const key = agentAuditKey(agent);
      const closed = await tx.update(agentTasks).set({ doneAt: new Date() }).where(and(
        eq(agentTasks.agentId, agent.id), eq(agentTasks.kind, openPurchaseKey(row.payDate)), isNull(agentTasks.doneAt),
      )).returning({ title: agentTasks.title });
      for (const t of closed) {
        await writeAudit(tx, { projectId: null, actor, action: '에이전트 할 일 끝냄', field: key, oldValue: t.title, newValue: '끝냄 — 아지트에 올림' });
      }
      const body = agitPostedSay({ payDate: row.payDate, title, total: row.total, batches: row.batches }, actor.name);
      const meta: AgentMessageMeta = { link: { href: '/statements', label: '거래명세서 보기 →' } };
      await tx.insert(agentMessages).values({ id: crypto.randomUUID(), agentId: agent.id, role: 'auto', author: agent.name, body, meta });
      await writeAudit(tx, { projectId: null, actor, action: '에이전트 자동', field: key, oldValue: null, newValue: body.slice(0, 2000) });
    });
    const [row] = await db.select().from(agitPosts).where(eq(agitPosts.id, input.id)).limit(1);
    if (!row) throw new Error('올린 글을 찾을 수 없습니다.');
    return recordOf(row);
  },
};

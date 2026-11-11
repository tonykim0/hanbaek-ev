/**
 * 아지트 열린구매 글 저장소 (migrations/0126 · 0130) — 연결 한 줄(한백의 아지트 계정 로그인과 요청 담당자)과 글(초안 · 올림).
 * (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — 글을 짓는 것은 lib/agit/post)
 *
 * ★정산 담당이 초안을 올리고 한백이 승인하면 올린다★(한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면
 * 정산담당에이전트가 아지트에 글을 올리는 구조」 — 메일 초안과 같은 길). 초안은 결제일 × 구분(영업비 · 시공비)마다 하나다(migrations/0129 —
 * 한백 2026-11-09 「seperate post … 영업위탁수수료 -> 시공비」): 다시 지으면(크론 · 담당의 agit_post · 올릴 때 금액이 바뀌었을 때) 같은 줄을
 * 지금 글로 고친다. 이미 올린 결제일 · 구분은 again 으로만 새 초안이 선다. 잠금도 결제일 · 구분마다다 — 영업비 글과 시공비 글은 서로 막지 않는다.
 *
 * ★한백의 아지트 로그인이 곧 열쇠다★(migrations/0130 — 한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」) — 그 쿠키만 있으면 한백의
 * 이름으로 아지트에 글을 쓴다. 그래서 잠가 두고(lib/agents/secret-box — 메일 앱 비밀번호와 같은 열쇠) 화면 · 응답 · 감사기록에 싣지 않는다.
 * 풀어 쓰는 것은 올리는 그 순간(agitSessionFor)뿐이다. 비밀번호는 여기 오지 않는다(라우트가 로그인에 한 번 쓰고 버린다 · lib/agit/agit-web).
 * 11-08 의 웹훅(token)은 걷었다 — 칸은 남았고 읽는 곳이 없다.
 *
 * ★요청 담당자는 한 번 정해 둔다★(한백 2026-11-08 「아지트 글에서 담당자 설정도 필요해」 → 요청 글 담당자 칸 · 한 번 정해 두기) —
 * 아지트 ID 배열(assignees). ★연결과 따로다★(같은 날 「담당자는 미리 넣어둘수없나」) — 같은 줄에 두되 연결 전에도 넣고(token 이 빈 줄),
 * 끊기는 주소만 비운다. 올린 글에는 그때 붙인 사람을 같이 남긴다.
 *
 * ★두 번 올리지 않는다★ — 올리기는 두 걸음이다(메일과 같은 모양): claimAgitPost 가 결제일 잠금 안에서 초안을 「올리는 중」으로 세우고,
 * 라우트가 아지트에 보낸 뒤 finishAgitPost 가 결과를 적는다. 그 사이에 또 누르면 「올리는 중」에 걸린다.
 *
 * 올리면 그 대화에 자동의 한 줄이 남고(담당이 다음에 불릴 때 올렸다는 것을 안다), 그 결제일에 나가는 구분의 글이 다 올라갔으면 정산 담당의
 * 그 결제일 「열린구매 상신」 할 일이 끝난다(lib/agents/open-purchase 의 열쇠 — agent_tasks.kind · 할 일은 결제일마다 하나다).
 *
 * ★긴급 글은 줄의 긴급사유(urgent_reason · migrations/0128)가 정한다★(한백 2026-11-09 「긴급에 대한 템플릿도 따로 만들어줘」) — 승인 때
 * 글을 다시 지을 때도 이 칸으로 짓는다(글에서 거꾸로 읽지 않는다). 초안을 다시 지으면 부른 쪽이 준 모양으로 칸을 고친다 —
 * 모양을 그대로 두려면 부른 쪽이 openAgitPost 로 지금 칸을 읽어 그대로 준다(lib/agit/load agitUrgentFor).
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { agentMessages, agents, agentTasks, agitHooks, agitPosts } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { getSecret } from '@/lib/auth/secret';
import { seal, unseal } from '@/lib/agents/secret-box';
import { OPEN_PURCHASE_AGENT, openPurchaseKey } from '@/lib/agents/open-purchase';
import { agentAuditKey, type AgentMessageMeta } from '@/types/agents';
import {
  AGIT_FEE_KIND, AGIT_MAX_ASSIGNEES, AGIT_POST_KINDS, AGIT_POST_STATUSES, agitAssigneesOf, agitKindOf, agitPostedSay, agitPostName, agitTitleOf,
  badAgitIds, type AgitFeePayee, type AgitHookInfo, type AgitKind, type AgitPostRecord, type AgitPostStatus,
} from '@/lib/agit/post';
import { agitFeePayeeOf, feePayeeLabel } from '@/lib/agit/fee';
import { agitLoginOf, agitSessionUntil, type AgitCookie } from '@/lib/agit/session';
import { PAYOUT_KINDS, type PayoutKind } from '@/types/project';
import type { ProjectRepository } from '../repository';
import { assertAdmin, assertHanbaek } from './shared';

const HOOK_ID = 'agit';
/** 감사기록의 칸 이름 */
const AUDIT_FIELD = '아지트';
/**
 * 「올리는 중」이 이보다 오래면 멈춘 것으로 본다 — 서버가 올리는 일(첨부 zip 짓기 · 쓰는 칸 채우기 · 작성하기)은 한 함수 안에서 끝나고 그 함수는
 * 300초까지 산다(app/api/agit/publish). 그보다 넉넉히 — 그 전에 다시 누르면 두 번 올라갈 수 있다
 */
const SENDING_STALE_MS = 6 * 60_000;
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
    kind: agitKindOf(row.kind),
    fee: row.fee ?? null,
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
    urgent: row.urgentReason ?? null,
    agitUrl: row.agitUrl,
    createdAt: stampOf(row.createdAt),
    at: stampOf(row.status === 'draft' ? row.createdAt : row.postedAt ?? row.createdAt),
    stalled: row.status === 'sending' && (!row.postedAt || row.postedAt.getTime() < Date.now() - SENDING_STALE_MS),
  };
}

const hookInfoOf = (row: typeof agitHooks.$inferSelect | undefined): AgitHookInfo => ({
  connected: Boolean(row?.session) && !row?.sessionError,
  login: row?.sessionLogin ?? null,
  connectedBy: row?.sessionLogin ? row.sessionBy ?? null : null,
  connectedAt: row?.sessionLogin && row.sessionAt ? stampOf(row.sessionAt) : null,
  until: row?.session && row.sessionUntil ? stampOf(row.sessionUntil).slice(0, 10) : null,
  expired: row?.sessionError ?? null,
  assignees: row?.assignees ?? [],
  feePayee: row?.feePayee ?? null,
});

/** 결제일 · 구분 하나를 잠근다 — 초안 짓기 · 올리기가 같은 글에서 줄을 서게(영업비 글과 시공비 글은 서로 안 막는다) */
const lockPost = (tx: Tx, payDate: string, kind: AgitKind) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`hb_agit:${payDate}:${kind}`}))`);

/** 결제일 · 구분의 줄 */
const ofPost = (payDate: string, kind: AgitKind) => and(eq(agitPosts.payDate, payDate), eq(agitPosts.kind, kind));

/** jsonb 는 열쇠 차례를 바꿔 돌려준다 — 견줄 때는 열쇠를 줄 세워 글로 */
const stableJson = (v: unknown): string => JSON.stringify(v, (_, x: unknown) => (
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : x
));

/** 감사기록의 글 이름 — 긴급 글이면 꼬리를 단다 */
const auditTitle = (body: string, urgent: string | null | undefined): string => `${agitTitleOf(body)}${urgent ? ' · 긴급' : ''}`;

/** 같은 결제일 · 구분을 지금 올리는 중인 줄(멈춘 것은 빼고) */
async function sendingOf(tx: Tx, payDate: string, kind: AgitKind, except?: string): Promise<Row | undefined> {
  const fresh = new Date(Date.now() - SENDING_STALE_MS);
  const rows = await tx.select().from(agitPosts).where(and(
    ofPost(payDate, kind), eq(agitPosts.status, 'sending'), gt(agitPosts.postedAt, fresh),
  ));
  return rows.find((r) => r.id !== except);
}

export const agitStore: Pick<
  ProjectRepository,
  | 'getAgitHook' | 'saveAgitSession' | 'saveAgitAssignees' | 'saveAgitFeePayee' | 'deleteAgitSession' | 'agitSessionFor' | 'touchAgitSession'
  | 'expireAgitSession'
  | 'listAgitPosts' | 'getAgitPost' | 'openAgitPost' | 'openAgitPosts' | 'postedAgitKinds' | 'recentAgitPosts' | 'draftAgitPost' | 'linkAgitPosts'
  | 'claimAgitPost' | 'finishAgitPost'
> = {
  async getAgitHook(actor): Promise<AgitHookInfo> {
    assertHanbaek(actor, '아지트 연결');
    const [row] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, HOOK_ID)).limit(1);
    return hookInfoOf(row);
  },

  async saveAgitSession(input, actor): Promise<AgitHookInfo> {
    assertAdmin(actor, '아지트 연결');
    const login = agitLoginOf(input.login);
    if (!login) throw new Error('아지트 ID 나 이메일이 아닙니다.');
    if (input.cookies.length === 0) throw new Error('아지트 로그인 쿠키가 없습니다 — 다시 연결해 주세요.');
    const session = seal(JSON.stringify(input.cookies), getSecret());
    const until = agitSessionUntil(input.cookies);
    await getDb().transaction(async (tx) => {
      const [old] = await tx.select({ login: agitHooks.sessionLogin }).from(agitHooks).where(eq(agitHooks.id, HOOK_ID)).for('update');
      const set = { session, sessionLogin: login, sessionBy: actor.name, sessionAt: new Date(), sessionUntil: until, sessionError: null };
      await tx.insert(agitHooks).values({ id: HOOK_ID, ...set }).onConflictDoUpdate({ target: agitHooks.id, set });
      /* 쿠키는 적지 않는다 — 감사기록을 읽는 사람이 한백의 이름으로 아지트에 글을 쓰게 된다 */
      await writeAudit(tx, {
        projectId: null, actor, action: '아지트 계정 연결', field: AUDIT_FIELD, oldValue: old?.login ?? null, newValue: login,
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

  async saveAgitFeePayee(input, actor): Promise<AgitHookInfo> {
    assertAdmin(actor, '플러그링크 계좌');
    /* 빈 칸 셋이면 지운다(되돌릴 길 — 화면 규칙 7) · 아니면 은행 · 계좌 · 예금주를 다 받는다 */
    const payee: AgitFeePayee | null = input ? agitFeePayeeOf(input) : null;
    await getDb().transaction(async (tx) => {
      const [old] = await tx.select({ feePayee: agitHooks.feePayee }).from(agitHooks).where(eq(agitHooks.id, HOOK_ID)).for('update');
      await tx.insert(agitHooks).values({ id: HOOK_ID, feePayee: payee })
        .onConflictDoUpdate({ target: agitHooks.id, set: { feePayee: payee } });
      /* 계좌는 끝 넉 자리만 적는다 — 감사기록은 여러 사람이 읽는다 */
      await writeAudit(tx, {
        projectId: null, actor, action: '플러그링크 계좌', field: AUDIT_FIELD,
        oldValue: old?.feePayee ? feePayeeLabel(old.feePayee) : null, newValue: payee ? feePayeeLabel(payee) : null,
      });
    });
    return agitStore.getAgitHook(actor);
  },

  async deleteAgitSession(actor): Promise<boolean> {
    assertAdmin(actor, '아지트 연결');
    return getDb().transaction(async (tx) => {
      /* 로그인만 비운다 — 요청 담당은 남는다(다시 연결하면 그대로 쓴다) */
      const gone = await tx.update(agitHooks)
        .set({ session: null, sessionLogin: null, sessionBy: null, sessionAt: null, sessionUntil: null, sessionError: null })
        .where(and(eq(agitHooks.id, HOOK_ID), isNotNull(agitHooks.sessionLogin))).returning({ login: agitHooks.sessionLogin });
      if (!gone.length) return false;
      await writeAudit(tx, {
        projectId: null, actor, action: '아지트 연결 끊음', field: AUDIT_FIELD, oldValue: gone[0].login, newValue: null,
      });
      return true;
    });
  },

  async agitSessionFor(actor): Promise<{ cookies: AgitCookie[]; login: string; at: Date }> {
    assertAdmin(actor, '아지트 올리기');
    const [row] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, HOOK_ID)).limit(1);
    if (row?.sessionError) throw new Error(`${row.sessionError}`);
    if (!row?.session || !row.sessionLogin || !row.sessionAt) {
      throw new Error('아지트 계정 연결 전 — 정산 담당 화면의 「아지트 계정」에서 한백의 아지트 계정을 연결해 주세요.');
    }
    const plain = unseal(row.session, getSecret());
    const cookies = plain ? (JSON.parse(plain) as AgitCookie[]) : null;
    if (!cookies?.length) throw new Error('아지트 연결을 풀 수 없습니다(서버 열쇠가 바뀜) — 「아지트 계정」에서 다시 연결해 주세요.');
    return { cookies, login: row.sessionLogin, at: row.sessionAt };
  },

  async touchAgitSession(input, actor): Promise<void> {
    assertAdmin(actor, '아지트 올리기');
    if (input.cookies.length === 0) return;
    /* 그사이 다시 연결했으면(새 로그인) 덮지 않는다 — 읽은 연결(at)일 때만 */
    await getDb().update(agitHooks)
      .set({ session: seal(JSON.stringify(input.cookies), getSecret()), sessionUntil: agitSessionUntil(input.cookies) })
      .where(and(eq(agitHooks.id, HOOK_ID), eq(agitHooks.sessionAt, input.at), isNull(agitHooks.sessionError)));
  },

  async expireAgitSession(input, actor): Promise<void> {
    assertAdmin(actor, '아지트 올리기');
    await getDb().transaction(async (tx) => {
      /* 풀린 쿠키는 버린다 — 누가 연결했는지는 남겨 「다시 연결」로 보인다 */
      const gone = await tx.update(agitHooks).set({ session: null, sessionUntil: null, sessionError: input.why.slice(0, 300) })
        .where(and(eq(agitHooks.id, HOOK_ID), eq(agitHooks.sessionAt, input.at), isNull(agitHooks.sessionError)))
        .returning({ login: agitHooks.sessionLogin });
      if (!gone.length) return;
      await writeAudit(tx, {
        projectId: null, actor, action: '아지트 로그인 풀림', field: AUDIT_FIELD, oldValue: gone[0].login, newValue: input.why.slice(0, 300),
      });
    });
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

  async openAgitPost(actor, payDate, kind): Promise<AgitPostRecord | null> {
    assertHanbaek(actor, '아지트 글');
    /* 올리는 중인 것도 — Claude Code 가 쓰는 칸을 채우다 멈췄으면 다시 시킨다(멈춘 「올리는 중」은 claimAgitPost 가 다시 받는다) */
    const [row] = await getDb().select().from(agitPosts)
      .where(and(ofPost(payDate, kind), inArray(agitPosts.status, [...OPEN, 'sending'])))
      .orderBy(desc(agitPosts.createdAt)).limit(1);
    return row ? recordOf(row) : null;
  },

  async openAgitPosts(actor, payDate): Promise<AgitPostRecord[]> {
    assertHanbaek(actor, '아지트 글');
    const rows = await getDb().select().from(agitPosts)
      .where(and(eq(agitPosts.payDate, payDate), inArray(agitPosts.status, [...OPEN, 'sending'])))
      .orderBy(desc(agitPosts.createdAt));
    /* 구분마다 가장 새 것 하나 — 영업비 · 시공비 · 위탁운영수수료 차례 */
    return AGIT_POST_KINDS.flatMap((k) => {
      const row = rows.find((r) => agitKindOf(r.kind) === k);
      return row ? [recordOf(row)] : [];
    });
  },

  async postedAgitKinds(actor, payDate): Promise<PayoutKind[]> {
    assertHanbaek(actor, '아지트 글');
    const rows = await getDb().select({ kind: agitPosts.kind }).from(agitPosts)
      .where(and(eq(agitPosts.payDate, payDate), eq(agitPosts.status, 'posted')));
    /* 지급의 구분만 — 상신 할 일 · 빠진 초안은 거래명세서 글의 일이다(위탁운영수수료는 따로) */
    return PAYOUT_KINDS.filter((k) => rows.some((r) => agitKindOf(r.kind) === k));
  },

  async recentAgitPosts(actor, fromDay): Promise<AgitPostRecord[]> {
    assertHanbaek(actor, '아지트 글');
    if (!DAY_RE.test(fromDay)) throw new Error('결제일은 YYYY-MM-DD 로 적어주세요.');
    const rows = await getDb().select().from(agitPosts)
      .where(or(gte(agitPosts.payDate, fromDay), inArray(agitPosts.status, [...OPEN, 'sending'])))
      .orderBy(asc(agitPosts.payDate), desc(agitPosts.createdAt))
      .limit(40);
    /* 같은 결제일 안에서는 영업비 먼저(글자 차례로는 시공비가 앞선다) — 정렬은 안정이라 새 것 먼저가 남는다 */
    const kindAt = (k: string) => AGIT_POST_KINDS.indexOf(agitKindOf(k));
    return rows
      .sort((a, b) => a.payDate.localeCompare(b.payDate) || kindAt(a.kind) - kindAt(b.kind))
      .map(recordOf);
  },

  async draftAgitPost(input, actor) {
    assertAdmin(actor, '아지트 글 초안');
    if (!DAY_RE.test(input.payDate)) throw new Error('결제일은 YYYY-MM-DD 로 적어주세요.');
    if (!AGIT_POST_KINDS.includes(input.kind)) throw new Error('구분은 영업비 · 시공비 · 위탁운영수수료 중 하나입니다.');
    /* 위탁운영수수료 글은 재료(세금계산서에서 읽은 것)와 같이 — 승인 때 그것으로 다시 짓는다. 다른 글은 재료 칸이 없다 */
    const fee = input.kind === AGIT_FEE_KIND ? input.fee ?? null : null;
    if (input.kind === AGIT_FEE_KIND && !fee) throw new Error('위탁운영수수료 글의 세금계산서 재료가 없습니다.');
    if (!input.body.trim()) throw new Error('올릴 글이 비었습니다.');
    const db = getDb();
    const name = agitPostName(input);
    const { id, plan } = await db.transaction(async (tx) => {
      await lockPost(tx, input.payDate, input.kind);
      if (await sendingOf(tx, input.payDate, input.kind)) throw new Error(`${name} 글을 올리는 중입니다 — 잠시 뒤 다시 보세요.`);
      const title = auditTitle(input.body, input.urgent);
      const [open] = await tx.select().from(agitPosts)
        .where(and(ofPost(input.payDate, input.kind), inArray(agitPosts.status, OPEN)))
        .orderBy(desc(agitPosts.createdAt)).limit(1);
      if (open) {
        /* 긴급 · 보통이 바뀌면 글도 바뀐다 — 그래도 사유 칸을 따로 견준다(같은 글에 사유만 다른 일이 없게). 위탁운영수수료는 재료(넘긴 세금계산서
         * 파일 포함)까지 — 같은 금액의 새 파일이면 zip 에 새 파일이 들게 */
        const changed = open.body !== input.body || (open.urgentReason ?? null) !== input.urgent
          || stableJson(open.fee ?? null) !== stableJson(fee);
        const moved = input.messageId !== null && input.messageId !== open.messageId;
        if (!changed && !moved) return { id: open.id, plan: 'keep' as const };
        await tx.update(agitPosts).set({
          body: input.body, total: input.total, batches: input.batches,
          ...(changed ? { status: 'draft', error: null, urgentReason: input.urgent, fee } : {}),
          ...(moved ? { messageId: input.messageId } : {}),
        }).where(eq(agitPosts.id, open.id));
        if (changed) {
          await writeAudit(tx, {
            projectId: null, actor, action: '아지트 글 초안 고침', field: AUDIT_FIELD, oldValue: auditTitle(open.body, open.urgentReason), newValue: title,
          });
        }
        return { id: open.id, plan: 'refresh' as const };
      }
      const [posted] = await tx.select().from(agitPosts)
        .where(and(ofPost(input.payDate, input.kind), eq(agitPosts.status, 'posted')))
        .orderBy(desc(agitPosts.postedAt)).limit(1);
      if (posted && !input.again) {
        throw new Error(`이미 아지트에 올린 ${name} 글입니다(${stampOf(posted.postedAt ?? posted.createdAt)} · ${posted.postedBy}) — `
          + '다시 올리려면 다시 올리라고 말해 주세요.');
      }
      const newId = crypto.randomUUID();
      await tx.insert(agitPosts).values({
        id: newId, payDate: input.payDate, kind: input.kind, status: 'draft', body: input.body, total: input.total, batches: input.batches,
        messageId: input.messageId, again: Boolean(posted), urgentReason: input.urgent, fee, postedBy: actor.name,
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
    const [first] = await db.select({ payDate: agitPosts.payDate, kind: agitPosts.kind }).from(agitPosts)
      .where(eq(agitPosts.id, input.id)).limit(1);
    if (!first) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
    const kind = agitKindOf(first.kind);
    const name = agitPostName({ payDate: first.payDate, kind });
    await db.transaction(async (tx) => {
      await lockPost(tx, first.payDate, kind);
      const [row] = await tx.select().from(agitPosts).where(eq(agitPosts.id, input.id)).for('update');
      if (!row) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
      const stale = row.status === 'sending' && (!row.postedAt || row.postedAt.getTime() < Date.now() - SENDING_STALE_MS);
      if (row.status === 'posted') throw new Error('이미 아지트에 올린 글입니다.');
      if (row.status === 'sending' && !stale) throw new Error('이 글을 올리는 중입니다 — 잠시 뒤 다시 보세요.');
      if (await sendingOf(tx, row.payDate, kind, row.id)) throw new Error(`${name} 글을 올리는 중입니다 — 잠시 뒤 다시 보세요.`);
      if (!row.again) {
        const [posted] = await tx.select({ id: agitPosts.id }).from(agitPosts)
          .where(and(ofPost(row.payDate, kind), eq(agitPosts.status, 'posted'))).limit(1);
        if (posted) throw new Error(`이미 아지트에 올린 ${name} 글입니다 — 다시 올리려면 정산 담당에게 다시 올리라고 말해 주세요.`);
      }
      await tx.update(agitPosts).set({
        status: 'sending', body: input.body, total: input.total, batches: input.batches, assignees: input.assignees,
        urgentReason: input.urgent, error: null, postedBy: actor.name, postedAt: new Date(),
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
      const title = auditTitle(row.body, row.urgentReason);
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

      /* 정산 담당 — 대화에 한 줄 · 그 결제일에 나가는 구분(input.kinds)의 글이 다 올라갔으면 상신 할 일을 끝낸다(할 일은 결제일마다
       * 하나 — 영업비 글만 올리고 시공비 글이 남았으면 할 일은 열린 채). 담당이 없는 DB(옛 개발 DB)면 건너뛴다 */
      const [agent] = await tx.select({ id: agents.id, name: agents.name, biz: agents.biz }).from(agents)
        .where(eq(agents.id, OPEN_PURCHASE_AGENT)).limit(1);
      if (!agent) return;
      const key = agentAuditKey(agent);
      const kind = agitKindOf(row.kind);
      const said = agitPostedSay(
        { payDate: row.payDate, kind, title: agitTitleOf(row.body), total: row.total, batches: row.batches, urgent: row.urgentReason },
        actor.name
      );
      /* 위탁운영수수료 글은 열린구매 상신 할 일(결제일의 거래명세서 글)과 따로다 — 대화에 한 줄만 */
      const fee = kind === AGIT_FEE_KIND;
      const postedKinds = new Set((await tx.select({ kind: agitPosts.kind }).from(agitPosts)
        .where(and(eq(agitPosts.payDate, row.payDate), eq(agitPosts.status, 'posted')))).map((r) => agitKindOf(r.kind)));
      const left = fee ? [] : (input.kinds ?? [kind]).filter((k) => !postedKinds.has(k));
      const closed = fee || left.length ? [] : await tx.update(agentTasks).set({ doneAt: new Date() }).where(and(
        eq(agentTasks.agentId, agent.id), eq(agentTasks.kind, openPurchaseKey(row.payDate)), isNull(agentTasks.doneAt),
      )).returning({ title: agentTasks.title });
      for (const t of closed) {
        await writeAudit(tx, { projectId: null, actor, action: '에이전트 할 일 끝냄', field: key, oldValue: t.title, newValue: '끝냄 — 아지트에 올림' });
      }
      const body = left.length ? `${said}\n남은 글: ${left.join(' · ')} — 다 올리면 상신 할 일이 끝납니다.` : said;
      const meta: AgentMessageMeta = fee ? {} : { link: { href: '/statements', label: '거래명세서 보기 →' } };
      await tx.insert(agentMessages).values({ id: crypto.randomUUID(), agentId: agent.id, role: 'auto', author: agent.name, body, meta });
      await writeAudit(tx, { projectId: null, actor, action: '에이전트 자동', field: key, oldValue: null, newValue: body.slice(0, 2000) });
    });
    const [row] = await db.select().from(agitPosts).where(eq(agitPosts.id, input.id)).limit(1);
    if (!row) throw new Error('올린 글을 찾을 수 없습니다.');
    return recordOf(row);
  },
};

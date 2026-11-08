/**
 * 아지트 열린구매 글 — 연결 · 요청 담당 · 초안 · 승인의 문(app/api/agit/hook · posts/[id] · store/agit · migrations/0126).
 * 한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게」 → 11-08 「정산담당 에이전트가 때가 되면 초안을
 * 올려주고, 내가 승인하면 정산담당에이전트가 아지트에 글을 올리는 구조」 · 「아지트 글에서 담당자 설정도 필요해」.
 *
 * 보는 것: 관리자만 연결 · 담당 · 승인(열람 전용 · 협력사 403) · 웹훅 주소만 받고 응답 · DB · 감사기록에 주소를 싣지 않는다 ·
 * 요청 담당은 아지트 ID 만 · 다시 연결해도 남는다 · 초안은 결제일마다 하나(다시 지으면 같은 줄을 고친다) · 담당이 비었으면 못 올림 ·
 * ★승인 때 금액이 바뀌었으면 아지트를 부르지 않고 초안을 고쳐 둔다★ · 한 번 올린 글은 다시 못 올림 · 이미 올린 결제일은 again 으로만 새 초안 ·
 * 동시에 두 번 눌러도 한 번 · 아지트가 거절하면 「못 올림」(할 일은 그대로 · 다시 승인) · 올리면 상신 할 일이 끝나고 대화에 한 줄 ·
 * 보낸 몸에 task.assignees.
 * ★아지트는 부르지 않는다★ — fetch 를 바꿔 끼운다. 웹훅 주소는 지어낸 것이다(진짜는 그 그룹의 열쇠다).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { PUT as putHook, PATCH as patchHook, DELETE as deleteHook } from '@/app/api/agit/hook/route';
import { POST as approve } from '@/app/api/agit/posts/[id]/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMessages, agentTasks, agitHooks, agitPosts, auditLog, notifications } from '@/lib/db/schema';
import { loadAgitDraft } from '@/lib/agit/load';
import { openPurchaseKey, openPurchaseOf } from '@/lib/agents/open-purchase';
import { runAgentReminders } from '@/lib/agents/remind-run';
import { RUN, USERS, call, signIn } from './kit';
import { admin, withPayableProject } from './money-kit';

const repo = getRepository();
const HOOK = `https://agit.io/webhook/test-${RUN}`;
/** 아무 시험도 안 쓰는 먼 날 — 그날의 글에 이 시험의 배치만 든다. 10 · 25일이 아니라 「지급」이다 */
const D = '2098-03-17';
const D2 = '2098-03-18';
/** 크론이 초안까지 올리는 정기결제일 — 그 기한 날 아침으로 크론을 부른다 */
const D3 = '2098-03-10';
const D3_TITLE = '열린구매 상신 — 3월 10일 정기결제';
const AGENT = 'settlement';
const TITLE = `[시험 ${RUN}] 열린구매 상신`;
const started = new Date();
let savedHook: typeof agitHooks.$inferSelect | undefined;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
const stubFetch = (impl: Fetch) => {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
};

async function sweep() {
  const db = getDb();
  const keys = [openPurchaseKey(D), openPurchaseKey(D2), openPurchaseKey(D3)];
  await db.delete(agitPosts).where(inArray(agitPosts.payDate, [D, D2, D3]));
  await db.delete(agentTasks).where(and(eq(agentTasks.agentId, AGENT), inArray(agentTasks.kind, keys)));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, AGENT), sql`${agentMessages.meta}->>'remind' in (${keys[0]}, ${keys[1]}, ${keys[2]})`));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 1_일 지급 열린구매 글을 아지트에 올렸습니다%')));
  await db.delete(notifications).where(and(eq(notifications.agentId, AGENT), inArray(notifications.title, [TITLE, D3_TITLE])));
  await db.delete(auditLog).where(and(inArray(auditLog.field, ['아지트', '정산 담당']), gte(auditLog.at, started)));
}

beforeAll(async () => {
  [savedHook] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, 'agit'));
  await sweep();
});
afterEach(() => { vi.unstubAllGlobals(); });
afterAll(async () => {
  await sweep();
  const db = getDb();
  await db.delete(agitHooks).where(eq(agitHooks.id, 'agit'));
  if (savedHook) await db.insert(agitHooks).values(savedHook);
});

/** 상신 알림 — 크론이 남기는 것과 같은 길(store/agents agentRemind). 그 말의 id 가 초안이 설 자리다 */
async function remind(payDate: string): Promise<string> {
  const r = await repo.agentRemind({
    agentId: AGENT, key: openPurchaseKey(payDate),
    task: { title: TITLE, note: null, due: payDate },
    say: `${TITLE} — 대화`,
    alarm: { title: TITLE, body: `${RUN} 본문` },
  }, admin);
  expect(r.messageId).toBeTruthy();
  return r.messageId!;
}

/** 크론처럼 — 그 결제일의 글을 지어 그 말 밑에 초안으로 */
async function draftUnder(payDate: string, messageId: string | null, again = false) {
  const d = await loadAgitDraft(admin, payDate);
  expect(d.blocked).toBeNull();
  return repo.draftAgitPost({ payDate, body: d.text, total: d.total, batches: d.batches, again, messageId }, admin);
}

const openTask = async (payDate: string) => (await getDb().select({ doneAt: agentTasks.doneAt }).from(agentTasks)
  .where(and(eq(agentTasks.agentId, AGENT), eq(agentTasks.kind, openPurchaseKey(payDate)))))[0];

const post = (id: string, seen: unknown) => call(approve, { params: { id }, body: { seen } });

describe('아지트 연결 · 요청 담당', () => {
  it('열람 전용 · 협력사는 연결도 담당도 승인도 못 한다', async () => {
    for (const u of [USERS.viewer, USERS.ecoelec]) {
      await signIn(u);
      expect((await call(putHook, { method: 'PUT', body: { url: HOOK } })).status, u.id).toBe(403);
      expect((await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x' } })).status, u.id).toBe(403);
      expect((await call(deleteHook, { method: 'DELETE' })).status, u.id).toBe(403);
      expect((await post('x', 'x')).status, u.id).toBe(403);
    }
  });

  it('웹훅 주소만 받는다 · 응답 · DB · 감사기록에 주소가 없다 · 담당은 연결 전에도 넣고 끊어도 남는다', async () => {
    await signIn(USERS.admin);
    expect((await call(putHook, { method: 'PUT', body: { url: 'https://evil.com/webhook/abcdefgh' } })).status).toBe(422);
    expect((await call(putHook, { method: 'PUT', body: { url: 3 } })).status).toBe(400);
    const ok = await call(putHook, { method: 'PUT', body: { url: HOOK } });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.json)).not.toContain(`test-${RUN}`);
    const [row] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, 'agit'));
    expect(row.token).not.toContain(`test-${RUN}`);
    expect((await call(patchHook, { method: 'PATCH', body: { assignees: '' } })).status).toBe(200);
    expect(await repo.agitHookFor(admin)).toEqual({ url: HOOK, assignees: [] });
    const audits = await getDb().select().from(auditLog).where(and(eq(auditLog.field, '아지트'), gte(auditLog.at, started)));
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(audits)).not.toContain(`test-${RUN}`);

    /* 끊기는 주소만 비운다 — 담당은 남고, 연결 전에도 담당을 넣는다(한백 「담당자는 미리 넣어둘수없나」) */
    expect((await call(deleteHook, { method: 'DELETE' })).status).toBe(200);
    await expect(repo.agitHookFor(admin)).rejects.toThrow(/아지트 미연결/);
    const before = await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x' } });
    expect(before.status).toBe(200);
    expect(before.json?.hook).toEqual({ connected: false, connectedBy: null, connectedAt: null, assignees: ['kiko.x'] });
    expect((await call(deleteHook, { method: 'DELETE' })).status).toBe(200);
    expect((await repo.getAgitHook(admin)).assignees).toEqual(['kiko.x']);
    expect((await call(putHook, { method: 'PUT', body: { url: HOOK } })).status).toBe(200);
    expect(await repo.agitHookFor(admin)).toEqual({ url: HOOK, assignees: ['kiko.x'] });
  });

  it('요청 담당 — 아지트 ID 만 · 다시 연결해도 남는다', async () => {
    await signIn(USERS.admin);
    expect((await call(patchHook, { method: 'PATCH', body: { assignees: ['kiko.x'] } })).status).toBe(400);
    const bad = await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x, 김정우' } });
    expect(bad.status).toBe(422);
    expect(bad.json?.error).toMatch(/아지트 ID 가 아닙니다 — 김정우/);
    const ok = await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x, @ella.a' } });
    expect(ok.status).toBe(200);
    expect(ok.json?.hook).toMatchObject({ assignees: ['kiko.x', 'ella.a'] });
    expect((await call(putHook, { method: 'PUT', body: { url: HOOK } })).status).toBe(200);
    expect((await repo.agitHookFor(admin)).assignees).toEqual(['kiko.x', 'ella.a']);
    const [audit] = await getDb().select().from(auditLog)
      .where(and(eq(auditLog.action, '아지트 담당자'), eq(auditLog.newValue, 'kiko.x, ella.a'), gte(auditLog.at, started)));
    expect(audit).toBeDefined();
  });
});

describe('정산 담당의 초안 → 한백의 승인 → 아지트', () => {
  it('초안은 결제일마다 하나 · 금액이 바뀌면 고쳐 두고 안 올림 · 승인하면 한 번 · 다시는 again 초안으로', async () => {
    await signIn(USERS.admin);
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D, admin);
      const said = await remind(D);
      const made = await draftUnder(D, said);
      expect(made.plan).toBe('create');
      expect(made.post).toMatchObject({ status: 'draft', payDate: D, messageId: said, batches: 1, again: false });
      expect(made.post.body).toContain(`1) ${org} · 영업비 · `);
      expect(made.post.title).toBe('[열린구매] 3/17 지급 — 협력사 지급 1건');
      /* 다시 지어도 같은 줄 — 같은 글이면 그대로, 다른 말 밑으로 옮기면 옮긴다 */
      expect((await draftUnder(D, said)).plan).toBe('keep');
      expect((await draftUnder(D, null)).post.id).toBe(made.post.id);
      expect((await repo.listAgitPosts(admin, [said])).map((p) => p.id)).toEqual([made.post.id]);

      const WALL = 'https://team-hanbaek.agit.io/g/1/wall/2';
      const fetcher = stubFetch(async () => new Response(JSON.stringify({ status: 'ok', id: 2, url: WALL }), { status: 200 }));
      expect((await call(approve, { params: { id: made.post.id }, body: {} })).status).toBe(400);

      /* 요청 담당이 비면 못 올린다 */
      await repo.saveAgitAssignees({ assignees: '' }, admin);
      const none = await post(made.post.id, made.post.body);
      expect(none.status).toBe(422);
      expect(none.json?.error).toMatch(/요청 담당 미지정/);
      await repo.saveAgitAssignees({ assignees: 'kiko.x, ella.a' }, admin);

      /* 초안 뒤에 금액이 바뀐 것처럼 — 아지트를 부르지 않고 초안을 지금 글로 고쳐 둔다 */
      await getDb().update(agitPosts).set({ body: `${made.post.body}\n옛 줄` }).where(eq(agitPosts.id, made.post.id));
      const stale = await post(made.post.id, `${made.post.body}\n옛 줄`);
      expect(stale.status).toBe(422);
      expect(stale.json?.error).toMatch(/바뀌었습니다/);
      expect(fetcher).not.toHaveBeenCalled();
      expect((await repo.getAgitPost(admin, made.post.id))?.body).toBe(made.post.body);

      const ok = await post(made.post.id, made.post.body);
      expect(ok.status).toBe(200);
      expect(ok.json?.post).toMatchObject({
        status: 'posted', payDate: D, batches: 1, postedBy: USERS.admin.name, assignees: ['kiko.x', 'ella.a'], agitUrl: WALL,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(HOOK);
      expect(JSON.parse(String(init.body))).toEqual({ text: made.post.body, task: { assignees: ['kiko.x', 'ella.a'] } });

      expect((await openTask(D))?.doneAt).not.toBeNull();
      const auto = await getDb().select({ body: agentMessages.body, role: agentMessages.role }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 17일 지급 열린구매 글을 아지트에 올렸습니다%')));
      expect(auto).toHaveLength(1);
      expect(auto[0].role).toBe('auto');
      expect(auto[0].body).toContain(`승인 ${USERS.admin.name}`);

      /* 올린 글은 다시 못 올린다 · 같은 결제일의 새 초안은 again 으로만 */
      const twice = await post(made.post.id, made.post.body);
      expect(twice.status).toBe(422);
      expect(twice.json?.error).toMatch(/이미 아지트에 올린/);
      await expect(draftUnder(D, said)).rejects.toThrow(/이미 아지트에 올린 결제일/);
      const again = await draftUnder(D, said, true);
      expect(again.plan).toBe('create');
      expect(again.post).toMatchObject({ status: 'draft', again: true });
      expect((await post(again.post.id, again.post.body)).status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect((await repo.listAgitPosts(admin, [said])).map((p) => p.status)).toEqual(['posted', 'posted']);
    });
  });

  it('크론 — 상신 기한 날 아침에 알림의 말 밑에 초안이 선다 · 다시 돌아도 하나', async () => {
    await signIn(USERS.admin);
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D3, admin);
      /* 2098년은 공휴일 표가 없다 — 그 경고([agents])는 감시용이라 여기선 조용히 */
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const morning = new Date(`${openPurchaseOf(D3).deadline}T00:00:00Z`); // 한국 시각 오전 9시
      const ran = await runAgentReminders(morning);
      expect(ran.reminded).toContain(D3);
      expect(ran.drafted).toContain(D3);
      expect((await runAgentReminders(morning)).drafted).toEqual([]);
      quiet.mockRestore();

      const [said] = await getDb().select().from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), sql`${agentMessages.meta}->>'remind' = ${openPurchaseKey(D3)}`));
      expect(said.body).toContain('아지트 열린구매 글 초안을 아래에 올렸습니다');
      const cards = await repo.listAgitPosts(admin, [said.id]);
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ status: 'draft', payDate: D3, batches: 1, postedBy: '정산 담당' });
      expect(cards[0].body).toContain(`1) ${org} · 영업비 · `);
      expect(cards[0].title).toBe('[열린구매] 3/10 정기결제 — 협력사 지급 1건');
    });
  });

  it('아지트가 거절하면 못 올림이고 할 일은 그대로 · 다시 승인 · 동시에 두 번 눌러도 한 번', async () => {
    await signIn(USERS.admin);
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D2, admin);
      const said = await remind(D2);
      const { post: draft } = await draftUnder(D2, said);

      /* 아지트가 거절 — 200 에 못 올림, 할 일은 열린 채 */
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(async () => new Response('', { status: 404 }));
      const no = await post(draft.id, draft.body);
      expect(no.status).toBe(200);
      expect(no.json?.post).toMatchObject({ status: 'failed', error: expect.stringContaining('404') });
      expect((await openTask(D2))?.doneAt).toBeNull();
      quiet.mockRestore();
      /* 못 올린 것도 같은 초안 자리다 — 다시 지으면 그 줄 */
      expect((await draftUnder(D2, said)).post.id).toBe(draft.id);

      /* 느린 아지트에 두 번 — 하나는 「올리는 중」에 걸린다 */
      const fetcher = stubFetch(async () => {
        await new Promise((r) => setTimeout(r, 400));
        return new Response('{}', { status: 200 });
      });
      const both = await Promise.all([1, 2].map(() => post(draft.id, draft.body)));
      expect(both.map((r) => r.status).sort()).toEqual([200, 422]);
      expect(String(both.find((r) => r.status === 422)?.json?.error)).toMatch(/올리는 중|이미 아지트에 올린/);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect((await openTask(D2))?.doneAt).not.toBeNull();
    });
  });
});

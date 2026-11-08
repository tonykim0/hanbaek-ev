/**
 * 아지트 열린구매 글 — 연결 · 담당자 · 올리기의 문(app/api/agit/hook · posts · store/agit · migrations/0126).
 * 한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게」 — 결제일마다 한 글 · 한백이 눌러야 올라간다.
 *
 * 보는 것: 관리자만 연결 · 올림(열람 전용 · 협력사 403) · 웹훅 주소만 받고 응답 · DB · 감사기록에 주소를 싣지 않는다 · 미연결이면 못 올림 ·
 * ★미리 본 글과 지금 글이 다르면 아지트를 부르지 않는다★ · 이미 올린 결제일은 again 이 있어야 · 동시에 두 번 눌러도 한 번 ·
 * 아지트가 거절하면 「못 올림」(할 일은 그대로) · 올리면 정산 담당의 그 결제일 상신 할 일이 끝나고 대화에 한 줄.
 * 요청 담당자(한백 2026-11-08): 아지트 ID 만 받는다 · 비었으면 못 올림 · 다시 연결해도 남는다 · 보낸 몸에 task.assignees 가 실린다.
 * ★아지트는 부르지 않는다★ — fetch 를 바꿔 끼운다. 웹훅 주소는 지어낸 것이다(진짜는 그 그룹의 열쇠다).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { PUT as putHook, PATCH as patchHook, DELETE as deleteHook } from '@/app/api/agit/hook/route';
import { POST as postAgit } from '@/app/api/agit/posts/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMessages, agentTasks, agitHooks, agitPosts, auditLog, notifications } from '@/lib/db/schema';
import { loadAgitDraft } from '@/lib/agit/load';
import { openPurchaseKey } from '@/lib/agents/open-purchase';
import { RUN, USERS, call, signIn } from './kit';
import { admin, withPayableProject } from './money-kit';

const repo = getRepository();
const HOOK = `https://agit.io/webhook/test-${RUN}`;
/** 아무 시험도 안 쓰는 먼 날 — 그날의 글에 이 시험의 배치만 든다. 10 · 25일이 아니라 「지급」이다 */
const D = '2098-03-17';
const D2 = '2098-03-18';
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
  const keys = [openPurchaseKey(D), openPurchaseKey(D2)];
  await db.delete(agitPosts).where(inArray(agitPosts.payDate, [D, D2]));
  await db.delete(agentTasks).where(and(eq(agentTasks.agentId, AGENT), inArray(agentTasks.kind, keys)));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, AGENT), sql`${agentMessages.meta}->>'remind' in (${keys[0]}, ${keys[1]})`));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 1_일 지급 열린구매 글을 아지트에 올렸습니다%')));
  await db.delete(notifications).where(and(eq(notifications.agentId, AGENT), eq(notifications.title, TITLE)));
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

const remind = (payDate: string) => repo.agentRemind({
  agentId: AGENT, key: openPurchaseKey(payDate),
  task: { title: TITLE, note: null, due: payDate },
  say: `${TITLE} — 대화`,
  alarm: { title: TITLE, body: `${RUN} 본문` },
}, admin);

const openTask = async (payDate: string) => (await getDb().select({ doneAt: agentTasks.doneAt }).from(agentTasks)
  .where(and(eq(agentTasks.agentId, AGENT), eq(agentTasks.kind, openPurchaseKey(payDate)))))[0];

describe('아지트 연결', () => {
  it('열람 전용 · 협력사는 연결도 올리기도 못 한다', async () => {
    for (const u of [USERS.viewer, USERS.ecoelec]) {
      await signIn(u);
      expect((await call(putHook, { method: 'PUT', body: { url: HOOK } })).status, u.id).toBe(403);
      expect((await call(deleteHook, { method: 'DELETE' })).status, u.id).toBe(403);
      expect((await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x' } })).status, u.id).toBe(403);
      expect((await call(postAgit, { body: { payDate: D, seen: 'x' } })).status, u.id).toBe(403);
    }
  });

  it('웹훅 주소만 받는다 · 응답 · DB · 감사기록에 주소가 없다 · 끊으면 못 올림', async () => {
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

    expect((await call(deleteHook, { method: 'DELETE' })).status).toBe(200);
    const off = await call(postAgit, { body: { payDate: D, seen: 'x' } });
    expect(off.status).toBe(422);
    expect(off.json?.error).toMatch(/아지트 미연결/);
    const noHook = await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x' } });
    expect(noHook.status).toBe(422);
    expect(noHook.json?.error).toMatch(/아지트 미연결/);
    expect((await call(putHook, { method: 'PUT', body: { url: HOOK } })).status).toBe(200);
  });

  it('요청 담당자 — 아지트 ID 만 · 비었으면 못 올림 · 다시 연결해도 남는다', async () => {
    await signIn(USERS.admin);
    expect((await call(patchHook, { method: 'PATCH', body: { assignees: ['kiko.x'] } })).status).toBe(400);
    const bad = await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x, 김정우' } });
    expect(bad.status).toBe(422);
    expect(bad.json?.error).toMatch(/아지트 ID 가 아닙니다 — 김정우/);

    const fetcher = stubFetch(async () => new Response('{}', { status: 200 }));
    const none = await call(postAgit, { body: { payDate: D, seen: 'x' } });
    expect(none.status).toBe(422);
    expect(none.json?.error).toMatch(/요청 담당자 미지정/);
    expect(fetcher).not.toHaveBeenCalled();

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

describe('아지트에 올리기', () => {
  it('미리 본 글과 같을 때만 · 한 번 · 다시 올리기는 again · 상신 할 일이 끝나고 대화에 한 줄', async () => {
    await signIn(USERS.admin);
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D, admin);
      expect((await remind(D)).created).toBe(true);
      const draft = await loadAgitDraft(admin, D);
      expect(draft.blocked).toBeNull();
      expect(draft.batches).toBe(1);
      expect(draft.text).toContain(`1) ${org} · 영업비 · `);
      expect(draft.text.split('\n')[0]).toBe('[열린구매] 3/17 지급 — 협력사 지급 1건');

      const fetcher = stubFetch(async () => new Response('{}', { status: 200 }));
      /* 미리 본 뒤 바뀐 글 — 아지트를 부르지 않는다 */
      const stale = await call(postAgit, { body: { payDate: D, seen: `${draft.text} ` } });
      expect(stale.status).toBe(422);
      expect(stale.json?.error).toMatch(/바뀌었습니다/);
      expect(fetcher).not.toHaveBeenCalled();
      expect((await call(postAgit, { body: { payDate: D } })).status).toBe(400);

      const ok = await call(postAgit, { body: { payDate: D, seen: draft.text } });
      expect(ok.status).toBe(200);
      expect(ok.json?.post).toMatchObject({ status: 'posted', payDate: D, batches: 1, total: draft.total, postedBy: USERS.admin.name });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(HOOK);
      expect(JSON.parse(String(init.body))).toEqual({ text: draft.text, task: { assignees: ['kiko.x', 'ella.a'] } });

      expect((await openTask(D))?.doneAt).not.toBeNull();
      const said = await getDb().select({ body: agentMessages.body, role: agentMessages.role }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 17일 지급 열린구매 글을 아지트에 올렸습니다%')));
      expect(said).toHaveLength(1);
      expect(said[0].role).toBe('auto');

      /* 이미 올린 결제일 — again 없이는 거절, again 이면 한 번 더 */
      const twice = await call(postAgit, { body: { payDate: D, seen: draft.text } });
      expect(twice.status).toBe(422);
      expect(twice.json?.error).toMatch(/이미 아지트에 올린/);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect((await call(postAgit, { body: { payDate: D, seen: draft.text, again: true } })).status).toBe(200);
      expect(fetcher).toHaveBeenCalledTimes(2);
      const posts = await repo.listAgitPosts(admin, [D]);
      expect(posts.map((p) => p.status)).toEqual(['posted', 'posted']);
      expect(posts[0].assignees).toEqual(['kiko.x', 'ella.a']);
    });
  });

  it('동시에 두 번 눌러도 한 번 올린다 · 아지트가 거절하면 못 올림이고 할 일은 그대로', async () => {
    await signIn(USERS.admin);
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D2, admin);
      await remind(D2);
      const draft = await loadAgitDraft(admin, D2);

      /* 아지트가 거절 — 200 에 못 올림, 할 일은 열린 채 */
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      stubFetch(async () => new Response('', { status: 404 }));
      const no = await call(postAgit, { body: { payDate: D2, seen: draft.text } });
      expect(no.status).toBe(200);
      expect(no.json?.post).toMatchObject({ status: 'failed', error: expect.stringContaining('404') });
      expect((await openTask(D2))?.doneAt).toBeNull();
      quiet.mockRestore();

      /* 느린 아지트에 두 번 — 하나는 「올리는 중」에 걸린다 */
      const fetcher = stubFetch(async () => {
        await new Promise((r) => setTimeout(r, 400));
        return new Response('{}', { status: 200 });
      });
      const both = await Promise.all([1, 2].map(() => call(postAgit, { body: { payDate: D2, seen: draft.text } })));
      expect(both.map((r) => r.status).sort()).toEqual([200, 422]);
      expect(String(both.find((r) => r.status === 422)?.json?.error)).toMatch(/올리는 중|이미 아지트에 올린/);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect((await openTask(D2))?.doneAt).not.toBeNull();
    });
  });
});

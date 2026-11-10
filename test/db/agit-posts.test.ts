/**
 * 아지트 열린구매 글 — 계정 연결 · 요청 담당 · 초안 · 올리기 · 남기기의 문(app/api/agit/account · hook · publish · posts · posts/[id] ·
 * …/finish · store/agit · lib/agit/publish).
 * 한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게」 → 11-08 「정산담당 에이전트가 때가 되면 초안을
 * 올려주고, 내가 승인하면 … 아지트에 글을 올리는 구조」 · 「아지트 글에서 담당자 설정도 필요해」 → 11-09 「evcharging bot으로 올리니까
 * 내가 내용수정도 안되고, 첨부파일은 링크가 아니라 첨부파일로」 → 「Claude Code posts it」 → 11-10 「에이전트가 직접 하게끔 하고싶어」
 * (콘솔이 한백의 아지트 계정으로 올린다 — Claude Code 의 길은 예비로 남았다).
 *
 * 보는 것: 관리자만 연결 · 담당 · 찾기 · 올리기 · 남기기(열람 전용 · 협력사 403) · 비밀번호 · 로그인 쿠키를 응답 · DB(쿠키는 잠가서만) ·
 * 감사기록에 싣지 않는다 · 요청 담당은 아지트 ID 만 · 다시 연결해도 남는다 · 초안은 결제일 × 구분마다 하나(다시 지으면 같은 줄을 고친다 ·
 * 시공비는 따로 — 한백 11-09 「seperate post … 영업위탁수수료 -> 시공비」) · 담당이 비었으면 못 올림 ·
 * ★올리기 시작 때 금액이 바뀌었으면 거절하고 초안을 고쳐 둔다★ · 한 번 올린 글은 다시 못 올림 · 이미 올린 결제일은 again 으로만 새 초안 ·
 * 동시에 두 번 시작해도 한 번 · 못 올렸으면 「못 올림」(할 일은 그대로 · 다시 시작) · 로그인이 풀리면 연결도 「풀림」 · 남긴 주소는 아지트 글
 * 주소만 · 올리면 상신 할 일이 끝나고 대화에 한 줄. ★아지트(로그인 · 쓰는 칸)는 가짜다★ — 서버 브라우저(lib/agit/agit-web)를 바꿔 끼우고
 * fetch 는 막아 본다. 비밀번호 · 쿠키 값은 지어낸 것이다.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { PATCH as patchHook } from '@/app/api/agit/hook/route';
import { PUT as putAccount, DELETE as deleteAccount } from '@/app/api/agit/account/route';
import { POST as publishRoute } from '@/app/api/agit/publish/route';
import { POST as claimRoute } from '@/app/api/agit/posts/[id]/route';
import { POST as finishRoute } from '@/app/api/agit/posts/[id]/finish/route';
import { GET as findRoute } from '@/app/api/agit/posts/route';
import { GET as getFiles } from '@/app/api/agit/posts/[id]/files/route';
import JSZip from 'jszip';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMessages, agentTasks, agitHooks, agitPosts, auditLog, notifications, payoutEntries } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import type { PayoutKind } from '@/types/project';
import { agitUrgentFor, loadAgitDraft } from '@/lib/agit/load';
import { AGIT_CC, AGIT_URGENT_TAG } from '@/lib/agit/post';
import { AgitSignedOut } from '@/lib/agit/compose';
import { requestAgitPublish } from '@/lib/agit/publish';
import { openPurchaseKey, openPurchaseOf } from '@/lib/agents/open-purchase';
import { runAgentReminders } from '@/lib/agents/remind-run';
import { RUN, USERS, call, signIn } from './kit';
import { admin, withPayableProject } from './money-kit';

/* 거래명세서 PDF 는 서버 브라우저가 그린다 — 시험에서는 가짜(크롬 없이). 무엇을 그리라고 했는지만 본다 */
const pdfCalls: string[][] = [];
vi.mock('@/lib/agit/statement-pdf', () => ({
  renderAgitFiles: async ({ paths }: { paths: string[] }) => {
    pdfCalls.push(paths);
    return { pdfs: paths.map(() => new Uint8Array([37, 80, 68, 70])), image: new Uint8Array([137, 80, 78, 71]) };
  },
  cookiePairs: () => [],
}));

/*
 * 아지트(로그인 · 쓰는 칸)는 서버 브라우저가 한다 — 시험에서는 가짜. 무엇을 넣으라고 했는지만 적고, 쿠키 값은 지어낸 것이다(진짜 값은 한백의
 * 이름으로 글을 쓰는 열쇠라 공개 저장소에 적지 않는다). login · post 를 바꿔 끼우면 그 시험만 다르게 군다
 */
const web = vi.hoisted(() => {
  const run = Math.random().toString(36).slice(2, 8);
  const cookies = (session = `s-${run}`) => [
    { name: '_uac_v1', value: `login-${run}`, domain: '.team-hanbaek.agit.io', path: '/', expires: 1802155392, httpOnly: true, secure: true },
    { name: '_venice_webapp2_session', value: session, domain: 'team-hanbaek.agit.io', path: '/', expires: -1, httpOnly: true, secure: true },
  ];
  return {
    run,
    cookies,
    logins: [] as Array<{ login: string; password: string }>,
    login: null as null | ((input: { login: string; password: string }) => Promise<{ cookies: ReturnType<typeof cookies> }>),
    posts: [] as Array<Record<string, unknown> & { dry?: boolean; onSubmit?: () => void }>,
    post: null as null | ((input: Record<string, unknown> & { onSubmit?: () => void }) => Promise<unknown>),
  };
});
vi.mock('@/lib/agit/agit-web', () => ({
  agitLogin: async (input: { login: string; password: string }) => {
    web.logins.push(input);
    return web.login ? web.login(input) : { cookies: web.cookies() };
  },
  postAsHanbaek: async (input: Record<string, unknown> & { dry?: boolean; onSubmit?: () => void; cookies: unknown }) => {
    web.posts.push(input);
    if (web.post) return web.post(input);
    if (input.dry) {
      return { dry: true, check: { template: '구매요청간소화', bad: [] }, shot: new Uint8Array([137, 80, 78, 71]), cookies: input.cookies };
    }
    input.onSubmit?.();
    /* 아지트가 세션 쿠키를 바꿔 준 것처럼 — 콘솔이 이어 쥐는지 본다 */
    return { dry: false, url: `${WALL}9`, id: '9', cookies: web.cookies(`s2-${web.run}`) };
  },
  hasAgitLogin: () => true,
}));

const repo = getRepository();
/** 로그인 화면에 넣는 비밀번호(지어낸 것) — 응답 · DB · 감사기록 어디에도 남지 않아야 한다 */
const PASSWORD = `pw-${RUN}`;
/** 아무 시험도 안 쓰는 먼 날 — 그날의 글에 이 시험의 배치만 든다. 10 · 25일이 아니라 「지급」이다 */
const D = '2098-03-17';
const D2 = '2098-03-18';
/** 크론이 초안까지 올리는 정기결제일 — 그 기한 날 아침으로 크론을 부른다 */
const D3 = '2098-03-10';
const D3_TITLE = '열린구매 상신 — 3월 10일 정기결제';
/** 첨부 zip 시험의 결제일 */
const D4 = '2098-03-19';
/** 긴급 글 시험의 결제일 */
const D5 = '2098-03-20';
const REASON = '세금계산서 발행 지연으로 늦은 상신';
/** 영업비 · 시공비가 같은 날 나가는 결제일 — 글이 둘 · 초안이 없는 구분을 짚는 날 */
const D6 = '2098-03-24';
const D7 = '2098-03-25';
/** 콘솔이 올리는 길의 결제일 — 카드 · 로그인 풀림 · 정산 담당의 손(영업비 · 시공비 둘) */
const D8 = '2098-03-26';
const D9 = '2098-03-27';
const D10 = '2098-03-30';
const D11 = '2098-03-31';
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
  const keys = [openPurchaseKey(D), openPurchaseKey(D2), openPurchaseKey(D3), openPurchaseKey(D6), openPurchaseKey(D8), openPurchaseKey(D10)];
  await db.delete(agitPosts).where(inArray(agitPosts.payDate, [D, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11]));
  await db.delete(agentTasks).where(and(eq(agentTasks.agentId, AGENT), inArray(agentTasks.kind, keys)));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, AGENT), sql`${agentMessages.meta}->>'remind' in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 __일 지급 %열린구매 %글을 아지트에 올렸습니다%')));
  await db.delete(notifications).where(and(eq(notifications.agentId, AGENT), inArray(notifications.title, [TITLE, D3_TITLE])));
  await db.delete(auditLog).where(and(inArray(auditLog.field, ['아지트', '정산 담당']), gte(auditLog.at, started)));
}

beforeAll(async () => {
  [savedHook] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, 'agit'));
  /* 연결 없는 데서 시작한다 — 개발 DB 에 실제 연결(로컬 시험)이 있어도 같게 · 끝나면 그 줄을 되돌린다(afterAll) */
  await getDb().delete(agitHooks).where(eq(agitHooks.id, 'agit'));
  await sweep();
});
afterEach(() => {
  vi.unstubAllGlobals();
  web.login = null;
  web.post = null;
});
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

/** 크론처럼 — 그 결제일 · 구분의 글을 지어 그 말 밑에 초안으로. urgent 를 주면 긴급 글(빈 글이면 보통 글로) · 안 주면 지금 초안의 모양 그대로 */
async function draftUnder(payDate: string, messageId: string | null, again = false, urgent?: string, kind: PayoutKind = '영업비') {
  const d = await loadAgitDraft(admin, payDate, kind, await agitUrgentFor(admin, payDate, kind, urgent));
  expect(d.blocked).toBeNull();
  return repo.draftAgitPost({ payDate, kind, body: d.text, total: d.total, batches: d.batches, again, messageId, urgent: d.urgent }, admin);
}

const openTask = async (payDate: string) => (await getDb().select({ doneAt: agentTasks.doneAt }).from(agentTasks)
  .where(and(eq(agentTasks.agentId, AGENT), eq(agentTasks.kind, openPurchaseKey(payDate)))))[0];

const claim = (id: string, seen: unknown) => call(claimRoute, { params: { id }, body: seen === undefined ? {} : { seen } });
const finish = (id: string, body: unknown) => call(finishRoute, { params: { id }, body });
const find = (payDate: string, kind?: PayoutKind) =>
  findRoute(new Request(`http://test.local/api/agit/posts?payDate=${payDate}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`));
/** 올린 글 주소(지어낸 것) */
const WALL = 'https://team-hanbaek.agit.io/g/1/wall/2';
/** 콘솔은 바깥을 부르지 않는다 — 부르면 던진다(아지트는 서버 브라우저 — 위의 가짜) */
const noFetch = () => stubFetch(async () => { throw new Error('콘솔이 바깥을 불렀다'); });
/** 카드의 「승인하고 올리기」 — 글들(seen 은 본 글) · 시험이면 dry */
const publish = (posts: Array<{ id: string; seen?: string }>, extra: Record<string, unknown> = {}) =>
  call(publishRoute, { body: { posts, ...extra } });
/** 응답 뒤에 도는 올리기가 끝날 때까지 — 그 줄이 「올리는 중」을 벗어나면 */
async function settled(id: string): Promise<NonNullable<Awaited<ReturnType<typeof repo.getAgitPost>>>> {
  for (let i = 0; i < 100; i++) {
    const post = await repo.getAgitPost(admin, id);
    if (post && post.status !== 'sending') return post;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`올리기가 끝나지 않았다 — ${id}`);
}
/** 한백의 아지트 계정을 연결해 둔다(라우트를 거치면 위 시험이 본다 — 여기서는 저장소로) */
const connect = () => repo.saveAgitSession({ login: 'kiko.x', cookies: web.cookies() }, admin);

describe('아지트 계정 연결 · 요청 담당', () => {
  it('열람 전용 · 협력사는 연결도 담당도 찾기 · 올리기 · 남기기도 못 한다', async () => {
    for (const u of [USERS.viewer, USERS.ecoelec]) {
      await signIn(u);
      expect((await call(putAccount, { method: 'PUT', body: { login: 'kiko.x', password: PASSWORD } })).status, u.id).toBe(403);
      expect((await call(deleteAccount, { method: 'DELETE' })).status, u.id).toBe(403);
      expect((await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x' } })).status, u.id).toBe(403);
      expect((await publish([{ id: 'x', seen: 'x' }])).status, u.id).toBe(403);
      expect((await claim('x', 'x')).status, u.id).toBe(403);
      expect((await finish('x', { ok: false })).status, u.id).toBe(403);
      expect((await find(D)).status, u.id).toBe(403);
    }
    expect(web.logins).toEqual([]);
  });

  it('로그인해 본 쿠키만 잠가 둔다 · 비밀번호는 응답 · DB · 감사기록 어디에도 없다 · 틀리면 아지트의 말 · 끊어도 담당은 남는다', async () => {
    await signIn(USERS.admin);
    expect((await call(putAccount, { method: 'PUT', body: { login: '김정우', password: PASSWORD } })).status).toBe(400);
    expect((await call(putAccount, { method: 'PUT', body: { login: 'kiko.x' } })).status).toBe(400);
    expect(web.logins).toEqual([]);

    /* 틀리면 — 아지트가 로그인 화면에 띄운 말을 그대로 */
    web.login = async () => { throw new Error('아지트에 로그인하지 못했습니다 — 비밀번호가 일치하지 않습니다.'); };
    const wrong = await call(putAccount, { method: 'PUT', body: { login: 'kiko.x', password: PASSWORD } });
    expect(wrong.status).toBe(422);
    expect(wrong.json?.error).toMatch(/비밀번호가 일치하지 않습니다/);
    expect((await repo.getAgitHook(admin)).login).toBeNull();
    web.login = null;

    const ok = await call(putAccount, { method: 'PUT', body: { login: ' kiko.x ', password: PASSWORD } });
    expect(ok.status).toBe(200);
    expect(web.logins.at(-1)).toEqual({ login: 'kiko.x', password: PASSWORD });
    expect(ok.json?.hook).toMatchObject({
      connected: true, login: 'kiko.x', connectedBy: USERS.admin.name, until: '2027-02-09', expired: null,
    });
    const [row] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, 'agit'));
    const audits = await getDb().select().from(auditLog).where(and(eq(auditLog.field, '아지트'), gte(auditLog.at, started)));
    expect(audits.some((a) => a.action === '아지트 계정 연결' && a.newValue === 'kiko.x')).toBe(true);
    for (const leak of [PASSWORD, `login-${web.run}`, `s-${web.run}`]) {
      expect(JSON.stringify(ok.json)).not.toContain(leak);
      expect(JSON.stringify(row)).not.toContain(leak);
      expect(JSON.stringify(audits)).not.toContain(leak);
    }
    expect((await repo.agitSessionFor(admin)).cookies).toEqual(web.cookies());

    /* 끊기는 로그인만 비운다 — 담당은 남고, 연결 전에도 담당을 넣는다(한백 「담당자는 미리 넣어둘수없나」) */
    expect((await call(patchHook, { method: 'PATCH', body: { assignees: 'kiko.x' } })).status).toBe(200);
    expect((await call(deleteAccount, { method: 'DELETE' })).status).toBe(200);
    await expect(repo.agitSessionFor(admin)).rejects.toThrow(/아지트 계정 연결 전/);
    expect(await repo.getAgitHook(admin)).toEqual({
      connected: false, login: null, connectedBy: null, connectedAt: null, until: null, expired: null, assignees: ['kiko.x'],
    });
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
    expect((await call(putAccount, { method: 'PUT', body: { login: 'kiko.x', password: PASSWORD } })).status).toBe(200);
    expect((await repo.getAgitHook(admin)).assignees).toEqual(['kiko.x', 'ella.a']);
    const [audit] = await getDb().select().from(auditLog)
      .where(and(eq(auditLog.action, '아지트 담당자'), eq(auditLog.newValue, 'kiko.x, ella.a'), gte(auditLog.at, started)));
    expect(audit).toBeDefined();
  });
});

describe('정산 담당의 초안 → (예비 길) Claude Code 가 한백 계정으로 올림 → 콘솔에 남김', () => {
  it('초안은 결제일마다 하나 · 금액이 바뀌면 고쳐 두고 안 올림 · 올리기 시작은 한 번 · 남긴 주소로 올림 · 다시는 again 초안으로', async () => {
    await signIn(USERS.admin);
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D, admin);
      const said = await remind(D);
      const made = await draftUnder(D, said);
      expect(made.plan).toBe('create');
      expect(made.post).toMatchObject({ status: 'draft', payDate: D, messageId: said, batches: 1, again: false });
      expect(made.post.body).toContain(`> [${org}](`); // 참고자료의 그 지급처 거래명세서 고리 — 구매 내역은 엑셀 캡처 자리뿐
      expect(made.post.body).toContain('# 구매 내역\n![구매요청간소화 엑셀](올릴 때 붙는 엑셀 캡처)');
      expect(made.post.body).not.toMatch(/첨부 파일|\.zip/); // zip 은 글의 고리가 아니라 진짜 첨부(한백 11-09)
      expect(made.post.title).toBe('98년 2월 전기차 충전 인프라 구축사업 영업위탁 수수료 (3월 17일 지급)'); // 제목은 공사명(글은 #구매요청간소화 로 시작)
      /* 다시 지어도 같은 줄 — 같은 글이면 그대로, 다른 말 밑으로 옮기면 옮긴다 */
      expect((await draftUnder(D, said)).plan).toBe('keep');
      expect((await draftUnder(D, null)).post.id).toBe(made.post.id);
      expect((await repo.listAgitPosts(admin, [said])).map((p) => p.id)).toEqual([made.post.id]);

      /* 이 길(예비)에서 콘솔은 바깥을 부르지 않는다 — 글은 Claude Code 가 한백의 맥에서 쓴다 */
      const fetcher = noFetch();
      expect((await claim(made.post.id, undefined)).status).toBe(400);
      const found = await find(D);
      expect(found.status).toBe(200);
      expect(await found.json()).toMatchObject({
        posts: [{ post: { id: made.post.id, status: 'draft', kind: '영업비' }, template: '구매요청간소화' }], missing: [],
      });

      /* 요청 담당이 비면 못 올린다 */
      await repo.saveAgitAssignees({ assignees: '' }, admin);
      const none = await claim(made.post.id, made.post.body);
      expect(none.status).toBe(422);
      expect(none.json?.error).toMatch(/요청 담당 미지정/);
      await repo.saveAgitAssignees({ assignees: 'kiko.x, ella.a' }, admin);

      /* 초안 뒤에 금액이 바뀐 것처럼 — 올리기 시작을 거절하고 초안을 지금 글로 고쳐 둔다 */
      await getDb().update(agitPosts).set({ body: `${made.post.body}\n옛 줄` }).where(eq(agitPosts.id, made.post.id));
      const stale = await claim(made.post.id, `${made.post.body}\n옛 줄`);
      expect(stale.status).toBe(422);
      expect(stale.json?.error).toMatch(/바뀌었습니다/);
      expect((await repo.getAgitPost(admin, made.post.id))?.body).toBe(made.post.body);

      /* 올리기 시작 — 「올리는 중」 · 쓸 글 · 글양식 · 요청 담당 */
      const start = await claim(made.post.id, made.post.body);
      expect(start.status).toBe(200);
      expect(start.json).toMatchObject({
        post: { status: 'sending', body: made.post.body, assignees: ['kiko.x', 'ella.a'] }, template: '구매요청간소화', assignees: ['kiko.x', 'ella.a'],
      });
      expect((await claim(made.post.id, made.post.body)).json?.error).toMatch(/올리는 중/); // 그 사이 또 시작하면 걸린다
      expect((await find(D)).status).toBe(200);

      /* 남기기 — 아지트 글 주소만 */
      expect((await finish(made.post.id, {})).status).toBe(400);
      expect((await finish(made.post.id, { ok: true, url: 'https://evil.com/g/1/wall/2' })).status).toBe(400);
      const done = await finish(made.post.id, { ok: true, url: `${WALL}/?x=1` });
      expect(done.status).toBe(200);
      expect(done.json?.post).toMatchObject({
        status: 'posted', payDate: D, batches: 1, postedBy: USERS.admin.name, assignees: ['kiko.x', 'ella.a'], agitUrl: WALL,
      });
      expect(fetcher).not.toHaveBeenCalled();
      expect((await finish(made.post.id, { ok: true, url: WALL })).status).toBe(422); // 「올리는 중」이 아니다

      expect((await openTask(D))?.doneAt).not.toBeNull();
      const auto = await getDb().select({ body: agentMessages.body, role: agentMessages.role }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 17일 지급 영업비 열린구매 글을 아지트에 올렸습니다%')));
      expect(auto).toHaveLength(1);
      expect(auto[0].role).toBe('auto');
      expect(auto[0].body).toContain(`승인 ${USERS.admin.name}`);

      /* 올린 글은 다시 못 올린다 · 같은 결제일의 새 초안은 again 으로만 */
      const twice = await claim(made.post.id, made.post.body);
      expect(twice.status).toBe(422);
      expect(twice.json?.error).toMatch(/이미 아지트에 올린/);
      expect(await (await find(D)).json()).toMatchObject({ posts: [], missing: [] }); // 올린 구분은 빠진 게 아니다
      await expect(draftUnder(D, said)).rejects.toThrow(/이미 아지트에 올린 3월 17일 지급 영업비 글/);
      const again = await draftUnder(D, said, true);
      expect(again.plan).toBe('create');
      expect(again.post).toMatchObject({ status: 'draft', again: true });
      expect((await claim(again.post.id, again.post.body)).status).toBe(200);
      expect((await finish(again.post.id, { ok: true, url: `${WALL}3` })).status).toBe(200);
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
      expect(ran.drafted).toContain(`${D3} 영업비`);
      expect((await runAgentReminders(morning)).drafted).toEqual([]);
      quiet.mockRestore();

      const [said] = await getDb().select().from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), sql`${agentMessages.meta}->>'remind' = ${openPurchaseKey(D3)}`));
      expect(said.body).toContain('아지트 열린구매 영업비 글 초안을 아래에 올렸습니다 — 「승인하고 올리기」를 누르거나 「3월 10일 열린구매 올려」');
      const cards = await repo.listAgitPosts(admin, [said.id]);
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ status: 'draft', payDate: D3, batches: 1, postedBy: '정산 담당' });
      expect(cards[0].body).toContain(`> [${org}](`);
      expect(cards[0].body).toContain('# 참고자료'); // 구매요청간소화 글(마크다운) · cc 는 긴급 글에만
      expect(cards[0].title).toBe('98년 2월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차');
    });
  });

  it('첨부 zip — 관리자만 · 한 폴더에 구매요청간소화 엑셀 · 캡처와 지급처마다 거래명세서 (한백 「개별 파일로 하나의 zip으로」)', async () => {
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D4, admin);
      const { post: draft } = await draftUnder(D4, null);
      const files = () => getFiles(new Request('http://test.local/api/agit/posts/x/files'), { params: { id: draft.id } });
      for (const u of [USERS.viewer, USERS.ecoelec]) {
        await signIn(u);
        expect((await files()).status, u.id).toBe(403);
      }
      await signIn(USERS.admin);
      pdfCalls.length = 0;
      const res = await files();
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/zip');
      const name = '98년 2월 영업위탁 수수료 3월 19일 지급';
      expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent(`${name}.zip`));
      const zip = await JSZip.loadAsync(await res.arrayBuffer());
      expect(Object.keys(zip.files).sort()).toEqual([
        `${name}/`,
        `${name}/${org}_거래명세서.pdf`,
        `${name}/구매요청간소화_전기차충전기 영업위탁수수료(98년 2월 3월 19일 지급 내역).xlsx`,
        `${name}/구매요청간소화_전기차충전기 영업위탁수수료(98년 2월 3월 19일 지급 내역).png`,
      ].sort());
      expect(pdfCalls).toEqual([[`/payments/statement?org=${encodeURIComponent(org)}&date=${D4}&kind=${encodeURIComponent('영업비')}`]]);
      expect((await getFiles(new Request('http://test.local/x'), { params: { id: 'none' } })).status).toBe(404);
    });
  });

  it('긴급 글 — 사유를 주면 긴급구매요청 꼴 · 다시 지어도 모양이 남는다 · 올리기 시작은 그 사유로 다시 지어 견주고 글양식 긴급구매요청', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x, ella.a' }, admin);
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D5, admin);
      /* 보통 초안이 먼저 서 있다(크론) — 한백이 정산 담당에게 사유와 함께 긴급으로 바꾸라고 한다 */
      const regular = await draftUnder(D5, null);
      expect(regular.post.urgent).toBeNull();
      const made = await draftUnder(D5, null, false, REASON);
      expect(made.plan).toBe('refresh');
      expect(made.post.id).toBe(regular.post.id);
      expect(made.post.urgent).toBe(REASON);
      expect(made.post.body.split('\n')[0]).toBe(`# [긴급] 98년 2월 전기차 충전 인프라 구축사업 영업위탁 수수료 (3월 20일 지급) ${AGIT_URGENT_TAG}`);
      expect(made.post.body).toContain(`*3. 긴급사유 기재*\n> ${REASON}\n# 참고자료`);
      expect(made.post.body).toContain(`> [${org}](`);
      expect(made.post.body.endsWith(`\ncc ${AGIT_CC}`)).toBe(true);
      expect(made.post.title).toBe('98년 2월 전기차 충전 인프라 구축사업 영업위탁 수수료 (3월 20일 지급)');

      /* 사유를 안 주고 다시 지으면(크론 · 「다시 지어 줘」) 긴급 그대로 · 빈 사유는 보통 글로 · 다시 긴급으로 */
      expect(await agitUrgentFor(admin, D5, '영업비', undefined)).toBe(REASON);
      expect(await agitUrgentFor(admin, D5, '시공비', undefined)).toBeNull(); // 긴급은 그 구분의 글에만
      expect((await draftUnder(D5, null)).plan).toBe('keep');
      const back = await draftUnder(D5, null, false, '');
      expect(back.post).toMatchObject({ urgent: null });
      expect(back.post.body.startsWith('#구매요청간소화\n')).toBe(true);
      expect(back.post.body).not.toContain('team.finance');
      const urgent = (await draftUnder(D5, null, false, REASON)).post;
      expect(urgent.body).toBe(made.post.body);

      /* 금액이 바뀐 것처럼 — 고쳐 둔 초안도 긴급 그대로 */
      const fetcher = noFetch();
      await getDb().update(agitPosts).set({ body: `${urgent.body}\n옛 줄` }).where(eq(agitPosts.id, urgent.id));
      expect((await claim(urgent.id, `${urgent.body}\n옛 줄`)).status).toBe(422);
      expect(await repo.getAgitPost(admin, urgent.id)).toMatchObject({ body: urgent.body, urgent: REASON });

      /* 올리기 시작 — 글양식 긴급구매요청 · 남기면 올림 */
      const start = await claim(urgent.id, urgent.body);
      expect(start.status).toBe(200);
      expect(start.json).toMatchObject({ post: { status: 'sending', urgent: REASON }, template: '긴급구매요청' });
      const done = await finish(urgent.id, { ok: true, url: WALL });
      expect(done.json?.post).toMatchObject({ status: 'posted', urgent: REASON, agitUrl: WALL, assignees: ['kiko.x', 'ella.a'] });
      expect(fetcher).not.toHaveBeenCalled();
      const auto = await getDb().select({ body: agentMessages.body }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 20일 지급 영업비 열린구매 긴급 글을 아지트에 올렸습니다%')));
      expect(auto).toHaveLength(1);
      const [audit] = await getDb().select().from(auditLog)
        .where(and(eq(auditLog.action, '아지트 글 올림'), gte(auditLog.at, started), like(auditLog.newValue, '%(3월 20일 지급) · 긴급%')));
      expect(audit).toBeDefined();
    });
  });

  it('Claude Code 가 못 올렸으면 못 올림이고 할 일은 그대로 · 다시 시작 · 동시에 두 번 시작해도 한 번', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x, ella.a' }, admin);
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D2, admin);
      const said = await remind(D2);
      const { post: draft } = await draftUnder(D2, said);
      noFetch();

      /* 못 올림 — 까닭이 남고 할 일은 열린 채 */
      expect((await claim(draft.id, draft.body)).status).toBe(200);
      const no = await finish(draft.id, { ok: false, error: '아지트 쓰는 칸이 열리지 않았다' });
      expect(no.status).toBe(200);
      expect(no.json?.post).toMatchObject({ status: 'failed', error: '아지트 쓰는 칸이 열리지 않았다' });
      expect((await openTask(D2))?.doneAt).toBeNull();
      /* 못 올린 것도 같은 초안 자리다 — 다시 지으면 그 줄 · 찾으면 그것 */
      expect((await draftUnder(D2, said)).post.id).toBe(draft.id);
      expect(await (await find(D2)).json()).toMatchObject({ posts: [{ post: { id: draft.id, status: 'failed' } }] });

      /* 두 번 동시에 시작 — 하나는 「올리는 중」에 걸린다 */
      const both = await Promise.all([1, 2].map(() => claim(draft.id, draft.body)));
      expect(both.map((r) => r.status).sort()).toEqual([200, 422]);
      expect(String(both.find((r) => r.status === 422)?.json?.error)).toMatch(/올리는 중/);
      expect((await finish(draft.id, { ok: true, url: WALL })).status).toBe(200);
      expect((await openTask(D2))?.doneAt).not.toBeNull();
    });
  });

  it('시공비는 따로 — 같은 날 영업비 · 시공비 글이 둘 · 각자 올리고 둘 다 올려야 상신 할 일이 끝난다 · 초안이 없는 구분을 짚는다', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x, ella.a' }, admin);
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D6, admin);
      /* 시공비 1차 — 설치완료까지 밀지 않고 원장 줄을 바로 넣는다(지급 줄은 저장소가 사람 손을 안 받는다 · 줄은 dropFixture 가 걷는다) */
      const cons = `시험시공사-${RUN}`;
      await getDb().insert(payoutEntries).values({
        id: crypto.randomUUID(), projectId: id, kind: '시공비', category: '1차', amount: 3_000_000, step: 1, at: D6, note: null,
        createdAt: stampOf(new Date()),
      });
      const said = await remind(D6);
      const sales = (await draftUnder(D6, said)).post;
      const build = (await draftUnder(D6, said, false, undefined, '시공비')).post;
      expect(build.id).not.toBe(sales.id);
      expect(sales).toMatchObject({ kind: '영업비', batches: 1, title: '98년 2월 전기차 충전 인프라 구축사업 영업위탁 수수료 (3월 24일 지급)' });
      expect(build).toMatchObject({ kind: '시공비', batches: 1, total: 3_000_000, title: '98년 2월 전기차 충전 인프라 구축사업 시공비 (3월 24일 지급)' });
      expect(build.body).toContain('> *- 상황설명 :* 98년 2월 동안 진행된 전기차 충전기 설치 시공에 대한 시공비 (3월 24일 지급)');
      expect(build.body).not.toContain('영업위탁');
      expect(build.body).toContain(`> [${cons}](`);
      expect(build.body).not.toContain(`> [${org}](`);
      expect(sales.body).not.toContain(`> [${cons}](`);
      /* 같은 구분을 다시 지으면 그 줄 — 다른 구분의 줄은 그대로 */
      expect((await draftUnder(D6, said, false, undefined, '시공비')).post.id).toBe(build.id);
      expect((await repo.listAgitPosts(admin, [said])).map((p) => p.kind)).toEqual(['영업비', '시공비']);

      /* 찾기 — 구분마다 하나 · 영업비 먼저 · kind 로 하나만 */
      const fetcher = noFetch();
      expect(await (await find(D6)).json()).toMatchObject({
        posts: [{ post: { id: sales.id, kind: '영업비' } }, { post: { id: build.id, kind: '시공비' } }], missing: [],
      });
      expect(await (await find(D6, '시공비')).json()).toMatchObject({ posts: [{ post: { id: build.id } }], missing: [] });
      expect((await findRoute(new Request(`http://test.local/api/agit/posts?payDate=${D6}&kind=x`))).status).toBe(400);

      /* 첨부 zip — 시공비 글은 시공비 이름 · 시공비 거래명세서만 */
      pdfCalls.length = 0;
      const res = await getFiles(new Request('http://test.local/x'), { params: { id: build.id } });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('98년 2월 시공비 3월 24일 지급.zip'));
      expect(pdfCalls).toEqual([[`/payments/statement?org=${encodeURIComponent(cons)}&date=${D6}&kind=${encodeURIComponent('시공비')}`]]);

      /* 둘을 같이 시작해도 서로 안 막는다(잠금은 결제일 · 구분마다) */
      const both = await Promise.all([claim(sales.id, sales.body), claim(build.id, build.body)]);
      expect(both.map((r) => r.status)).toEqual([200, 200]);

      /* 영업비만 올리면 할 일은 열린 채 · 대화에 남은 글을 말한다 */
      expect((await finish(sales.id, { ok: true, url: WALL })).status).toBe(200);
      expect((await openTask(D6))?.doneAt).toBeNull();
      const [first] = await getDb().select({ body: agentMessages.body }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 24일 지급 영업비 열린구매 글을 아지트에 올렸습니다%')));
      expect(first.body).toContain('남은 글: 시공비 — 다 올리면 상신 할 일이 끝납니다.');
      expect(await (await find(D6)).json()).toMatchObject({ posts: [{ post: { id: build.id, status: 'sending' } }], missing: [] });
      /* 정산 담당이 부를 때 읽는 글(lib/agents/brief agitLines) — 영업비 먼저 · 안 올린 글은 결제일이 from 앞이어도 */
      expect((await repo.recentAgitPosts(admin, D6)).filter((p) => p.payDate === D6).map((p) => [p.kind, p.status]))
        .toEqual([['영업비', 'posted'], ['시공비', 'sending']]);
      expect((await repo.recentAgitPosts(admin, D7)).filter((p) => p.payDate === D6).map((p) => p.kind)).toEqual(['시공비']);

      /* 시공비까지 올리면 끝난다 */
      expect((await finish(build.id, { ok: true, url: `${WALL}3` })).status).toBe(200);
      expect((await openTask(D6))?.doneAt).not.toBeNull();
      const [second] = await getDb().select({ body: agentMessages.body }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 24일 지급 시공비 열린구매 글을 아지트에 올렸습니다%')));
      expect(second.body).not.toContain('남은 글');
      expect(await (await find(D6)).json()).toMatchObject({ posts: [], missing: [] });
      /* 다 올린 지난 글은 from 앞이면 빠진다 */
      expect((await repo.recentAgitPosts(admin, D7)).some((p) => p.payDate === D6)).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();

      /* 초안이 없는 구분 — 시공비만 나가는 날에 초안을 안 지었으면 missing 으로 짚는다 */
      await getDb().insert(payoutEntries).values({
        id: crypto.randomUUID(), projectId: id, kind: '시공비', category: '2차', amount: 1_000, step: 2, at: D7, note: null,
        createdAt: stampOf(new Date()),
      });
      expect(await (await find(D7)).json()).toMatchObject({ posts: [], missing: ['시공비'] });
      expect(await (await find(D7, '영업비')).json()).toMatchObject({ posts: [], missing: [] });
    });
  });
});

describe('콘솔이 한백의 아지트 계정으로 올린다 (한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」)', () => {
  it('카드의 승인 — 연결 전엔 시작 안 함 · 금액이 바뀌면 고쳐 두고 안 올림 · 「올리는 중」 → 서버 브라우저 → 「올림」 · 상신 할 일 · 쿠키를 이어 쥔다', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x, ella.a' }, admin);
    await repo.deleteAgitSession(admin);
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D8, admin);
      const said = await remind(D8);
      const { post: draft } = await draftUnder(D8, said);
      const fetcher = noFetch();
      web.posts.length = 0;

      /* 연결 전 — 시작하지 않는다(「올리는 중」으로 세웠다가 곧 「못 올림」이 되지 않게) */
      const before = await publish([{ id: draft.id, seen: draft.body }]);
      expect(before.status).toBe(422);
      expect(before.json?.error).toMatch(/아지트 계정 연결 전/);
      expect((await repo.getAgitPost(admin, draft.id))?.status).toBe('draft');
      await connect();

      /* 본 글이 없으면 400 · 금액이 바뀐 것처럼 — 시작하지 않고 초안을 지금 글로 고쳐 둔다 */
      expect((await publish([{ id: draft.id }])).status).toBe(400);
      expect((await publish([])).status).toBe(400);
      await getDb().update(agitPosts).set({ body: `${draft.body}\n옛 줄` }).where(eq(agitPosts.id, draft.id));
      const stale = await publish([{ id: draft.id, seen: `${draft.body}\n옛 줄` }]);
      expect(stale.status).toBe(422);
      expect(stale.json?.error).toMatch(/바뀌었습니다 — 고친 글을 보고 다시 승인해 주세요/);
      expect(await repo.getAgitPost(admin, draft.id)).toMatchObject({ status: 'draft', body: draft.body });
      expect(web.posts).toHaveLength(0);

      /* 승인 — 「올리는 중」으로 응답하고 응답 뒤에 올린다 */
      const go = await publish([{ id: draft.id, seen: draft.body }]);
      expect(go.status).toBe(200);
      expect(go.json).toMatchObject({ started: [{ id: draft.id, status: 'sending', stalled: false }], skipped: [] });
      const done = await settled(draft.id);
      expect(done).toMatchObject({ status: 'posted', agitUrl: `${WALL}9`, postedBy: USERS.admin.name, assignees: ['kiko.x', 'ella.a'] });
      expect(web.posts).toHaveLength(1);
      const sent = web.posts[0];
      expect(sent).toMatchObject({
        template: '구매요청간소화', assignees: ['kiko.x', 'ella.a'], text: draft.body, title: draft.title, mark: null, noCc: false,
        cookies: web.cookies(),
      });
      expect((sent.zip as { name: string }).name).toBe('98년 2월 영업위탁 수수료 3월 26일 지급.zip');
      expect((sent.png as { name: string }).name).toMatch(/^구매요청간소화_전기차충전기 영업위탁수수료.*\.png$/);
      expect(fetcher).not.toHaveBeenCalled();

      /* 상신 할 일 · 대화의 한 줄 · 아지트가 바꿔 준 쿠키를 이어 쥔다 */
      expect((await openTask(D8))?.doneAt).not.toBeNull();
      const auto = await getDb().select({ body: agentMessages.body }).from(agentMessages)
        .where(and(eq(agentMessages.agentId, AGENT), like(agentMessages.body, '3월 26일 지급 영업비 열린구매 글을 아지트에 올렸습니다%')));
      expect(auto).toHaveLength(1);
      expect((await repo.agitSessionFor(admin)).cookies.find((c) => c.name === '_venice_webapp2_session')?.value).toBe(`s2-${web.run}`);

      /* 올린 글은 다시 못 올린다 */
      const twice = await publish([{ id: draft.id, seen: draft.body }]);
      expect(twice.status).toBe(422);
      expect(twice.json?.error).toMatch(/이미 아지트에 올린/);
    });
  });

  it('로그인 화면으로 가면 「못 올림」 · 연결은 「풀림」(다시 연결 전엔 시작 안 함) · 「작성하기」 뒤에 멈추면 먼저 확인 · 멈춘 「올리는 중」은 다시', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x' }, admin);
    await connect();
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D9, admin);
      const { post: draft } = await draftUnder(D9, null);
      /* 못 올림은 [agit] 로 감시에 남긴다 — 여기선 조용히 */
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      web.post = async () => { throw new AgitSignedOut(); };
      expect((await publish([{ id: draft.id, seen: draft.body }])).status).toBe(200);
      const out = await settled(draft.id);
      expect(out.status).toBe('failed');
      expect(out.error).toMatch(/아지트 로그인이 풀렸습니다/);
      const hook = await repo.getAgitHook(admin);
      expect(hook).toMatchObject({ connected: false, login: 'kiko.x' });
      expect(hook.expired).toMatch(/로그인이 풀렸습니다/);
      const blocked = await publish([{ id: draft.id, seen: draft.body }]);
      expect(blocked.status).toBe(422);
      expect(blocked.json?.error).toMatch(/로그인이 풀렸습니다/);

      /* 다시 연결하면 풀림이 걷힌다 · 「작성하기」를 누른 뒤에 멈추면 올라갔을 수 있다 — 까닭 머리에 먼저 확인하라고 */
      await connect();
      expect((await repo.getAgitHook(admin)).expired).toBeNull();
      web.post = async (input) => {
        input.onSubmit?.();
        throw new Error('「작성하기」 뒤에 새 글이 안 보인다');
      };
      expect((await publish([{ id: draft.id, seen: draft.body }])).status).toBe(200);
      const after = await settled(draft.id);
      expect(after.status).toBe('failed');
      expect(after.error).toMatch(/^「작성하기」를 누른 뒤 멈춤 — 아지트에 올라갔는지 먼저 확인 · /);

      /* 멈춘 「올리는 중」(서버 함수가 끝까지 못 감) — 카드가 멈춤으로 알고 다시 올린다 */
      await getDb().update(agitPosts).set({ status: 'sending', postedAt: new Date(Date.now() - 7 * 60_000) }).where(eq(agitPosts.id, draft.id));
      expect(await repo.getAgitPost(admin, draft.id)).toMatchObject({ status: 'sending', stalled: true });
      web.post = null;
      expect((await publish([{ id: draft.id, seen: draft.body }])).status).toBe(200);
      expect(await settled(draft.id)).toMatchObject({ status: 'posted', stalled: false });
      quiet.mockRestore();
    });
  });

  it('시험(dry) — 쓰는 칸까지만 채워 보고 화면을 준다 · 「올리는 중」으로 안 세운다 · 재무팀 멘션은 기본으로 뺀다', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x' }, admin);
    await connect();
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D11, admin);
      const { post: draft } = await draftUnder(D11, null);
      web.posts.length = 0;
      expect((await publish([{ id: draft.id }, { id: draft.id }], { dry: true })).status).toBe(400);
      const dry = await publish([{ id: draft.id }], { dry: true, mark: '[시험 — 곧 지웁니다]' });
      expect(dry.status).toBe(200);
      expect(dry.json).toMatchObject({ check: { template: '구매요청간소화', bad: [] } });
      expect(typeof dry.json?.shot).toBe('string');
      expect(web.posts[0]).toMatchObject({ dry: true, noCc: true, mark: '[시험 — 곧 지웁니다]', text: draft.body });
      expect((await repo.getAgitPost(admin, draft.id))?.status).toBe('draft');
    });
  });

  it('정산 담당의 손(agit_publish) — 승인 라우트를 한백의 로그인으로 부른다 · 그날의 글 전부를 영업비 먼저 하나씩 · 둘 다 올라가야 할 일이 끝난다', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x' }, admin);
    await connect();
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D10, admin);
      await getDb().insert(payoutEntries).values({
        id: crypto.randomUUID(), projectId: id, kind: '시공비', category: '1차', amount: 2_000_000, step: 1, at: D10, note: null,
        createdAt: stampOf(new Date()),
      });
      const said = await remind(D10);
      const sales = (await draftUnder(D10, said)).post;
      const build = (await draftUnder(D10, said, false, undefined, '시공비')).post;
      web.posts.length = 0;
      const asked: Request[] = [];
      const fetcher = (async (url: URL | string, init?: RequestInit) => {
        const req = new Request(url, init);
        asked.push(req.clone());
        return publishRoute(req, { params: {} });
      }) as typeof fetch;
      const caller = { origin: 'https://console.test', cookie: `hb_session=${RUN}` };
      const res = await requestAgitPublish(caller, [{ id: sales.id, seen: sales.body }, { id: build.id, seen: build.body }], fetcher);
      expect(res.error).toBeUndefined();
      expect(res.started.map((p) => p.kind)).toEqual(['영업비', '시공비']);
      expect(asked[0].url).toBe('https://console.test/api/agit/publish');
      expect(asked[0].headers.get('cookie')).toBe(`hb_session=${RUN}`);
      expect(await settled(sales.id)).toMatchObject({ status: 'posted' });
      expect(await settled(build.id)).toMatchObject({ status: 'posted' });
      expect(web.posts.map((p) => (p.zip as { name: string }).name))
        .toEqual(['98년 2월 영업위탁 수수료 3월 30일 지급.zip', '98년 2월 시공비 3월 30일 지급.zip']);
      expect((await openTask(D10))?.doneAt).not.toBeNull();

      /* 시작 못 한 까닭은 그대로 돌려준다 — 담당이 한백에게 말한다 */
      await repo.deleteAgitSession(admin);
      const none = await requestAgitPublish(caller, [{ id: sales.id, seen: sales.body }], fetcher);
      expect(none.error).toMatch(/아지트 계정 연결 전/);
    });
  });
});

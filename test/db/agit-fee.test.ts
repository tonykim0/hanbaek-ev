/**
 * 플러그링크 위탁운영수수료 글의 문 — 세금계산서로 짓는 초안(lib/agit/fee-run) · 플러그링크 계좌(PATCH /api/agit/hook) · 승인 · 올림 · 첨부 zip
 * (app/api/agit/publish · posts · posts/[id]/files · store/agit). 한백 2026-11-10 「이것도 글도 매월말에 반복되는 상신인데 자동화시키고싶어」 →
 * 「내가 에이전트한테 세금계산서를 올려주고 너가 나머지를 처리해주는 방식으로」.
 *
 * 보는 것: 초안은 지급 요청일 × 「위탁운영수수료」마다 하나(같으면 그대로 · 입금 예정일이 바뀌면 고친다) · 재료(세금계산서에서 읽은 것)가 줄에
 * 남는다 · 계좌는 관리자만 · 감사기록엔 끝 넉 자리 · 계좌가 없으면 시작 안 함 · 승인 → 긴급구매요청으로 올림(그 재료로 다시 지어 견준다) ·
 * 대화에 한 줄(건수 없이) · 열린구매 상신 할 일과 섞이지 않는다 · zip 은 엑셀 · 넘긴 세금계산서 · 다시는 again 으로만.
 * ★세금계산서 판독 · 아지트 · 서버 브라우저는 가짜다★ — 금액 · 계좌 · 쿠키는 지어낸 것이다(실제 값은 공개 저장소에 적지 않는다).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, gte, like, sql } from 'drizzle-orm';
import JSZip from 'jszip';
import { PATCH as patchHook } from '@/app/api/agit/hook/route';
import { POST as publishRoute } from '@/app/api/agit/publish/route';
import { GET as findRoute } from '@/app/api/agit/posts/route';
import { GET as getFiles } from '@/app/api/agit/posts/[id]/files/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMessages, agentTasks, agitHooks, agitPosts, auditLog, notifications } from '@/lib/db/schema';
import { draftAgitFeePost, type FeeDraftRequest } from '@/lib/agit/fee-run';
import { feePayDateOf, feeRemindKey, FEE_URGENT_REASON, type AgitFeeFile, type TaxInvoiceRead } from '@/lib/agit/fee';
import { businessDaysBefore } from '@/lib/business-days';
import { runAgentReminders } from '@/lib/agents/remind-run';
import { AGIT_FEE_KIND } from '@/lib/agit/post';
import { USERS, call, signIn } from './kit';
import { admin } from './money-kit';

/* 서버 브라우저 — 엑셀 캡처만 그린다(위탁운영수수료 글에는 거래명세서가 없다) */
const renders: string[][] = [];
vi.mock('@/lib/agit/statement-pdf', () => ({
  renderAgitFiles: async ({ paths }: { paths: string[] }) => {
    renders.push(paths);
    return { pdfs: paths.map(() => new Uint8Array([37, 80, 68, 70])), image: new Uint8Array([137, 80, 78, 71]) };
  },
  cookiePairs: () => [],
}));

/* 아지트 — 가짜. 무엇을 넣으라고 했는지만 적는다(쿠키 값은 지어낸 것) */
const web = vi.hoisted(() => ({
  posts: [] as Array<Record<string, unknown>>,
  cookies: () => [
    { name: '_uac_v1', value: 'login-fee', domain: '.team-hanbaek.agit.io', path: '/', expires: 1802155392, httpOnly: true, secure: true },
  ],
}));
vi.mock('@/lib/agit/agit-web', () => ({
  agitLogin: async () => ({ cookies: web.cookies() }),
  postAsHanbaek: async (input: Record<string, unknown> & { onSubmit?: () => void; cookies: unknown }) => {
    web.posts.push(input);
    input.onSubmit?.();
    return { dry: false, url: 'https://team-hanbaek.agit.io/g/1/wall/77', id: '77', cookies: input.cookies };
  },
  hasAgitLogin: () => true,
}));

const repo = getRepository();
/** 아무 시험도 안 쓰는 먼 달 — 그 다음 달 말일(영업일)이 지급 요청일 */
const MONTH = '2098-04';
const PAY = feePayDateOf(MONTH);
/** 그 지급일의 상신 기한 — 3영업일 전(말일 상신 알림이 서는 날) */
const DEADLINE = businessDaysBefore(PAY, 3);
const FEE: AgitFeeFile = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/fee-test.pdf', name: '플링비즈_98년 4월분.pdf' };
const SALES: AgitFeeFile = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/sales-test.pdf', name: '충전매출 (98년 4월).pdf' };
const READS: Record<string, TaxInvoiceRead> = {
  [FEE.url]: {
    supplier: '주식회사 플러그링크', receiver: '(주)한백', issued: '2098-05-01', supply: 1_000_001, vat: 100_000, total: 1_100_001,
    item: '전기요금, 플링비즈 위탁운영 비용, 법정정기검사 수수료 4월분', month: MONTH,
  },
  [SALES.url]: {
    supplier: '(주)한백', receiver: '주식회사 플러그링크', issued: '2098-05-01', supply: 400_005, vat: 40_001, total: 440_006, item: '충전매출',
    month: null,
  },
};
const reader = async (f: AgitFeeFile) => READS[f.url];
const ask = (over: Partial<FeeDraftRequest> = {}): FeeDraftRequest => ({
  feeFile: FEE, salesFile: SALES, inDate: null, month: null, payDate: null, again: false, ...over,
});
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49]);
const started = new Date();
let savedHook: typeof agitHooks.$inferSelect | undefined;

async function sweep() {
  const db = getDb();
  await db.delete(agitPosts).where(and(eq(agitPosts.payDate, PAY), eq(agitPosts.kind, AGIT_FEE_KIND)));
  /* 말일 상신 알림이 남긴 것 — 할 일 · 대화의 그 줄 · 알림 */
  await db.delete(agentTasks).where(and(eq(agentTasks.agentId, 'settlement'), eq(agentTasks.kind, feeRemindKey(PAY))));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, 'settlement'), sql`${agentMessages.meta}->>'remind' = ${feeRemindKey(PAY)}`));
  await db.delete(notifications).where(and(eq(notifications.agentId, 'settlement'), like(notifications.title, '위탁운영수수료 상신 — 5월 30일%')));
  await db.delete(auditLog).where(and(eq(auditLog.field, '정산 담당'), gte(auditLog.at, started)));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, 'settlement'), like(agentMessages.body, '%위탁운영수수료 열린구매 긴급 글을 아지트에 올렸습니다%98%')));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, 'settlement'), like(agentMessages.body, `${Number(PAY.slice(5, 7))}월 ${Number(PAY.slice(8))}일 위탁운영수수료 열린구매%`)));
  await db.delete(auditLog).where(and(eq(auditLog.field, '아지트'), gte(auditLog.at, started)));
}

beforeAll(async () => {
  [savedHook] = await getDb().select().from(agitHooks).where(eq(agitHooks.id, 'agit'));
  await getDb().delete(agitHooks).where(eq(agitHooks.id, 'agit'));
  await sweep();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await sweep();
  const db = getDb();
  await db.delete(agitHooks).where(eq(agitHooks.id, 'agit'));
  if (savedHook) await db.insert(agitHooks).values(savedHook);
});

const publish = (posts: Array<{ id: string; seen?: string }>) => call(publishRoute, { body: { posts } });
const find = () => findRoute(new Request(`http://test.local/api/agit/posts?payDate=${PAY}&kind=${encodeURIComponent(AGIT_FEE_KIND)}`));
async function settled(id: string) {
  for (let i = 0; i < 100; i++) {
    const post = await repo.getAgitPost(admin, id);
    if (post && post.status !== 'sending') return post;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`올리기가 끝나지 않았다 — ${id}`);
}

describe('플러그링크 위탁운영수수료 글 (한백 2026-11-10 「세금계산서를 올려주고 너가 나머지를 처리」)', () => {
  it('플러그링크 계좌 — 화면 · API 없이 DB 에만(고정값) · 관리자만 · 은행 · 계좌 · 예금주를 다 받는다 · 감사기록엔 끝 넉 자리 · 지울 수 있다', async () => {
    /* 담당자 PATCH 는 계좌를 안 받는다 — 한백 11-11 「이건 UI에 안넣고 그냥 DB에 넣어서 고정으로」 */
    await signIn(USERS.admin);
    expect((await call(patchHook, { body: { feePayee: { bank: '우리', account: '1002000000009', holder: '주식회사 플러그링크' } } })).status).toBe(400);
    expect((await repo.getAgitHook(admin)).feePayee).toBeNull();
    const viewer = { id: 'viewer', name: '열람', role: 'viewer' as const, org: null };
    await expect(repo.saveAgitFeePayee({ bank: '우리', account: '1002000000009', holder: '주식회사 플러그링크' }, viewer)).rejects.toThrow();
    await expect(repo.saveAgitFeePayee({ bank: '우리', account: '12', holder: 'x' }, admin)).rejects.toThrow('8~16자리');
    const set = await repo.saveAgitFeePayee({ bank: '우리', account: '1002-000-000009', holder: '주식회사 플러그링크' }, admin);
    expect(set.feePayee).toEqual({ bank: '우리은행', account: '1002000000009', holder: '주식회사 플러그링크' });
    const audit = await getDb().select({ newValue: auditLog.newValue }).from(auditLog)
      .where(and(eq(auditLog.action, '플러그링크 계좌'), gte(auditLog.at, started)));
    expect(audit.map((a) => a.newValue)).toContain('우리은행 ****0009 · 주식회사 플러그링크');
    expect(JSON.stringify(audit)).not.toContain('1002000000009');
    expect((await repo.saveAgitFeePayee(null, admin)).feePayee).toBeNull();
  });

  it('세금계산서로 짓는 초안 → 계좌 없으면 시작 안 함 → 승인 → 긴급구매요청으로 올림 · 대화에 한 줄 · zip · 다시는 again', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x' }, admin);
    await repo.saveAgitSession({ login: 'kiko.x', cookies: web.cookies() }, admin);

    /* 초안 — 재료가 줄에 남는다 · 같은 것을 또 지으면 그대로 · 입금 예정일을 주면 고친다 */
    const made = await draftAgitFeePost(admin, ask(), reader);
    expect(made.plan).toBe('create');
    expect(made.post).toMatchObject({
      payDate: PAY, kind: AGIT_FEE_KIND, status: 'draft', urgent: FEE_URGENT_REASON, total: 1_000_001, batches: 1,
      title: `플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 ${made.input.round}차`,
    });
    expect(made.post.fee).toEqual({
      month: MONTH, round: made.input.round,
      fee: { supply: 1_000_001, vat: 100_000, total: 1_100_001, file: FEE },
      sales: { supply: 400_005, vat: 40_001, total: 440_006, inDate: null, file: SALES },
    });
    expect((await draftAgitFeePost(admin, ask(), reader)).plan).toBe('keep');
    const dated = await draftAgitFeePost(admin, ask({ inDate: '2098-05-28' }), reader);
    expect(dated.plan).toBe('refresh');
    expect(dated.post.id).toBe(made.post.id);
    expect(dated.post.body).toContain('> 400,005    40,001    440,006 > 5월 28일 입금 예정');
    /* 두 장이 바뀌어 오면 짓지 않는다 */
    await expect(draftAgitFeePost(admin, ask({ feeFile: SALES, salesFile: FEE }), reader)).rejects.toThrow('두 파일을 바꿔 주세요');
    await expect(draftAgitFeePost(admin, ask({ salesFile: FEE }), reader)).rejects.toThrow('같은 파일');

    /* Claude Code 의 예비 길도 찾는다 — 빠진 거래명세서 글은 없다 */
    const found = await (await find()).json() as { posts: Array<{ post: { id: string }; template: string }>; missing: string[] };
    expect(found.posts.map((p) => [p.post.id, p.template])).toEqual([[made.post.id, '긴급구매요청']]);
    expect(found.missing).toEqual([]);

    /* 말일 상신 알림 — 그 지급일의 3영업일 전 아침 크론이 할 일 · 대화 한 줄 · 알림을 한 번 남긴다(다시 돌아도 하나 · 열린구매 알림은 없는 날) */
    const ran = await runAgentReminders(new Date(`${DEADLINE}T00:00:00Z`));
    expect(ran).toEqual({ day: DEADLINE, due: [`${PAY} 위탁운영수수료`], reminded: [`${PAY} 위탁운영수수료`], drafted: [] });
    expect((await runAgentReminders(new Date(`${DEADLINE}T03:00:00Z`))).reminded).toEqual([]);
    const remindTask = async () => (await getDb().select({ title: agentTasks.title, due: agentTasks.due, doneAt: agentTasks.doneAt })
      .from(agentTasks).where(and(eq(agentTasks.agentId, 'settlement'), eq(agentTasks.kind, feeRemindKey(PAY)))));
    expect(await remindTask()).toEqual([expect.objectContaining({ due: DEADLINE, doneAt: null })]);
    expect((await remindTask())[0].title).toMatch(/^위탁운영수수료 상신 — 5월 30일 \(98년 4월분 · \d+차\)$/);
    expect(await getDb().select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.agentId, 'settlement'), like(notifications.title, '위탁운영수수료 상신 — 5월 30일%')))).toHaveLength(1);

    /* 플러그링크 계좌가 없으면 시작하지 않는다 */
    const before = await publish([{ id: made.post.id, seen: dated.post.body }]);
    expect(before.status).toBe(422);
    expect(before.json?.error).toMatch(/플러그링크 계좌 미지정/);
    expect(web.posts).toHaveLength(0);
    await repo.saveAgitFeePayee({ bank: '우리은행', account: '1002000000009', holder: '주식회사 플러그링크' }, admin);

    /* 승인 — 재료로 다시 지어 본 글과 같으면 올린다 · 긴급구매요청 · 엑셀 캡처 하나(거래명세서 없음) · zip 이름 */
    renders.length = 0;
    const blob = vi.fn(async () => new Response(PDF));
    vi.stubGlobal('fetch', blob);
    const go = await publish([{ id: made.post.id, seen: dated.post.body }]);
    expect(go.status).toBe(200);
    const done = await settled(made.post.id);
    expect(done).toMatchObject({ status: 'posted', agitUrl: 'https://team-hanbaek.agit.io/g/1/wall/77', assignees: ['kiko.x'] });
    expect(web.posts).toHaveLength(1);
    expect(web.posts[0]).toMatchObject({ template: '긴급구매요청', text: dated.post.body, title: dated.post.title, noCc: false });
    const yymmdd = PAY.slice(2).replace(/-/g, '');
    expect((web.posts[0].zip as { name: string }).name).toBe(`플러그링크 잉여금 처분_위탁운영수수료 ${made.input.round}차_${yymmdd}.zip`);
    expect((web.posts[0].png as { name: string }).name).toBe(`플러그링크 Mother EPC 잉여금처분_위탁운영수수료 ${made.input.round}차.png`);
    expect(renders).toEqual([[]]);
    expect(blob).toHaveBeenCalledWith(FEE.url, expect.anything());

    /* 대화에 한 줄 — 건수 없이 · 거래명세서 고리 없이 */
    const auto = await getDb().select({ body: agentMessages.body, meta: agentMessages.meta }).from(agentMessages)
      .where(and(eq(agentMessages.agentId, 'settlement'), like(agentMessages.body, `${Number(PAY.slice(5, 7))}월 ${Number(PAY.slice(8))}일 위탁운영수수료 열린구매%`)));
    expect(auto).toHaveLength(1);
    expect(auto[0].body).toContain('긴급 글을 아지트에 올렸습니다 — 공급가액 1,000,001원');
    expect(auto[0].body).not.toContain('지급 1건');
    expect(auto[0].meta).not.toHaveProperty('link');
    /* 올렸으니 그 지급일의 상신 할 일이 저절로 끝났다 */
    expect((await remindTask())[0].doneAt).not.toBeNull();

    /* 첨부 zip — 엑셀 · 넘긴 세금계산서(폴더 없이) */
    const res = await getFiles(new Request(`http://test.local/api/agit/posts/${made.post.id}/files`), { params: { id: made.post.id } });
    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      `플러그링크 Mother EPC 잉여금처분_위탁운영수수료 ${made.input.round}차.xlsx`, FEE.name,
    ].sort());

    /* 다시는 again 으로만 */
    await expect(draftAgitFeePost(admin, ask(), reader)).rejects.toThrow('이미 아지트에 올린');
    const again = await draftAgitFeePost(admin, ask({ again: true }), reader);
    expect(again.plan).toBe('create');
    expect(again.post).toMatchObject({ again: true, status: 'draft' });
  });
});

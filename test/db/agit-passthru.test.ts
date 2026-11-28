/**
 * 플러그링크 패스스루 집행 글의 문 — 한백사업내역리스트로 짓는 초안(lib/agit/passthru-run) · 승인 · 올림 · 첨부 zip · 매월 25일 알림
 * (app/api/agit/publish · posts · posts/[id]/files · store/agit · lib/agents/remind-run). 한백 2026-11-28 「[긴급] 플러그링크 2026년 10월
 * 패스스루 집행 이것도 주기적으로 올리는데」 → 「알림 시점은 매월 25일 필요. 지금은 정기지급일만해」.
 *
 * 보는 것: 초안은 지급일 × 「패스스루」마다 하나(같으면 그대로 · 입금 예정일이 바뀌면 고친다) · 재료(엑셀에서 읽은 것)가 줄에 남는다 · 엑셀을
 * 첨부로도 고르면 거절 · 플러그링크 계좌(위탁운영수수료 글의 것) 없이도 올린다 · 승인 → 긴급구매요청으로 올림(그 재료로 다시 지어 견준다) ·
 * 대화에 한 줄 · 그 달의 25일 상신 할 일이 끝난다 · zip 은 엑셀 · 넘긴 증빙(한백사업내역리스트는 안 든다) · 다시는 again 으로만.
 * ★엑셀 읽기 · 아지트 · 서버 브라우저는 가짜다★ — 거래처 · 금액 · 계좌 · 쿠키는 지어낸 것이다(실제 값은 공개 저장소에 적지 않는다).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, gte, like, sql } from 'drizzle-orm';
import JSZip from 'jszip';
import { POST as publishRoute } from '@/app/api/agit/publish/route';
import { GET as findRoute } from '@/app/api/agit/posts/route';
import { GET as getFiles } from '@/app/api/agit/posts/[id]/files/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMessages, agentTasks, agitHooks, agitPosts, auditLog, notifications } from '@/lib/db/schema';
import { draftAgitPassthruPost, type PassthruDraftRequest } from '@/lib/agit/passthru-run';
import { PASSTHRU_URGENT_REASON, passthruRemindKey, type PassthruFile, type PassthruRead } from '@/lib/agit/passthru';
import { runAgentReminders } from '@/lib/agents/remind-run';
import { AGIT_PASSTHRU_KIND } from '@/lib/agit/post';
import { USERS, call, signIn } from './kit';
import { admin } from './money-kit';

/* 서버 브라우저 — 엑셀 캡처만 그린다(패스스루 글에는 거래명세서가 없다) */
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
    { name: '_uac_v1', value: 'login-pass', domain: '.team-hanbaek.agit.io', path: '/', expires: 1802155392, httpOnly: true, secure: true },
  ],
}));
vi.mock('@/lib/agit/agit-web', () => ({
  agitLogin: async () => ({ cookies: web.cookies() }),
  postAsHanbaek: async (input: Record<string, unknown> & { onSubmit?: () => void; cookies: unknown }) => {
    web.posts.push(input);
    input.onSubmit?.();
    return { dry: false, url: 'https://team-hanbaek.agit.io/g/1/wall/88', id: '88', cookies: input.cookies };
  },
  hasAgitLogin: () => true,
}));

const repo = getRepository();
/** 아무 시험도 안 쓰는 먼 달 — 25일이 평일이고 그날 다른 정기 알림(열린구매 · 위탁운영수수료)이 서지 않는다 */
const MONTH = '2098-03';
const PAY = '2098-03-27';
const REMIND_ON = '2098-03-25';
const KEY = passthruRemindKey(MONTH);
const SHEET: PassthruFile = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/pass-sheet.xlsx', name: '한백사업내역리스트_98.xlsx' };
const INV: PassthruFile = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/pass-inv.pdf', name: '가나전기 세금계산서.pdf' };
const CONTRACT: PassthruFile = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/pass-con.pdf', name: '공사하도급계약서.pdf' };
const READ: PassthruRead = {
  round: 98, month: MONTH, receive: 2_400_000, payDate: PAY, own: { supply: 500_000, rows: 1 }, notes: [],
  rows: [
    { label: 'HB98차_준공', org: '가나전기', what: '준공', supply: 1_000_000, vat: 100_000, bank: '가상은행', account: '000-11-2222', holder: '가나전기' },
    { label: 'HB98차_추가공사비', org: '다라이브이', what: '추가공사비', supply: 300_000, vat: 30_000, bank: null, account: null, holder: null },
  ],
};
const reads: Array<{ file: PassthruFile; round: number | null }> = [];
const reader = async (file: PassthruFile, round: number | null) => {
  reads.push({ file, round });
  return READ;
};
const ask = (over: Partial<PassthruDraftRequest> = {}): PassthruDraftRequest => ({
  sheetFile: SHEET, attach: [INV, CONTRACT], round: null, inDate: null, payDate: null, again: false, ...over,
});
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49]);
const started = new Date();
let savedHook: typeof agitHooks.$inferSelect | undefined;

async function sweep() {
  const db = getDb();
  await db.delete(agitPosts).where(and(eq(agitPosts.payDate, PAY), eq(agitPosts.kind, AGIT_PASSTHRU_KIND)));
  /* 25일 상신 알림이 남긴 것 — 할 일 · 대화의 그 줄 · 알림 */
  await db.delete(agentTasks).where(and(eq(agentTasks.agentId, 'settlement'), eq(agentTasks.kind, KEY)));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, 'settlement'), sql`${agentMessages.meta}->>'remind' = ${KEY}`));
  await db.delete(notifications).where(and(eq(notifications.agentId, 'settlement'), like(notifications.title, '패스스루 집행 상신 — 98년 3월%')));
  await db.delete(agentMessages).where(and(eq(agentMessages.agentId, 'settlement'), like(agentMessages.body, '3월 27일 패스스루 열린구매%')));
  await db.delete(auditLog).where(and(eq(auditLog.field, '정산 담당'), gte(auditLog.at, started)));
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
const find = () => findRoute(new Request(`http://test.local/api/agit/posts?payDate=${PAY}&kind=${encodeURIComponent(AGIT_PASSTHRU_KIND)}`));
async function settled(id: string) {
  for (let i = 0; i < 100; i++) {
    const post = await repo.getAgitPost(admin, id);
    if (post && post.status !== 'sending') return post;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`올리기가 끝나지 않았다 — ${id}`);
}

describe('플러그링크 패스스루 집행 글 (한백 2026-11-28)', () => {
  it('엑셀로 짓는 초안 → 25일 알림 → 승인 → 긴급구매요청으로 올림 · 대화에 한 줄 · 할 일 끝 · zip · 다시는 again', async () => {
    await signIn(USERS.admin);
    await repo.saveAgitAssignees({ assignees: 'kiko.x' }, admin);
    await repo.saveAgitSession({ login: 'kiko.x', cookies: web.cookies() }, admin);

    /* 초안 — 재료가 줄에 남는다 · 같은 것을 또 지으면 그대로 · 입금 예정일을 주면 고친다 */
    const made = await draftAgitPassthruPost(admin, ask(), reader);
    expect(reads).toEqual([{ file: SHEET, round: null }]);
    expect(made.plan).toBe('create');
    expect(made.post).toMatchObject({
      payDate: PAY, kind: AGIT_PASSTHRU_KIND, status: 'draft', urgent: PASSTHRU_URGENT_REASON, total: 1_300_000, batches: 2,
      title: '플러그링크 마더EPC HB98차 (패스스루) 집행', fee: null,
    });
    expect(made.post.passthru).toEqual({
      round: 98, month: MONTH, receive: 2_400_000, inDate: null, rows: READ.rows, sheet: SHEET, attach: [INV, CONTRACT],
    });
    expect(made.post.body).toContain('> *- 입금 예정일 미정*');
    expect((await draftAgitPassthruPost(admin, ask(), reader)).plan).toBe('keep');
    const dated = await draftAgitPassthruPost(admin, ask({ inDate: '2098-03-26' }), reader);
    expect(dated.plan).toBe('refresh');
    expect(dated.post.id).toBe(made.post.id);
    expect(dated.post.body).toContain('> *- 2098년 3월 26일 수요일 입금 예정*');
    /* 한백사업내역리스트를 첨부로도 고르면 짓지 않는다(내부 장부) · 지급일을 못 읽었으면 묻는다 */
    await expect(draftAgitPassthruPost(admin, ask({ attach: [SHEET] }), reader)).rejects.toThrow('첨부에서 빼 주세요');
    await expect(draftAgitPassthruPost(admin, ask(), async () => ({ ...READ, payDate: null }))).rejects.toThrow('지급일이 없습니다');

    /* Claude Code 의 예비 길도 찾는다 */
    const found = await (await find()).json() as { posts: Array<{ post: { id: string }; template: string }>; missing: string[] };
    expect(found.posts.map((p) => [p.post.id, p.template])).toEqual([[made.post.id, '긴급구매요청']]);
    expect(found.missing).toEqual([]);

    /* 25일 상신 알림 — 그날 아침 크론이 할 일 · 대화 한 줄 · 알림을 한 번 남긴다(다시 돌아도 하나) */
    const ran = await runAgentReminders(new Date(`${REMIND_ON}T00:00:00Z`));
    expect(ran).toEqual({ day: REMIND_ON, due: [`${MONTH} 패스스루`], reminded: [`${MONTH} 패스스루`], drafted: [] });
    expect((await runAgentReminders(new Date(`${REMIND_ON}T03:00:00Z`))).reminded).toEqual([]);
    const remindTask = async () => (await getDb().select({ title: agentTasks.title, due: agentTasks.due, doneAt: agentTasks.doneAt })
      .from(agentTasks).where(and(eq(agentTasks.agentId, 'settlement'), eq(agentTasks.kind, KEY))));
    expect(await remindTask()).toEqual([{ title: '패스스루 집행 상신 — 98년 3월', due: REMIND_ON, doneAt: null }]);
    expect(await getDb().select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.agentId, 'settlement'), like(notifications.title, '패스스루 집행 상신 — 98년 3월%')))).toHaveLength(1);

    /* 승인 — 재료로 다시 지어 본 글과 같으면 올린다 · 플러그링크 계좌(위탁운영수수료 글의 것)는 묻지 않는다 · 엑셀 캡처 하나 */
    expect((await repo.getAgitHook(admin)).feePayee).toBeNull();
    renders.length = 0;
    const blob = vi.fn(async () => new Response(PDF));
    vi.stubGlobal('fetch', blob);
    const go = await publish([{ id: made.post.id, seen: dated.post.body }]);
    expect(go.status).toBe(200);
    const done = await settled(made.post.id);
    expect(done).toMatchObject({ status: 'posted', agitUrl: 'https://team-hanbaek.agit.io/g/1/wall/88', assignees: ['kiko.x'] });
    expect(web.posts).toHaveLength(1);
    expect(web.posts[0]).toMatchObject({ template: '긴급구매요청', text: dated.post.body, title: dated.post.title, noCc: false });
    expect((web.posts[0].zip as { name: string }).name).toBe('HB98차 (패스스루)_98년 3월.zip');
    expect((web.posts[0].png as { name: string }).name).toBe('플러그링크 Mother EPC 98년 3월 하도급 지급요청_980327.png');
    expect(renders).toEqual([[]]);

    /* 대화에 한 줄 — 지급 건수 · 공급가액 · 거래명세서 고리 없이 */
    const auto = await getDb().select({ body: agentMessages.body, meta: agentMessages.meta }).from(agentMessages)
      .where(and(eq(agentMessages.agentId, 'settlement'), like(agentMessages.body, '3월 27일 패스스루 열린구매%')));
    expect(auto).toHaveLength(1);
    expect(auto[0].body).toContain('긴급 글을 아지트에 올렸습니다 — 지급 2건 · 공급가액 1,300,000원');
    expect(auto[0].body).not.toContain('남은 글');
    expect(auto[0].meta).not.toHaveProperty('link');
    /* 올렸으니 그 달의 25일 상신 할 일이 저절로 끝났고, 크론은 다시 알리지 않는다 */
    expect((await remindTask())[0].doneAt).not.toBeNull();
    /* 알림의 흔적(대화의 그 줄)을 걷어도 — 그 달의 글을 올렸으니 다시 알리지 않는다(26일은 위탁운영수수료 알림 날이라 같은 25일로 본다) */
    await getDb().delete(agentMessages).where(and(eq(agentMessages.agentId, 'settlement'), sql`${agentMessages.meta}->>'remind' = ${KEY}`));
    expect(await runAgentReminders(new Date(`${REMIND_ON}T05:00:00Z`))).toEqual({
      day: REMIND_ON, due: [`${MONTH} 패스스루`], reminded: [], drafted: [],
    });

    /* 첨부 zip — 엑셀 · 넘긴 증빙(폴더 없이) · 한백사업내역리스트는 안 든다 */
    const res = await getFiles(new Request(`http://test.local/api/agit/posts/${made.post.id}/files`), { params: { id: made.post.id } });
    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      '플러그링크 Mother EPC 98년 3월 하도급 지급요청_980327.xlsx', INV.name, CONTRACT.name,
    ].sort());

    /* 다시는 again 으로만 */
    await expect(draftAgitPassthruPost(admin, ask(), reader)).rejects.toThrow('이미 아지트에 올린');
    const again = await draftAgitPassthruPost(admin, ask({ again: true }), reader);
    expect(again.plan).toBe('create');
    expect(again.post).toMatchObject({ again: true, status: 'draft' });
  });
});

/**
 * 정산 담당이 아지트에 올린다 — 승인부터 「올림」까지. [서버 전용]
 * (한백 2026-11-10 「꼭 클로드 코드에서 해야해? 에이전트는 못해?」 → 「에이전트가 직접 하게끔 하고싶어」)
 *
 * 승인은 둘이다 — 카드의 「승인하고 올리기」(app/api/agit/publish)와 대화에서 한백이 「○월 ○일 열린구매 올려」라고 했을 때 정산 담당의
 * agit_publish(답 라우트가 같은 라우트를 한백의 로그인으로 부른다 · requestAgitPublish). 같은 길이다:
 *   1. 시작(claimAgitForPosting) — ★그때 금액으로 다시 짓고 한백이 본 초안(seen)과 다르면 올리지 않는다★: 초안을 지금 글로 고쳐 두고
 *      AgitChanged(카드가 새 글로 다시 그려지고 한백이 보고 다시 승인한다 · 11-05 상신 알림 뒤 같은 날 대당 +10만으로 금액이 바뀐 일).
 *      같으면 결제일 · 구분 잠금 안에서 「올리는 중」(두 번 올리지 않게).
 *   2. 응답 뒤에(lib/background — Vercel waitUntil · 라우트 maxDuration 300초) 차례로 — 첨부 zip(구매요청간소화 엑셀 · 캡처 · 거래명세서 PDF ·
 *      세금계산서 — 받기 단추와 같은 zip)을 짓고 → 한백의 아지트 로그인(연결 · store/agit agitSessionFor)으로 서버 브라우저가 쓰는 칸을 채워
 *      「작성하기」(lib/agit/agit-web) → 새 글 주소로 「올림」(store/agit finishAgitPost — 상신 할 일 · 대화의 한 줄). 한 번에 여러 글이면
 *      ★하나씩 차례로★(같은 계정의 쓰는 칸을 둘이 같이 채우지 않게 · 영업비 먼저).
 *   못 올리면 까닭을 남겨 「못 올림」 — ★「작성하기」를 누른 뒤에 멈췄으면 까닭 머리에 「아지트에 올라갔는지 먼저 확인」★(두 번 올리지 않게).
 *   아지트가 로그인 화면으로 보내면 연결을 「풀림」으로 적는다(카드 · 연결 줄이 「다시 연결」을 말한다).
 * 거래명세서 PDF 는 승인한 한백의 콘솔 로그인(그 요청의 쿠키)으로 서버 브라우저가 그 화면을 인쇄한다(lib/agit/statement-pdf).
 */
import { getRepository } from '@/lib/data';
import { background } from '@/lib/background';
import { isUnexpectedError } from '@/lib/api/errors';
import type { Actor } from '@/lib/data/repository';
import { agitBundleOf } from './bundle';
import { agitFilesOf, fetchOurBlob } from './bundle-zip';
import { agitWallOf } from './editor-doc';
import { loadAgitBundleInput, loadAgitDraft, loadAgitKinds } from './load';
import { agitTemplateOf, type AgitPostRecord } from './post';
import { renderAgitFiles } from './statement-pdf';
import { AgitSignedOut, type ComposeCheck } from './compose';
import { postAsHanbaek } from './agit-web';

/** 초안 뒤에 금액이나 내용이 바뀌었다 — 초안은 지금 글로 고쳐 두었다(올리지 않았다) */
export class AgitChanged extends Error {
  constructor() {
    super('초안 뒤에 금액이나 내용이 바뀌었습니다 — 고친 글을 보고 다시 승인해 주세요.');
    this.name = 'AgitChanged';
  }
}

/** 승인한 그 요청 — 거래명세서를 그 로그인으로 인쇄한다 */
export interface PublishContext {
  origin: string;
  cookie: string | null;
  /**
   * 시험 표시(첫 줄 끝) · 긴급 글의 cc 멘션 빼기 — 시험 글에만(한백 「Skip the finance mention」). noCc 를 빼면 올릴 때는 넣고(false)
   * 시험(dry)에서는 뺀다(true)
   */
  mark?: string | null;
  noCc?: boolean;
}

/**
 * 올리기 시작 — 지금 금액으로 다시 지어 본 글(seen)과 같으면 「올리는 중」으로 세우고 쓸 글 · 글양식 · 요청 담당을 준다. 다르면 초안을
 * 고쳐 두고 AgitChanged. 이미 올린 글 · 올리는 중 · 요청 담당 미지정 · 지급 0건은 사람 말로 던진다.
 */
export async function claimAgitForPosting(actor: Actor, id: string, seen: string): Promise<{
  post: AgitPostRecord; template: string; assignees: string[];
}> {
  const repo = getRepository();
  const post = await repo.getAgitPost(actor, id);
  if (!post) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
  if (post.status === 'posted') throw new Error('이미 아지트에 올린 글입니다.');
  const { assignees } = await repo.getAgitHook(actor);
  if (assignees.length === 0) throw new Error('아지트 요청 담당 미지정 — 「요청 담당」에서 아지트 ID 를 넣어 주세요.');
  const draft = await loadAgitDraft(actor, post.payDate, post.kind, post.urgent);
  if (draft.blocked) throw new Error(draft.blocked);
  if (draft.text !== seen) {
    /* 초안을 지금 글로 고쳐 둔다 — 카드가 새 글을 보이고 한백이 다시 승인한다 */
    await repo.draftAgitPost(
      {
        payDate: post.payDate, kind: post.kind, body: draft.text, total: draft.total, batches: draft.batches, again: post.again, messageId: null,
        urgent: draft.urgent,
      },
      actor
    );
    throw new AgitChanged();
  }
  const claimed = await repo.claimAgitPost(
    { id: post.id, body: draft.text, total: draft.total, batches: draft.batches, assignees, urgent: draft.urgent },
    actor
  );
  return { post: claimed, template: agitTemplateOf(claimed.urgent), assignees: claimed.assignees };
}

/** 글 하나의 첨부 — zip 과 그 안의 캡처(구매 내역 그림) */
async function filesOf(actor: Actor, post: AgitPostRecord, ctx: PublishContext) {
  const { batches, payeeOf } = await loadAgitBundleInput(actor, post.payDate, post.kind);
  if (!batches.some((b) => b.org)) throw new Error(`그 결제일에 나갈 ${post.kind} 지급이 0건입니다 — 묶을 것이 없습니다.`);
  const plan = agitBundleOf(post.payDate, batches, payeeOf);
  const { zip, image } = await agitFilesOf(plan, {
    render: ({ paths, html }) => renderAgitFiles({ origin: ctx.origin, cookie: ctx.cookie, paths, html }),
    file: (url) => fetchOurBlob(url),
  });
  return { zip: { bytes: zip, name: plan.zipName }, png: { bytes: image, name: plan.imageName } };
}

/** 「올리는 중」인 글 하나를 끝까지 — 올림이든 못 올림이든 꼭 남긴다 */
async function runOne(actor: Actor, claimed: { post: AgitPostRecord; template: string; assignees: string[] }, ctx: PublishContext): Promise<void> {
  const repo = getRepository();
  const { post } = claimed;
  const startedAt = Date.now();
  let submitted = false;
  let sessionAt: Date | null = null;
  try {
    const session = await repo.agitSessionFor(actor);
    sessionAt = session.at;
    const files = await filesOf(actor, post, ctx);
    const out = await postAsHanbaek({
      cookies: session.cookies, template: claimed.template, assignees: claimed.assignees, text: post.body, title: post.title,
      png: files.png, zip: files.zip, mark: ctx.mark ?? null, noCc: ctx.noCc ?? false, startedAt,
      onSubmit: () => { submitted = true; },
    });
    if (out.dry) throw new Error('시험이 아닌데 올리지 않았습니다.');
    await repo.touchAgitSession({ cookies: out.cookies, at: session.at }, actor).catch((e) => {
      console.error('[agit] 로그인 쿠키를 새로 쥐지 못함', e instanceof Error ? e.message : String(e));
    });
    const wall = agitWallOf(out.url);
    if (!wall) throw new Error(`올린 글 주소가 아지트 글 주소가 아닙니다 — ${out.url}`);
    const kinds = await loadAgitKinds(actor, post.payDate);
    await repo.finishAgitPost({ id: post.id, result: { ok: true, agitId: wall.id, agitUrl: wall.url }, kinds }, actor).catch((e) => {
      /* 아지트에는 올라갔다 — 주소를 로그에 남겨 손으로 적을 수 있게(카드는 6분 뒤 「멈춤」으로 다시 올리기를 연다) */
      console.error(`[agit] 아지트에는 올렸는데 콘솔에 남기지 못함 — ${wall.url}`, e instanceof Error ? e.message : String(e));
      throw e;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof AgitSignedOut && sessionAt) {
      await repo.expireAgitSession({ why: message, at: sessionAt }, actor).catch(() => undefined);
    }
    const why = `${submitted ? '「작성하기」를 누른 뒤 멈춤 — 아지트에 올라갔는지 먼저 확인 · ' : ''}${message}`;
    /* 감시가 본다 — 아지트 화면이 바뀌어 고르개가 어긋난 것도 여기로 온다 */
    console.error(`[agit] 아지트 글 못 올림 ${post.id}`, why);
    await repo.finishAgitPost({ id: post.id, result: { ok: false, error: why.slice(0, 480) } }, actor).catch(() => undefined);
  }
}

export interface PublishResult {
  /** 올리기 시작한 글 — 「올리는 중」 */
  started: AgitPostRecord[];
  /** 시작하지 못한 글 — 까닭(changed 면 초안을 고쳐 두었다) */
  skipped: Array<{ id: string; why: string; changed: boolean }>;
}

/**
 * 승인 — 글마다 시작하고(차례대로) 시작한 글들을 응답 뒤에 하나씩 올린다. 연결이 없으면 아무것도 시작하지 않고 던진다.
 * posts 의 seen 은 한백이 본 글(카드 · 대화의 초안 그대로).
 */
export async function startAgitPublish(actor: Actor, posts: Array<{ id: string; seen: string }>, ctx: PublishContext): Promise<PublishResult> {
  const repo = getRepository();
  /* 연결이 없거나 풀렸으면 시작하지 않는다 — 「올리는 중」으로 세웠다가 곧 「못 올림」이 되지 않게 */
  await repo.agitSessionFor(actor);
  const started: Array<{ post: AgitPostRecord; template: string; assignees: string[] }> = [];
  const skipped: PublishResult['skipped'] = [];
  for (const p of posts) {
    try {
      started.push(await claimAgitForPosting(actor, p.id, p.seen));
    } catch (e) {
      if (isUnexpectedError(e) && !(e instanceof AgitChanged)) throw e;
      skipped.push({ id: p.id, why: e instanceof Error ? e.message : String(e), changed: e instanceof AgitChanged });
    }
  }
  if (started.length) {
    background((async () => {
      for (const c of started) await runOne(actor, c, ctx);
    })(), `아지트 올리기 ${started.map((c) => c.post.id).join(', ')}`);
  }
  return { started: started.map((c) => c.post), skipped };
}

/**
 * 시험 — 쓰는 칸까지만 채워 보고 화면을 찍는다(올리지 않는다 · 「올리는 중」으로 세우지 않는다 · 쓰는 칸은 비운다). 관리자가 연결과 쓰는
 * 칸을 대 볼 때(app/api/agit/publish {dry}).
 */
export async function dryAgitPublish(actor: Actor, id: string, ctx: PublishContext): Promise<{ check: ComposeCheck; shot: string }> {
  const repo = getRepository();
  const post = await repo.getAgitPost(actor, id);
  if (!post) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
  const { assignees } = await repo.getAgitHook(actor);
  if (assignees.length === 0) throw new Error('아지트 요청 담당 미지정 — 「요청 담당」에서 아지트 ID 를 넣어 주세요.');
  const draft = await loadAgitDraft(actor, post.payDate, post.kind, post.urgent);
  if (draft.blocked) throw new Error(draft.blocked);
  const session = await repo.agitSessionFor(actor);
  const files = await filesOf(actor, post, ctx);
  try {
    const out = await postAsHanbaek({
      cookies: session.cookies, template: agitTemplateOf(draft.urgent), assignees, text: draft.text, title: post.title,
      png: files.png, zip: files.zip, mark: ctx.mark ?? null, noCc: ctx.noCc ?? true, dry: true,
    });
    if (!out.dry) throw new Error('시험인데 올렸습니다.');
    await repo.touchAgitSession({ cookies: out.cookies, at: session.at }, actor).catch(() => undefined);
    return { check: out.check, shot: Buffer.from(out.shot).toString('base64') };
  } catch (e) {
    if (e instanceof AgitSignedOut) await repo.expireAgitSession({ why: e.message, at: session.at }, actor).catch(() => undefined);
    throw e;
  }
}

/**
 * 답 라우트(정산 담당의 agit_publish)가 승인 라우트를 한백의 로그인으로 부른다 — 서버 브라우저는 그 라우트(크로미움을 실은 함수)에서만 띄운다.
 * 프리뷰는 Vercel 배포 보호가 막아 자동화 우회 열쇠를 단다(거래명세서 PDF 와 같다).
 */
export async function requestAgitPublish(
  ctx: { origin: string; cookie: string | null },
  posts: Array<{ id: string; seen: string }>,
  fetcher: typeof fetch = fetch
): Promise<PublishResult & { error?: string }> {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const res = await fetcher(new URL('/api/agit/publish', ctx.origin), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ctx.cookie ? { cookie: ctx.cookie } : {}),
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    },
    body: JSON.stringify({ posts }),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<PublishResult> & { error?: string };
  if (!res.ok) return { started: [], skipped: [], error: json.error ?? `올리기를 시작하지 못했습니다(${res.status}).` };
  return { started: json.started ?? [], skipped: json.skipped ?? [] };
}

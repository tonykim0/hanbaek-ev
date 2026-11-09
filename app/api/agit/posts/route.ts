/**
 * GET /api/agit/posts?payDate=YYYY-MM-DD[&kind=영업비|시공비] — 그 결제일의 아직 안 올린 아지트 글(초안 · 못 올림 · 올리는 중)과 요청 담당
 * [한백 관리자]. (한백 2026-11-09 「Claude Code posts it」) — 한백이 Claude Code 에 「○월 ○일 열린구매 올려」라고 하면 scripts/agit-post.ts 가
 * 한백의 콘솔 로그인으로 이것을 읽어 어느 초안을 올릴지 찾는다.
 *
 * 글은 결제일 × 구분(영업비 · 시공비)마다 하나다(한백 같은 날 「seperate post … 영업위탁수수료 -> 시공비」) — posts 는 구분마다 하나씩 영업비
 * 먼저. missing 은 그날 나가는 구분인데 안 올린 초안도 올린 글도 없는 것 — 정산 담당에게 그 초안을 올려 달라고 한다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { isUnexpectedError } from '@/lib/api/errors';
import { agitKindOf, agitTemplateOf } from '@/lib/agit/post';
import { loadAgitKinds } from '@/lib/agit/load';

export const dynamic = 'force-dynamic';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) return fail('아지트 글은 한백 관리자만 봅니다.', 403);
  const q = new URL(request.url).searchParams;
  const payDate = q.get('payDate') ?? '';
  if (!DAY_RE.test(payDate)) return fail('결제일은 YYYY-MM-DD 로 주세요.', 400);
  const only = q.get('kind');
  if (only !== null && only !== '영업비' && only !== '시공비') return fail('구분은 영업비 · 시공비 중 하나입니다.', 400);
  try {
    const actor = actorOf(session);
    const repo = getRepository();
    const open = (await repo.openAgitPosts(actor, payDate)).filter((p) => !only || p.kind === agitKindOf(only));
    const hook = await repo.getAgitHook(actor);
    /* 나가는 구분 중 초안이 없는 것 — 올린 글이 있으면 빠진 게 아니다 */
    const kinds = (await loadAgitKinds(actor, payDate)).filter((k) => !only || k === only);
    const posted = await repo.postedAgitKinds(actor, payDate);
    const missing = kinds.filter((k) => !open.some((p) => p.kind === k) && !posted.includes(k));
    return NextResponse.json({
      posts: open.map((post) => ({ post, template: agitTemplateOf(post.urgent) })),
      missing,
      assignees: hook.assignees,
    });
  } catch (e) {
    if (isUnexpectedError(e)) {
      console.error('[api] 아지트 글 찾기', e instanceof Error ? e.message : String(e));
      return fail('아지트 글을 읽지 못했습니다.', 500);
    }
    return fail(e instanceof Error ? e.message : '아지트 글을 읽지 못했습니다.', 422);
  }
}

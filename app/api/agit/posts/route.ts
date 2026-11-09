/**
 * GET /api/agit/posts?payDate=YYYY-MM-DD — 그 결제일의 아직 안 올린 아지트 글(초안 · 못 올림 · 올리는 중)과 요청 담당 [한백 관리자].
 * (한백 2026-11-09 「Claude Code posts it」) — 한백이 Claude Code 에 「○월 ○일 열린구매 올려」라고 하면 scripts/agit-post.ts 가 한백의
 * 콘솔 로그인으로 이것을 읽어 어느 초안을 올릴지 찾는다. 글이 없으면 post 가 null — 정산 담당에게 초안을 올려 달라고 한다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { isUnexpectedError } from '@/lib/api/errors';
import { agitTemplateOf } from '@/lib/agit/post';

export const dynamic = 'force-dynamic';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  const session = await requireAdmin();
  if (!session) return fail('아지트 글은 한백 관리자만 봅니다.', 403);
  const payDate = new URL(request.url).searchParams.get('payDate') ?? '';
  if (!DAY_RE.test(payDate)) return fail('결제일은 YYYY-MM-DD 로 주세요.', 400);
  try {
    const actor = actorOf(session);
    const repo = getRepository();
    const [post, hook] = [await repo.openAgitPost(actor, payDate), await repo.getAgitHook(actor)];
    return NextResponse.json({ post, template: post ? agitTemplateOf(post.urgent) : null, assignees: hook.assignees });
  } catch (e) {
    if (isUnexpectedError(e)) {
      console.error('[api] 아지트 글 찾기', e instanceof Error ? e.message : String(e));
      return fail('아지트 글을 읽지 못했습니다.', 500);
    }
    return fail(e instanceof Error ? e.message : '아지트 글을 읽지 못했습니다.', 422);
  }
}

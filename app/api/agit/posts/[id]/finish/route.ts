/**
 * POST /api/agit/posts/[id]/finish { ok, url?, error? } — Claude Code 가 아지트에 다 올린 뒤(또는 못 올렸을 때) 남긴다 [한백 관리자].
 * (한백 2026-11-09 「Claude Code posts it」 — scripts/agit-post.ts 가 한백의 콘솔 로그인으로 부른다)
 *
 * 올렸으면 그 글의 아지트 주소(https://<팀>.agit.io/g/<그룹>/wall/<글>)를 받아 「올림」으로 세운다 — 카드의 「아지트에서 보기」 · 정산 담당의 그
 * 결제일 상신 할 일이 끝나고 대화에 「올렸습니다」 한 줄(store/agit finishAgitPost). 못 올렸으면 까닭을 남겨 「못 올림」 — 다시 시키면 다시 올린다.
 * 「올리는 중」(POST /api/agit/posts/[id])인 글만 받는다. ★상신 할 일은 그 결제일에 나가는 구분(영업비 · 시공비)의 글이 다 올라가야 끝난다★ —
 * 글은 구분마다 하나라 영업비 글만 올리면 시공비 글이 남는다.
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { agitWallOf } from '@/lib/agit/editor-doc';
import { loadAgitKinds } from '@/lib/agit/load';

export const POST = adminWrite<{ id: string }, { ok?: unknown; url?: unknown; error?: unknown }>(
  '아지트 글은 한백 관리자만 올릴 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.ok !== 'boolean') throw new BadRequest('올렸는지(ok)가 없습니다.');
    const repo = getRepository();
    if (body.ok) {
      const wall = typeof body.url === 'string' ? agitWallOf(body.url) : null;
      if (!wall) throw new BadRequest('아지트 글 주소가 아닙니다 — https://….agit.io/g/<그룹>/wall/<글>');
      const post = await repo.getAgitPost(actor, params.id);
      if (!post) throw new Error('올린 글을 찾을 수 없습니다.');
      const kinds = await loadAgitKinds(actor, post.payDate);
      return {
        post: await repo.finishAgitPost({ id: params.id, result: { ok: true, agitId: wall.id, agitUrl: wall.url }, kinds }, actor),
      };
    }
    const error = typeof body.error === 'string' && body.error.trim() ? body.error.trim() : '까닭을 남기지 않았습니다.';
    return { post: await repo.finishAgitPost({ id: params.id, result: { ok: false, error } }, actor) };
  }
);

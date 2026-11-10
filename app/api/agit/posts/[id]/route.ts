/**
 * POST /api/agit/posts/[id] { seen } — 아지트에 올리기 시작 [한백 관리자 — ★예비 길★: Claude Code 가 한백의 맥에서 부른다(scripts/agit-post.ts)].
 * (한백 2026-11-09 「Claude Code posts it」 → 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — 이제 보통은 콘솔이 한백의 아지트 계정으로 올린다:
 *  app/api/agit/publish. 이 라우트는 콘솔이 못 올릴 때(아지트가 서버 로그인을 막는 날 따위) 맥에서 올리는 길의 앞이다)
 *
 * 본 글(seen)을 받아 ★지금 금액으로 다시 짓고 다르면 올리지 않는다★ — 초안을 지금 글로 고쳐 두고 422. 같으면 결제일 · 구분 잠금 안에서
 * 「올리는 중」으로 세우고 쓸 글 · 글양식 · 요청 담당을 준다(lib/agit/publish claimAgitForPosting — 콘솔이 올릴 때와 같은 문).
 * 첨부 zip 은 …/files, 다 올린 뒤의 아지트 주소(또는 못 올린 까닭)는 …/finish 가 남긴다.
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { claimAgitForPosting } from '@/lib/agit/publish';

export const POST = adminWrite<{ id: string }, { seen?: unknown }>(
  '아지트 글은 한백 관리자만 올릴 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.seen !== 'string') throw new BadRequest('본 글이 없습니다.');
    return claimAgitForPosting(actor, params.id, body.seen);
  }
);

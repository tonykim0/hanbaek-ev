/**
 * POST /api/agit/posts/[id] { seen } — 아지트에 올리기 시작 [한백 관리자 — Claude Code 가 한백의 콘솔 로그인으로 부른다].
 * (한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면 … 아지트에 글을 올리는 구조」 → 2026-11-09
 *  「evcharging bot으로 올리니까 내가 내용수정도 안되고, 첨부파일은 링크가 아니라 첨부파일로 꼭 올려야 할 것 같아」 → 「Claude Code posts it」)
 *
 * ★아지트 글은 Claude Code 가 한백의 아지트 계정으로 쓴다★(scripts/agit-post.ts) — 봇(그룹 웹훅) 글은 한백이 고칠 수 없고 파일을 못 붙였다.
 * 콘솔은 그 앞뒤만 한다. 이 라우트가 앞: 본 글(seen — 한백이 카드에서 본 초안)을 받아 ★지금 금액으로 다시 짓고(lib/agit/load) 다르면 올리지
 * 않는다★ — 초안을 지금 글로 고쳐 두고 422(카드가 새 글로 다시 그려지고 한백이 보고 다시 시킨다). 같으면 결제일 잠금 안에서 「올리는 중」으로
 * 세우고(두 번 올리지 않게) 쓸 글 · 글양식(구매요청간소화 · 긴급구매요청) · 요청 담당(「요청 담당」에 정해 둔 아지트 ID)을 준다.
 * 첨부 zip(엑셀 · 캡처 · 거래명세서 · 계산서)은 …/files, 다 올린 뒤의 아지트 주소(또는 못 올린 까닭)는 …/finish 가 남긴다.
 * 긴급 글은 줄의 긴급사유로, 시공비 글은 시공비 배치로 다시 지어 견준다(모양이 같아야 견준다 — 글은 결제일 × 구분마다 하나).
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { loadAgitDraft } from '@/lib/agit/load';
import { agitTemplateOf } from '@/lib/agit/post';

export const POST = adminWrite<{ id: string }, { seen?: unknown }>(
  '아지트 글은 한백 관리자만 올릴 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.seen !== 'string') throw new BadRequest('본 글이 없습니다.');
    const repo = getRepository();
    const post = await repo.getAgitPost(actor, params.id);
    if (!post) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
    if (post.status === 'posted') throw new Error('이미 아지트에 올린 글입니다.');
    const { assignees } = await repo.getAgitHook(actor);
    if (assignees.length === 0) throw new Error('아지트 요청 담당 미지정 — 「요청 담당」에서 아지트 ID 를 넣어 주세요.');
    const draft = await loadAgitDraft(actor, post.payDate, post.kind, post.urgent);
    if (draft.blocked) throw new Error(draft.blocked);
    if (draft.text !== body.seen) {
      /* 초안을 지금 글로 고쳐 둔다 — 카드가 새 글을 보이고 한백이 다시 시킨다 */
      await repo.draftAgitPost(
        {
          payDate: post.payDate, kind: post.kind, body: draft.text, total: draft.total, batches: draft.batches, again: post.again, messageId: null,
          urgent: draft.urgent,
        },
        actor
      );
      throw new Error('초안 뒤에 금액이나 내용이 바뀌었습니다 — 고친 글을 보고 다시 시켜 주세요.');
    }
    const claimed = await repo.claimAgitPost(
      { id: post.id, body: draft.text, total: draft.total, batches: draft.batches, assignees, urgent: draft.urgent },
      actor
    );
    return { post: claimed, template: agitTemplateOf(claimed.urgent), assignees: claimed.assignees };
  }
);

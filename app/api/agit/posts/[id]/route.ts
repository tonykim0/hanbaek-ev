/**
 * POST /api/agit/posts/[id] { seen } — 「승인하고 올리기」 [한백 관리자]. 정산 담당이 올린 아지트 열린구매 글 초안을 아지트에 올린다.
 * (한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면 정산담당에이전트가 아지트에 글을 올리는 구조」)
 *
 * ★아지트에 글이 서는 문은 이것 하나다★ — 담당은 초안까지만 올린다(lib/agents/brain agit_post · 크론 lib/agents/remind-run).
 * 한백이 카드에서 본 글(seen)을 싣는다. ★여기서 콘솔의 지금 금액으로 글을 다시 짓고(lib/agit/load) 본 글과 다르면 올리지 않는다★ —
 * 초안을 지금 글로 고쳐 두고 422 를 낸다(카드가 새 글로 다시 그려지고 한백이 다시 승인한다). 요청 글로 올리며 연결 줄의 담당자를
 * 붙인다 — 담당자가 비었으면 올리지 않는다. 아지트가 받지 않으면 200 에 「못 올림」 줄이 온다 — 그 까닭이 카드에 뜨고 다시 승인한다.
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { loadAgitDraft } from '@/lib/agit/load';
import { sendToAgit } from '@/lib/agit/send';
import { agitPayloadOf } from '@/lib/agit/post';

export const maxDuration = 60;

export const POST = adminWrite<{ id: string }, { seen?: unknown }>(
  '아지트 글은 한백 관리자만 올릴 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.seen !== 'string') throw new BadRequest('본 글이 없습니다.');
    const repo = getRepository();
    const post = await repo.getAgitPost(actor, params.id);
    if (!post) throw new Error('아지트 글 초안을 찾을 수 없습니다.');
    if (post.status === 'posted') throw new Error('이미 아지트에 올린 글입니다.');
    const hook = await repo.agitHookFor(actor);
    if (hook.assignees.length === 0) throw new Error('아지트 요청 담당 미지정 — 「요청 담당」에서 아지트 ID 를 넣어 주세요.');
    const draft = await loadAgitDraft(actor, post.payDate);
    if (draft.blocked) throw new Error(draft.blocked);
    if (draft.text !== body.seen) {
      /* 초안을 지금 글로 고쳐 둔다 — 카드가 새 글을 보이고 한백이 다시 승인한다 */
      await repo.draftAgitPost(
        { payDate: post.payDate, body: draft.text, total: draft.total, batches: draft.batches, again: post.again, messageId: null },
        actor
      );
      throw new Error('초안 뒤에 금액이나 내용이 바뀌었습니다 — 고친 글을 보고 다시 승인해 주세요.');
    }
    const claimed = await repo.claimAgitPost(
      { id: post.id, body: draft.text, total: draft.total, batches: draft.batches, assignees: hook.assignees },
      actor
    );
    const result = await sendToAgit(hook.url, agitPayloadOf(claimed.body, claimed.assignees));
    return { post: await repo.finishAgitPost({ id: claimed.id, result }, actor) };
  }
);

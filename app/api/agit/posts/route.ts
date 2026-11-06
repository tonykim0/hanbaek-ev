/**
 * POST /api/agit/posts { payDate, seen, again? } — 결제일 하나의 열린구매 글을 아지트에 올린다 [한백 관리자]
 *
 * 한백이 거래명세서 화면에서 미리 본 글(seen)을 싣는다. ★여기서 콘솔의 지금 금액으로 글을 다시 짓고(lib/agit/load) 미리 본 글과
 * 다르면 올리지 않는다★ — 미리보기 뒤에 금액 · 계산서 · 계좌가 바뀌었으면 한백이 새 글을 보고 다시 누른다(422 — 화면이 새로 그린다).
 * 이미 올린 결제일은 again 이 있어야 다시 올린다(store/agit claimAgitPost). 아지트가 받지 않으면 200 에 「못 올림」 줄이 온다 —
 * 그 까닭이 단추 옆에 뜨고 다시 누르면 된다(메일 보내기와 같은 모양).
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { loadAgitDraft } from '@/lib/agit/load';
import { sendToAgit } from '@/lib/agit/send';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const maxDuration = 60;

export const POST = adminWrite<Record<string, never>, { payDate?: unknown; seen?: unknown; again?: unknown }>(
  '아지트 글은 한백 관리자만 올릴 수 있습니다.',
  async ({ body, actor }) => {
    if (typeof body?.payDate !== 'string' || !DAY_RE.test(body.payDate)) throw new BadRequest('결제일이 YYYY-MM-DD 가 아닙니다.');
    if (typeof body.seen !== 'string') throw new BadRequest('미리 본 글이 없습니다.');
    if (body.again !== undefined && typeof body.again !== 'boolean') throw new BadRequest('again 은 참/거짓이어야 합니다.');
    const repo = getRepository();
    const hook = await repo.agitHookUrl(actor);
    const draft = await loadAgitDraft(actor, body.payDate);
    if (draft.blocked) throw new Error(draft.blocked);
    if (draft.text !== body.seen) throw new Error('미리 본 뒤에 금액이나 내용이 바뀌었습니다 — 새 글을 보고 다시 올려 주세요.');
    const { id } = await repo.claimAgitPost(
      { payDate: draft.payDate, body: draft.text, total: draft.total, batches: draft.batches, again: body.again === true },
      actor
    );
    const result = await sendToAgit(hook, draft.text);
    return { post: await repo.finishAgitPost({ id, result }, actor) };
  }
);

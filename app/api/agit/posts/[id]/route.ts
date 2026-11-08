/**
 * POST /api/agit/posts/[id] { seen } — 「승인하고 올리기」 [한백 관리자]. 정산 담당이 올린 아지트 열린구매 글 초안을 아지트에 올린다.
 * (한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면 정산담당에이전트가 아지트에 글을 올리는 구조」)
 *
 * ★아지트에 글이 서는 문은 이것 하나다★ — 담당은 초안까지만 올린다(lib/agents/brain agit_post · 크론 lib/agents/remind-run).
 * 한백이 카드에서 본 글(seen)을 싣는다. ★여기서 콘솔의 지금 금액으로 글을 다시 짓고(lib/agit/load) 본 글과 다르면 올리지 않는다★ —
 * 초안을 지금 글로 고쳐 두고 422 를 낸다(카드가 새 글로 다시 그려지고 한백이 다시 승인한다). 요청 글로 올리며 연결 줄의 담당자를
 * 붙인다 — 담당자가 비었으면 올리지 않는다. 아지트가 받지 않으면 200 에 「못 올림」 줄이 온다 — 그 까닭이 카드에 뜨고 다시 승인한다.
 *
 * ★엑셀 캡처 · 첨부 zip 을 이때 짓고 올린다★(한백 2026-11-09 「앞으로 계속 이런방식으로」 — 11/10 글을 손으로 맞춘 모양): 웹훅은 글자만
 * 받으므로, 지금 원장으로 구매요청간소화 엑셀 · 그 캡처 · 거래명세서 PDF · 세금계산서를 묶고(lib/agit/bundle-zip — 첨부 zip 받기와 같은 길),
 * 캡처와 zip 을 Blob 에 올려 글의 「구매 내역」 그림과 「첨부 파일」 고리 자리에 주소를 넣어 보낸다(lib/agit/post fillAgitFiles). 거래명세서는
 * 이 요청의 로그인으로 서버 브라우저가 인쇄한다 — 그래서 승인에 20초쯤 걸린다. 초안 · 견주기는 자리 글로 하고, 올린 뒤에만 주소가 든 글을
 * 남긴다(못 올렸으면 자리 글 그대로 — 다시 승인할 수 있게).
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { loadAgitBundleInput, loadAgitDraft } from '@/lib/agit/load';
import { sendToAgit } from '@/lib/agit/send';
import { agitPayloadOf, fillAgitFiles } from '@/lib/agit/post';
import { agitBundleOf } from '@/lib/agit/bundle';
import { agitFilesOf, fetchOurBlob, publishAgitFiles } from '@/lib/agit/bundle-zip';
import { renderAgitFiles } from '@/lib/agit/statement-pdf';

export const maxDuration = 60;

export const POST = adminWrite<{ id: string }, { seen?: unknown }>(
  '아지트 글은 한백 관리자만 올릴 수 있습니다.',
  async ({ params, body, actor, request }) => {
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
    /* 엑셀 캡처 · 첨부 zip — 지금 원장으로 짓고 Blob 에 올려 글의 자리에 주소를 넣는다 */
    const { batches, payeeOf } = await loadAgitBundleInput(actor, post.payDate);
    const plan = agitBundleOf(post.payDate, batches, payeeOf);
    const files = await agitFilesOf(plan, {
      render: ({ paths, html }) => renderAgitFiles({ origin: new URL(request.url).origin, cookie: request.headers.get('cookie'), paths, html }),
      file: (url) => fetchOurBlob(url),
    });
    const text = fillAgitFiles(draft.text, await publishAgitFiles(plan, files, post.payDate));
    const claimed = await repo.claimAgitPost(
      { id: post.id, body: draft.text, total: draft.total, batches: draft.batches, assignees: hook.assignees },
      actor
    );
    const result = await sendToAgit(hook.url, agitPayloadOf(text, claimed.assignees));
    return { post: await repo.finishAgitPost({ id: claimed.id, result, body: text }, actor) };
  }
);

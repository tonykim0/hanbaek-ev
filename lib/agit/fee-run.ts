/**
 * 위탁운영수수료 글 초안을 짓는다 — 정산 담당의 agit_fee_post(답 라우트의 손)가 부른다. [서버 전용]
 * (한백 2026-11-10 「이건은 내가 에이전트한테 세금계산서를 올려주고 너가 나머지를 처리해주는 방식으로 진행 필요」)
 *
 * 한백이 정산 담당 대화에 세금계산서 두 장(위탁운영수수료 · 충전매출)을 넘기면 담당이 어느 파일이 어느 것인지만 골라 부른다 → 콘솔이 두 장을 읽고
 * (lib/agit/fee-read) 가르고(lib/agit/fee feeInvoicesOf — 공급 방향 · 금액 셈 · 몇 월분) 글을 지어(agitFeePostOf) 초안으로 세운다(store/agit
 * draftAgitPost — 구분 「위탁운영수수료」 · 재료는 agit_posts.fee). 그 뒤는 열린구매 글과 같은 길이다: 카드의 「승인하고 올리기」 · 대화의
 * agit_publish → lib/agit/publish(재료로 다시 지어 본 글과 견주고 · 엑셀 · 캡처 · zip 을 짓고 · 한백의 아지트 계정으로 올린다).
 */
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/auth/types';
import { AGIT_FEE_KIND, type AgitPostRecord } from './post';
import {
  agitFeePostOf, feeInvoicesOf, feePayDateOf, feeRoundOf, type AgitFeeFile, type AgitFeeInput, type TaxInvoiceRead,
} from './fee';
import { readTaxInvoice } from './fee-read';

export interface FeeDraftRequest {
  /** 위탁운영수수료 세금계산서(플러그링크 → 한백) */
  feeFile: AgitFeeFile;
  /** 충전매출 세금계산서(한백 → 플러그링크) — 그 달에 없으면 null(글에서 충전매출 표가 빠진다) */
  salesFile: AgitFeeFile | null;
  /** 충전매출 입금 예정일 YYYY-MM-DD — 모르면 null(글에는 「입금 예정」만) */
  inDate: string | null;
  /** 몇 월분 YYYY-MM — 세금계산서에서 못 읽었을 때 · 한백이 말했을 때. 빼면 세금계산서의 달 */
  month: string | null;
  /** 지급 요청일 — 빼면 그 달 다음 달 말일(쉬는 날이면 앞 영업일) */
  payDate: string | null;
  /** 이미 올린 그 지급일의 글을 다시 올리는 초안 */
  again: boolean;
}

export async function draftAgitFeePost(
  actor: Actor,
  q: FeeDraftRequest,
  read: (file: AgitFeeFile) => Promise<TaxInvoiceRead> = readTaxInvoice
): Promise<{ post: AgitPostRecord; plan: 'create' | 'refresh' | 'keep'; input: AgitFeeInput }> {
  if (q.salesFile && q.salesFile.url === q.feeFile.url) {
    throw new Error('위탁운영수수료와 충전매출에 같은 파일을 골랐습니다 — 두 장을 따로 고릅니다.');
  }
  /* 두 장을 같이 읽는다(판독 — DB 가 아니다) */
  const [feeRead, salesRead] = await Promise.all([read(q.feeFile), q.salesFile ? read(q.salesFile) : Promise.resolve(null)]);
  const got = feeInvoicesOf(feeRead, salesRead, q.month);
  const payDate = q.payDate ?? feePayDateOf(got.month);
  const input: AgitFeeInput = {
    month: got.month,
    round: feeRoundOf(got.month),
    fee: { ...got.fee, file: q.feeFile },
    sales: got.sales ? { ...got.sales, inDate: q.inDate, file: q.salesFile } : null,
  };
  const draft = agitFeePostOf(payDate, input);
  const { post, plan } = await getRepository().draftAgitPost({
    payDate, kind: AGIT_FEE_KIND, body: draft.text, total: draft.total, batches: draft.batches, again: q.again, messageId: null,
    urgent: draft.urgent, fee: input,
  }, actor);
  return { post, plan, input };
}

/**
 * 아지트 글의 재료를 읽는다 (서버 전용) — 거래명세서 화면과 같은 정본(원장 줄 · 확정 · 계산서 · 협력사 정보)을 그때 읽어 짓는다.
 * 초안을 짓는 셋(상신 알림 크론 lib/agents/remind-run · 정산 담당의 agit_post · 답 라우트)과 승인하는 라우트(app/api/agit/posts/[id]
 * — 누르는 순간의 금액으로 다시 짓기)가 같이 부른다. 같은 재료면 같은 글이 나오고, 다르면 「금액이 바뀌었다」로 걸린다.
 * 첨부 zip(app/api/agit/posts/[id]/files)은 같은 배치에 지급처 계좌를 더해 엑셀을 짓는다.
 */
import { getRepository } from '@/lib/data';
import { today } from '@/lib/date';
import { normalizeOrg } from '@/lib/roles';
import { CONSOLE_URL } from '@/lib/portal-intake';
import { loadPartnerLines } from '@/lib/partner-lines';
import type { Actor } from '@/lib/auth/types';
import type { PartnerLine } from '@/lib/agents/brief';
import { agitBatchesOf, agitPostOf, urgentReasonOf, type AgitBatch, type AgitPayee, type AgitPostText } from './post';

/** 배치의 지급처 → 협력사 정보의 계좌 */
export const payeeOfMap = (partners: ReadonlyMap<string, PartnerLine>) =>
  (org: string | null): AgitPayee | undefined => {
    const key = normalizeOrg(org);
    return key ? partners.get(key) : undefined;
  };

async function ledger(actor: Actor) {
  const repo = getRepository();
  const [rows, finals, invoices] = await Promise.all([
    repo.listPayouts({ role: actor.role, org: actor.org }),
    repo.listBatchFinals(actor),
    repo.listTaxInvoices(actor),
  ]);
  return { rows, finals, invoices };
}

/**
 * 결제일 하나의 글 — 그날 배치가 없으면 지급 0건의 글(올릴 수 없음)이 온다. urgent(긴급사유)를 주면 긴급 글이다(lib/agit/post) —
 * 승인 때는 그 줄의 긴급사유로 다시 짓는다(같은 모양이어야 견줄 수 있다).
 */
export async function loadAgitDraft(actor: Actor, payDate: string, urgent: string | null = null): Promise<AgitPostText> {
  const { rows, finals, invoices } = await ledger(actor);
  return agitPostOf(payDate, agitBatchesOf(rows, finals, invoices, payDate), CONSOLE_URL, urgent);
}

/**
 * 초안을 지을 모양 — 긴급사유를 주면 그것(빈 글이면 보통 글로 되돌림), 안 주면(undefined) 그 결제일의 열린 초안의 모양을 그대로 둔다.
 * 크론이 아침에 다시 짓거나 한백이 「다시 지어 줘」라고만 할 때 긴급 글이 보통 글로 몰래 돌아가지 않게.
 */
export async function agitUrgentFor(actor: Actor, payDate: string, urgent: string | null | undefined): Promise<string | null> {
  if (urgent !== undefined) return urgentReasonOf(urgent);
  return (await getRepository().openAgitPost(actor, payDate))?.urgent ?? null;
}

/** 결제일 하나의 배치(계산서 파일 포함)와 지급처 계좌 — 첨부 zip 의 재료 */
export async function loadAgitBundleInput(actor: Actor, payDate: string): Promise<{
  batches: AgitBatch[];
  payeeOf: (org: string | null) => AgitPayee | undefined;
}> {
  const [{ rows, finals, invoices }, partners] = await Promise.all([ledger(actor), loadPartnerLines()]);
  return { batches: agitBatchesOf(rows, finals, invoices, payDate), payeeOf: payeeOfMap(partners) };
}

/**
 * 아지트 글의 재료를 읽는다 (서버 전용) — 거래명세서 화면과 같은 정본(원장 줄 · 확정 · 계산서 · 협력사 정보)을 그때 읽어 짓는다.
 * 올리는 라우트가 부른다(app/api/agit/posts — 누르는 순간의 금액으로 다시 짓기). 화면은 이미 읽은 원장으로 agitDraftsOf 를 부른다
 * — 둘이 같은 함수라 같은 재료면 같은 글이 나오고, 다르면 「금액이 바뀌었다」로 걸린다.
 */
import { getRepository } from '@/lib/data';
import { today } from '@/lib/date';
import { normalizeOrg } from '@/lib/roles';
import { CONSOLE_URL } from '@/lib/portal-intake';
import { loadPartnerLines } from '@/lib/partner-lines';
import type { Actor } from '@/lib/auth/types';
import type { PartnerLine } from '@/lib/agents/brief';
import { agitDraftsOf, type AgitPayee, type AgitPostText } from './post';

/** 배치의 지급처 → 협력사 정보의 계좌 */
export const payeeOfMap = (partners: ReadonlyMap<string, PartnerLine>) =>
  (org: string | null): AgitPayee | undefined => {
    const key = normalizeOrg(org);
    return key ? partners.get(key) : undefined;
  };

/** 결제일 하나의 글 — 그날 배치가 없으면 지급 0건의 글(올릴 수 없음)이 온다 */
export async function loadAgitDraft(actor: Actor, payDate: string): Promise<AgitPostText> {
  const repo = getRepository();
  const [rows, finals, invoices, partners] = await Promise.all([
    repo.listPayouts({ role: actor.role, org: actor.org }),
    repo.listBatchFinals(actor),
    repo.listTaxInvoices(actor),
    loadPartnerLines(),
  ]);
  const [draft] = agitDraftsOf(today(), rows, finals, invoices, payeeOfMap(partners), CONSOLE_URL, payDate);
  return draft;
}

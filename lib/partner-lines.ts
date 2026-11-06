/**
 * 지급처마다 사업자 · 계좌 (서버 전용) — 정산 담당의 [열린구매] 자료(lib/agents/scope)와 아지트 열린구매 글(lib/agit)이 같이 읽는다.
 * 협력사 정보(/settings · /admin/partners)가 정본이다. 계정은 회사당 하나다 — 같은 소속에 여럿이면 정보를 적은 첫 계정.
 * 열쇠는 normalizeOrg 로 다듬은 소속 이름이다(배치의 지급처도 그렇게 다듬어 찾는다).
 */
import { listPartnerDetails } from '@/lib/auth/partner-details';
import { userStore } from '@/lib/auth/users';
import { normalizeOrg } from '@/lib/roles';
import type { PartnerLine } from '@/lib/agents/brief';

export async function loadPartnerLines(): Promise<Map<string, PartnerLine>> {
  const [details, accounts] = await Promise.all([listPartnerDetails(), userStore.list()]);
  const partners = new Map<string, PartnerLine>();
  for (const a of accounts) {
    const org = normalizeOrg(a.org);
    const d = details[a.id];
    if (!org || !d || partners.has(org)) continue;
    partners.set(org, {
      bizRegNo: d.bizRegNo, ceo: d.ceo, bankName: d.bankName, bankAccountNo: d.bankAccountNo, bankHolder: d.bankHolder,
      hasBizCert: Boolean(d.bizCertUrl), hasBankbook: Boolean(d.bankbookUrl),
    });
  }
  return partners;
}

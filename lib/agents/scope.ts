/**
 * 에이전트가 읽을 재료를 모은다 (서버 전용) — 할 일 조립(lib/todos)과 같은 읽기를 한 번 하고, 담당마다 나눠 읽는다.
 *
 * ★저장하지 않는다★ — 부를 때마다 콘솔의 정본을 읽는다. 에이전트가 보는 것과 보드·명세서가 보여주는 것이 늘 같다
 * (dual-write 금지). 현황 화면은 일곱 카드의 한 줄을 이 한 번의 읽기로 같이 만든다.
 */
import { getRepository } from '@/lib/data';
import { listPartnerDetails } from '@/lib/auth/partner-details';
import { userStore } from '@/lib/auth/users';
import { batchesOf, batchKey } from '@/lib/payout-board';
import { receivableTodos } from '@/lib/todo-receivables';
import { normalizeOrg } from '@/lib/roles';
import { today } from '@/lib/date';
import type { Actor } from '@/lib/auth/types';
import type { BatchLine, PartnerLine, ScopeData } from './brief';

/**
 * @param withPayees 정산 담당이 열린구매 글에 쓸 지급처 사업자·계좌 · 붙일 자료가 있는지 · 배치의 현장 몫까지 — 그 담당을
 *                   부를 때만 읽는다
 */
export async function loadScope(actor: Actor, withPayees = false): Promise<ScopeData> {
  const repo = getRepository();
  const [{ projects, history, settlements }, finals, invoices] = await Promise.all([
    repo.listTodoSources({ role: actor.role, org: actor.org }),
    repo.listBatchFinals(actor),
    repo.listTaxInvoices(actor),
  ]);
  /* 멈춘 현장의 기성은 누구 차례도 아니다 — 할 일 조립(lib/todos)과 같은 판정 */
  const held = new Set(projects.filter((p) => p.holdState).map((p) => p.id));
  const data: ScopeData = {
    today: today(),
    projects,
    batches: batchesOf(history, finals, invoices),
    receivables: receivableTodos(settlements.filter((s) => !held.has(s.id))),
  };
  if (!withPayees) return data;

  const [details, accounts] = await Promise.all([listPartnerDetails(), userStore.list()]);
  /* 계정은 회사당 하나다 — 같은 소속에 여럿이면 정보를 적은 첫 계정 */
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
  const noOf = new Map(projects.map((p) => [p.id, p.mgmtNo ?? p.id]));
  const lines = new Map<string, BatchLine[]>();
  for (const r of history) {
    const key = batchKey(r.paidAt, r.org, r.kind);
    const line = { no: noOf.get(r.projectId) ?? r.projectId, projectName: r.projectName, label: r.label, amount: r.amount };
    lines.set(key, [...(lines.get(key) ?? []), line]);
  }
  return { ...data, partners, batchLines: lines };
}

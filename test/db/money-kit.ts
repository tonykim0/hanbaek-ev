/**
 * 돈이 걸린 시험의 픽스처 — 영업비 1차가 열린 현장을 만들고, 끝나면 배치·계산서·현장을 지운다.
 *
 * 열리는 조건(lib/settlement.ts payoutPrerequisiteBlockersOf · payoutReleaseOf): 지급처(salesOrg)가 있고,
 * 라인이 전부 단가 지정됐고, 계약 필수 서류가 다 올라가 있고, 계약 확인(contractConfirmedAt)이 찍혀 있다.
 * 단가 케이스는 개발 DB 의 플러그링크 자체투자 7년 모자분리 제자리교체 공동주택 케이스를 고른다(마이그레이션이 넣는다).
 * 지급처 이름에 실행 표지를 박아 같은 개발 DB 를 쓰는 옆 시험의 배치와 섞이지 않게 한다.
 */
import { evaluateDocs } from '@/lib/doc-rules';
import { getRepository } from '@/lib/data';
import type { PayoutKind, PricingRule, TaxInvoice } from '@/types/project';
import { RUN, USERS, actorOf, draft, viewerOf } from './kit';

export const admin = actorOf(USERS.admin);
export const adminView = viewerOf(USERS.admin);
let seq = 0;

export interface PayableProject { id: string; org: string; lineId: string; ruleId: string }

async function pickRule(): Promise<PricingRule> {
  const rules = await getRepository().listPricingRules(admin);
  const r = rules.find((x) =>
    x.active && x.cpo === '플러그링크' && x.bizType === '자체투자' && x.termYears.includes(7)
    && x.powerType === '모자분리' && x.replType === '자체투자 (제자리교체)' && x.bldgTypes.includes('공동주택'));
  if (!r) throw new Error('개발 DB 에 플러그링크 자체투자 7년 모자분리 제자리교체 공동주택 케이스가 없다 — 마이그레이션이 적용됐는지 본다');
  return r;
}

/** 영업비 1차가 열린 현장. confirm:false 면 계약 확인 직전(서류·단가는 다 됨)에서 멈춘다 */
export async function withPayableProject<T>(
  fn: (p: PayableProject) => Promise<T>,
  opts: { confirm?: boolean } = {}
): Promise<T> {
  const repo = getRepository();
  const org = `시험영업사-${RUN}-${++seq}`;
  const rule = await pickRule();
  const id = await repo.createProject(draft({
    salesOrg: org, gcOrg: `시험시공사-${RUN}`,
    bizType: '자체투자', powerType: '모자분리', replType: '자체투자 (제자리교체)', bldgType: '공동주택',
    lines: [{ termYears: 7, qty: 2, powerType: '모자분리', replType: '자체투자 (제자리교체)', memo: null }],
  }), admin);
  try {
    const detail = await repo.getProject(id, adminView);
    const lineId = detail!.lines[0].id;
    await repo.setLinePricing(lineId, rule.id, admin);
    const required = evaluateDocs({
      cpo: '플러그링크', contractParty: null, bldgType: '공동주택',
      hasMotherSeparation: true, preInstall: '없음', bizType: '자체투자',
    }).filter((d) => d.req === 'm');
    for (const d of required) {
      await repo.uploadDocument({ projectId: id, kind: d.key, filename: `${d.key}.pdf`, blobUrl: `https://test.local/${RUN}/${id}/${d.key}.pdf` }, admin);
    }
    if (opts.confirm !== false) await repo.confirmContract(id, true, admin);
    return await fn({ id, org, lineId, ruleId: rule.id });
  } finally {
    await cleanupOrg(org).catch(() => undefined);
    await repo.deleteProject(id, admin).catch(() => undefined);
  }
}

/** 이 지급처에 남은 최종 확정·세금계산서를 걷는다 — 둘은 현장이 아니라 지급처×구분×지급일에 붙어 현장 삭제로 안 지워진다 */
export async function cleanupOrg(org: string): Promise<void> {
  const repo = getRepository();
  for (const inv of (await repo.listTaxInvoices(admin)).filter((i) => i.org === org)) {
    await repo.deleteTaxInvoice(inv.id, admin).catch(() => undefined);
  }
  for (const f of (await repo.listBatchFinals(admin)).filter((f) => f.org === org)) {
    await repo.finalizeBatch(f.org, f.kind, f.payDate, true, admin).catch(() => undefined);
  }
}

export async function entriesOf(projectId: string) {
  return (await getRepository().listPayouts(adminView)).filter((r) => r.projectId === projectId);
}

export function invoice(org: string, kind: PayoutKind, payDate: string, n: number): Omit<TaxInvoice, 'id' | 'uploadedAt' | 'finalizedAt'> {
  return { org, kind, payDate, blobUrl: `https://test.local/${RUN}/inv-${org}-${n}.pdf`, filename: `inv-${n}.pdf`, supplyAmount: null, taxAmount: null, totalAmount: null };
}

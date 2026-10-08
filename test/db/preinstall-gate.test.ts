/**
 * 기설치 대조가 계약 확인을 막는다 — 검증 필수 (한백 지시 2026-10-07).
 *
 * 판독(돈이 드는 길)은 부르지 않는다 — 대조 결과는 저장소에 직접 넣고(savePreInstallCheck),
 * 계약 확인(confirmContract)과 「확인함」 라우트가 그 결과를 어떻게 보는지만 본다.
 * 판정 자체는 test/preinstall-check.test.ts 의 「계약 확인을 막는 대조」가 본다.
 */
import { describe, expect, it } from 'vitest';
import { POST as ACCEPT } from '@/app/api/projects/[id]/preinstall/check/accept/route';
import { getRepository } from '@/lib/data';
import { evaluateDocs } from '@/lib/doc-rules';
import type { PreInstallCheck } from '@/lib/preinstall-check';
import { RUN, USERS, actorOf, call, draft, signIn, signOut, viewerOf } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);

/** 계약 확인 직전의 보조사업 현장 — 서류·단가·접수가 다 됐다. 대조만 남는다 */
async function withSubsidyProject<T>(fn: (id: string) => Promise<T>): Promise<T> {
  const rule = (await repo.listPricingRules(admin)).find((x) =>
    x.active && x.cpo === '플러그링크' && x.bizType === '환경부' && x.termYears.includes(7)
    && x.powerType === '모자분리' && x.replType === '환경부 신규' && x.bldgTypes.includes('공동주택'));
  if (!rule) throw new Error('개발 DB 에 플러그링크 환경부 7년 모자분리 신규 공동주택 케이스가 없다');
  const id = await repo.createProject(draft({
    bizType: '환경부', powerType: '모자분리', replType: '환경부 신규',
    lines: [{ termYears: 7, qty: 2, powerType: '모자분리', replType: '환경부 신규', memo: null }],
  }), admin);
  try {
    const detail = await repo.getProject(id, viewerOf(USERS.admin));
    await repo.setLinePricing(detail!.lines[0].id, rule.id, admin);
    const required = evaluateDocs({
      cpo: '플러그링크', contractParty: null, bldgType: '공동주택',
      hasMotherSeparation: true, preInstall: '없음', bizType: '환경부',
    }).filter((d) => d.req === 'm');
    for (const d of required) {
      // 설치이력은 엑셀로 — PDF 로 내면 대조가 면제된다(bundledAsPdf, 2026-10-07). 그 길은 따로 본다
      const filename = d.key === 'legacylog' ? 'legacylog.xlsx' : `${d.key}.pdf`;
      await repo.uploadDocument({ projectId: id, kind: d.key, filename, blobUrl: urlOf(id, d.key) }, admin);
    }
    await repo.submitContract(id, true, admin);
    const ready = await repo.getProject(id, viewerOf(USERS.admin));
    // 픽스처가 맞는지부터 — 대조 말고 다른 것이 막으면 이 시험은 아무것도 말하지 않는다
    expect(ready?.contract.ready, '서류·단가가 다 찬 현장이어야 한다').toBe(true);
    return await fn(id);
  } finally {
    await repo.deleteProject(id, admin).catch(() => undefined);
  }
}

const urlOf = (id: string, kind: string, n = '') => `https://test.local/${RUN}/${id}/${kind}${n}.pdf`;

const checkOf = (files: string[], over: Partial<PreInstallCheck> = {}): PreInstallCheck => ({
  checkedAt: new Date().toISOString(), files, sheetFile: null,
  sheet: { standing: 0, final: 0, badSplit: [], none: true }, lines: [], standing: null, survey: null,
  unread: [], problem: null, ...over,
});

const filesNow = async (id: string) => {
  const d = await repo.getProject(id, viewerOf(USERS.admin));
  return ['legacylog', 'legacyev'].flatMap((k) => d!.documents.find((x) => x.kind === k)?.files.map((f) => f.url) ?? []);
};

describe('기설치 대조 — 계약 확인의 조건', () => {
  it('대조 전 → 짚을 것 남음 → 한백이 넘김 → 서류 바뀜 → 다시 대조해 맞음, 그때마다 확인이 막히고 열린다', async () => {
    await withSubsidyProject(async (id) => {
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/기설치 대조 전/);

      const left = checkOf(await filesNow(id), { problem: '시험 — 짚을 것 하나' });
      await repo.savePreInstallCheck(id, left, admin);
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/기설치 대조 1건 미확인/);

      // 본 결과가 아니면 넘기지 않는다 — 그사이 다시 대조된 것과 같다
      await expect(repo.acceptPreInstallCheck(id, '2000-01-01T00:00:00.000Z', true, admin)).rejects.toThrow(/다시 대조됐습니다/);
      await repo.acceptPreInstallCheck(id, left.checkedAt, true, admin);
      const accepted = await repo.getProject(id, viewerOf(USERS.admin));
      expect(accepted?.preinstallCheck?.accepted?.by).toBe(admin.name);

      // 넘긴 뒤 증빙이 늘면 넘긴 것도 무효 — 확인한 것은 그때의 서류다
      await repo.uploadDocument({ projectId: id, kind: 'legacyev', filename: 'ev2.pdf', blobUrl: urlOf(id, 'legacyev', '2') }, admin);
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/기설치 서류 바뀜/);
      await expect(repo.acceptPreInstallCheck(id, left.checkedAt, false, admin)).resolves.toBeUndefined();

      await repo.savePreInstallCheck(id, checkOf(await filesNow(id)), admin);
      await expect(repo.confirmContract(id, true, admin)).resolves.toBeUndefined();
      expect((await repo.getProject(id, viewerOf(USERS.admin)))?.project.contractConfirmedAt).not.toBeNull();
    });
  });

  it('★순수 보조사업 이력이면 검수 없이 확인한다★ — 사업연도·대기번호가 있으면 증빙이 필요 없다 (한백 지시 2026-10-08)', async () => {
    await withSubsidyProject(async (id) => {
      // 조사 결과가 어긋나 있어도 — 그것은 증빙 검수가 아니다
      const subsidy = checkOf(await filesNow(id), { subsidyOnly: true, survey: { state: '없음', verdict: 'diff' } });
      await repo.savePreInstallCheck(id, subsidy, admin);
      await expect(repo.confirmContract(id, true, admin)).resolves.toBeUndefined();
      expect((await repo.getProject(id, viewerOf(USERS.admin)))?.project.contractConfirmedAt).not.toBeNull();
    });
  });

  it('★설치이력을 PDF 로도 냈으면 대조 없이 확인한다★ — 자료를 한 묶음으로 다 냈다 (한백 지시 2026-10-07)', async () => {
    await withSubsidyProject(async (id) => {
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/기설치 대조 전/);
      await repo.uploadDocument({ projectId: id, kind: 'legacylog', filename: '설치이력_날인본.pdf', blobUrl: urlOf(id, 'legacylog', 'pdf') }, admin);
      await expect(repo.confirmContract(id, true, admin)).resolves.toBeUndefined();
      expect((await repo.getProject(id, viewerOf(USERS.admin)))?.project.contractConfirmedAt).not.toBeNull();
    });
  });

  it('★보완요청 이력은 판이 끝나면 닫힌다★ — 협력사가 무르면 남고, 한백이 접수를 무르거나 확인하면 지운다 (2026-10-08)', async () => {
    await withSubsidyProject(async (id) => {
      const partner = actorOf(USERS.navy);  // 시험 현장의 영업사
      const fixAsked = async () => (await repo.getProject(id, viewerOf(USERS.admin)))!.project.contractFixAskedAt;
      // 한 판 — 반려 → 고쳐 올림 → 재검토 요청
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '서명 누락' }, admin);
      await repo.uploadDocument({ projectId: id, kind: 'contract', filename: 'contract-2.pdf', blobUrl: urlOf(id, 'contract', '2') }, partner);
      await repo.submitContract(id, true, partner);
      expect(await fixAsked()).not.toBeNull();

      // 협력사가 제 요청을 무르면 아직 고치는 중이다 — 이력은 남는다(계약보완)
      await repo.submitContract(id, false, partner);
      expect(await fixAsked()).not.toBeNull();

      // 한백이 접수를 무르면 처음 모으는 자리로 — 이력을 지운다(계약접수, 마리나베이101 2블럭)
      await repo.submitContract(id, true, partner);
      await repo.submitContract(id, false, admin);
      expect(await fixAsked()).toBeNull();

      // 다시 한 판 — 이번에는 한백이 확인해서 닫는다
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '날짜 오기' }, admin);
      await repo.uploadDocument({ projectId: id, kind: 'contract', filename: 'contract-3.pdf', blobUrl: urlOf(id, 'contract', '3') }, partner);
      expect(await fixAsked()).not.toBeNull();
      await repo.savePreInstallCheck(id, checkOf(await filesNow(id)), admin);
      await repo.confirmContract(id, true, admin);
      expect(await fixAsked()).toBeNull();
    });
  });

  it('보조사업이 아니면 대조 없이 확인한다', async () => {
    // money-kit 의 자체투자 현장이 늘 이 길이다 — 그 시험들이 대조 없이 확인을 찍는다
    const sub = evaluateDocs({
      cpo: '플러그링크', contractParty: null, bldgType: '공동주택',
      hasMotherSeparation: true, preInstall: '없음', bizType: '자체투자',
    });
    expect(sub.some((d) => d.preinstall && d.req === 'm')).toBe(false);
  });
});

describe('「확인함」 라우트의 문', () => {
  it('협력사·열람 전용은 못 넘긴다(403) · 값이 틀리면 400 · 대조가 없으면 422', async () => {
    await withSubsidyProject(async (id) => {
      for (const u of [USERS.daesang, USERS.viewer]) {
        await signIn(u);
        expect((await call(ACCEPT, { params: { id }, body: { checkedAt: 'x', accept: true } })).status, u.id).toBe(403);
      }
      await signIn(USERS.admin);
      expect((await call(ACCEPT, { params: { id }, body: { accept: true } })).status).toBe(400);
      expect((await call(ACCEPT, { params: { id }, body: { checkedAt: 'x', accept: true } })).status).toBe(422);
      signOut();
    });
  });
});

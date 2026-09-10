/**
 * 지급·정산 원장의 문 — 감사 2026-09-04 의 돈 항목 M18 · M19 · M22 · M23 · M31 · L10.
 *
 * 전부 「서버가 한 번 더 봐야 하는데 안 보던 자리」다. 화면은 막혀 있어도 저장소를 직접 부르면 열렸고,
 * 동시에 오면 둘 다 통과했다. 여기서는 저장소를 개발 DB 에 대고 직접 불러 문이 닫혔는지 본다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { admin, adminView, entriesOf, invoice, withPayableProject } from './money-kit';

const repo = getRepository();
const D1 = '2026-10-10';
const D2 = '2026-10-25';

describe('지급·정산 원장의 문', () => {
  it('M19 — 같은 회차를 동시에 확정해도 한 번만 기록된다', async () => {
    for (let round = 0; round < 2; round++) {
      await withPayableProject(async ({ id }) => {
        const results = await Promise.allSettled([1, 2].map(() =>
          repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D1, admin)));
        const rows = (await entriesOf(id)).filter((r) => r.kind === '영업비' && r.label === '1차');
        expect(rows.length, `${round + 1}번째: 영업비 1차 기록 수`).toBe(1);
        expect(results.filter((r) => r.status === 'fulfilled').length, '성공한 확정 수').toBe(1);
        /*
         * ★진 쪽의 거절 사유는 둘 중 하나다 — 문구 하나로 못 박으면 깜빡인다.★
         *
         * 지는 쪽이 언제 상태를 읽느냐로 갈린다: 먼저 것이 커밋되기 ★전★에 읽으면 1차를
         * 다시 시도해 중복 문(「이미 지급 확정된 회차」)에 걸리고, ★뒤★에 읽으면 1차가
         * 이미 있으니 2차를 셈해 그 회차의 조건(「준공완료 후」)에 걸린다. 둘 다 옳은
         * 거절이고, 어느 쪽이 나오든 이 시험이 지키려는 것(한 번만 기록된다)은 위의 두
         * 단정이 이미 증명한다. 문구를 하나로 박아 두었더니 3회 중 1회 빨간불이었다
         * (실측 2026-09-10) — 돈 시험이 깜빡이면 사람이 빨간불을 무시하게 된다.
         *
         * 그래도 ★아무 오류나★ 통과시키지는 않는다: 교착·터짐이 아니라 고의로 막은
         * 것이어야 한다.
         */
        const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(String(rejected.reason?.message)).toMatch(/이미 지급 확정된 회차|준공완료 후 지급/);
      });
    }
  });

  it('M18 — 최종 확정된 배치에는 손으로도 적을 수 없다 (회수 기록이 합계를 바꾼다)', async () => {
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D1, admin);
      await repo.finalizeBatch(org, '영업비', D1, false, admin);
      await expect(repo.addPayoutEntries(id, [{ kind: '영업비', category: '회수', amount: -100000, at: D1, note: null, step: null }], admin))
        .rejects.toThrow(/최종 확정/);
      // 확정되지 않은 다른 날의 배치에는 적을 수 있다
      await expect(repo.addPayoutEntries(id, [{ kind: '영업비', category: '회수', amount: -100000, at: D2, note: null, step: null }], admin))
        .resolves.toHaveLength(1);
      expect((await entriesOf(id)).map((r) => `${r.label}@${r.paidAt}`).sort()).toEqual([`1차@${D1}`, `회수@${D2}`]);
    });
  });

  it('M22 — 두 배치에 세금계산서가 다 붙어 있으면 합칠 수 없다고 말한다 — DB 오류가 아니라', async () => {
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D1, admin);
      await repo.addPayoutEntries(id, [{ kind: '영업비', category: '회수', amount: -50000, at: D2, note: null, step: null }], admin);
      await repo.saveTaxInvoice(invoice(org, '영업비', D1, 1), admin);
      await repo.saveTaxInvoice(invoice(org, '영업비', D2, 2), admin);
      await expect(repo.movePayoutBatch(org, '영업비', D2, D1, admin)).rejects.toThrow(/세금계산서/);
      expect((await entriesOf(id)).map((r) => `${r.label}@${r.paidAt}`).sort(), '아무것도 옮겨지지 않았다').toEqual([`1차@${D1}`, `회수@${D2}`]);
      expect((await repo.listTaxInvoices(admin)).filter((i) => i.org === org).map((i) => i.payDate).sort(), '계산서 둘이 그대로다').toEqual([D1, D2]);
    });
  });

  it('M23 — 세금계산서가 붙은 배치의 마지막 지급 줄은 뺄 수 없다 (계산서가 고아가 된다)', async () => {
    await withPayableProject(async ({ id, org }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], D1, admin);
      const { id: invId } = await repo.saveTaxInvoice(invoice(org, '영업비', D1, 1), admin);
      const [row] = await entriesOf(id);
      await expect(repo.deletePayoutEntry(id, row.entryId, admin)).rejects.toThrow(/세금계산서/);
      expect(await entriesOf(id)).toHaveLength(1);
      await repo.deleteTaxInvoice(invId, admin);
      await expect(repo.deletePayoutEntry(id, row.entryId, admin)).resolves.toBeUndefined();
      expect(await entriesOf(id)).toHaveLength(0);
    });
  });

  it('M31 — 기성 수금 기록이 있으면 정산 규칙을 바꾸거나 해제할 수 없다', async () => {
    await withPayableProject(async ({ id }) => {
      // 단가 지정이 정산 규칙(착공 → 준공마감)을 붙였다. 실착공일을 적으면 1차 조건이 찬다.
      await repo.updateProcess(id, { startActualDate: '2026-09-01' }, admin);
      await repo.setSettlementCollected(id, 1, { at: '2026-09-05', amount: 200000 }, admin);
      await expect(repo.setSettlementRule(id, null, admin)).rejects.toThrow(/수금/);
      const other = (await repo.listSettlementRules(admin)).find((r) => r.active && r.id !== (null as unknown));
      const detail = await repo.getProject(id, adminView);
      const current = detail?.admin?.settlementRule?.id ?? null;
      const another = (await repo.listSettlementRules(admin)).find((r) => r.active && r.id !== current);
      if (another) await expect(repo.setSettlementRule(id, another.id, admin)).rejects.toThrow(/수금/);
      void other;
      // 수금을 지우면 바꿀 수 있다
      await repo.setSettlementCollected(id, 1, null, admin);
      await expect(repo.setSettlementRule(id, null, admin)).resolves.toBeUndefined();
    }, { confirm: false });
  });

  it('L10 — 계약 확인과 서류 반려가 동시에 와도 「반려가 있는 확인」은 생기지 않는다', async () => {
    for (let round = 0; round < 3; round++) {
      await withPayableProject(async ({ id }) => {
        await Promise.allSettled([
          repo.confirmContract(id, true, admin),
          repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '시험 반려' }, admin),
        ]);
        const detail = await repo.getProject(id, adminView);
        const confirmedAt = detail?.project.contractConfirmedAt ?? null;
        expect(detail?.contract.rejected, `${round + 1}번째: 반려 수`).toBe(1);
        expect(confirmedAt, `${round + 1}번째: 반려가 남았는데 확인이 찍혔다`).toBeNull();
      }, { confirm: false });
    }
  });
});

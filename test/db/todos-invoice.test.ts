/**
 * 세금계산서를 올리면 「세금계산서 발행」 할 일이 사라진다 — 감사 M1.
 *
 * 조립(lib/todos)이 배치를 묶을 때 계산서를 안 넘겨서(batchesOf 의 셋째 인자) 배치마다 계산서가 늘 비어 보였고,
 * 「계산서를 이미 올린 배치는 빠진다」는 거름이 아무것도 거르지 못했다 — 협력사가 계산서를 올려도 할 일과 사이드바
 * 배지가 줄지 않았다(거래명세서 화면은 계산서를 읽어 「첨부됨」으로 보였다).
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { todosOf } from '@/lib/todos';
import { today } from '@/lib/date';
import type { SessionPayload } from '@/lib/auth/types';
import { admin, invoice, withPayableProject } from './money-kit';

const repo = getRepository();

/** 지급일 — 앞으로 올 날이어야 가확정이다(지나면 확정 누락) */
function ahead(days: number): string {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('「세금계산서 발행」 할 일', () => {
  it('가확정 배치에 서고, 계산서를 올리면 빠진다', async () => {
    await withPayableProject(async ({ id, org }) => {
      const payDate = ahead(14);
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], payDate, admin);
      const partner: SessionPayload = { id: 'ecoelec', name: `${org} 담당`, role: 'salesCons', org, exp: 0 };
      const invoiceTodos = async () => (await todosOf(partner)).filter((t) => t.kind === '세금계산서 발행');

      expect(await invoiceTodos()).toHaveLength(1);
      expect((await invoiceTodos())[0].overdue, '지급일 전이라 밀린 것이 아니다(감사 M4)').toBe(false);

      await repo.saveTaxInvoice(invoice(org, '영업비', payDate, 1), admin);
      expect(await invoiceTodos()).toHaveLength(0);
    });
  });
});

/**
 * POST /api/receivables/claim — 기성 청구 기록 한꺼번에 [한백 전용] (한백 지시 2026-11-02)
 *
 * 운영사 청구는 달마다 모아서 한다 — 조건이 찬 다음 달에. 기성관리 표에서 「청구 가능」 줄을 체크해
 * 청구일 하나로 기록한다(지급 가확정 POST /api/payouts 와 같은 꼴). 항목은 현장 × 차수(1·2·3) 또는
 * 점검수수료('fee'). ★금액은 받지 않는다★ — 청구액은 그 차수의 계획액이다. 전부 되거나 전부 안 된다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST = adminWrite<
  Record<string, never>,
  { at?: unknown; items?: unknown }
>('한백 관리자만 기성 청구를 기록할 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.at !== 'string' || !DATE_RE.test(body.at)) {
    throw new BadRequest('청구일은 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new BadRequest('청구할 항목이 없습니다.');
  }
  const items = body.items.map((raw) => {
    const it = raw as { projectId?: unknown; part?: unknown };
    if (typeof it?.projectId !== 'string' || (it.part !== 1 && it.part !== 2 && it.part !== 3 && it.part !== 'fee')) {
      throw new BadRequest('항목이 올바르지 않습니다.');
    }
    return { projectId: it.projectId, part: it.part as 1 | 2 | 3 | 'fee' };
  });
  return getRepository().claimReceivables(items, body.at, actor);
});

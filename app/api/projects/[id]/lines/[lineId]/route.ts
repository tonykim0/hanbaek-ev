/**
 * PATCH /api/projects/[id]/lines/[lineId] — 계약 라인 [한백 전용]
 *
 * 두 가지를 받는다.
 *   pricingRuleId — 단가 케이스 지정. 지급액은 저장하지 않는다: 케이스가 불변이라
 *     참조만 남기면 조회할 때 늘 같은 값이 나온다.
 *   qty · termYears — 계약 사실 자체를 바로잡는다(한백 지적 2026-09-10 — 판독이
 *     계약대수를 732 대로 읽어 넣은 현장이 있었다). 잠금·단가 해제는 저장소가 본다.
 *
 * 둘을 한 번에 보내지 않는다 — 연수를 고치면 단가 지정이 풀리므로 순서가 뜻을 갖는다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

type Body = { pricingRuleId?: string | null; qty?: number; termYears?: number };

export const PATCH = adminWrite<{ id: string; lineId: string }, Body>(
  '한백 관리자만 계약 라인을 고칠 수 있습니다.',
  async ({ body, params, actor }) => {
    const facts = 'qty' in body || 'termYears' in body;
    if (facts && 'pricingRuleId' in body) {
      throw new BadRequest('단가 지정과 계약 사실은 따로 보냅니다.');
    }
    if (facts) {
      await getRepository().setLineFacts(params.lineId, body, actor);
      return;
    }
    await getRepository().setLinePricing(params.lineId, body.pricingRuleId?.trim() || null, actor);
  }
);

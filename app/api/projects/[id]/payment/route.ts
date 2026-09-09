/**
 * PATCH /api/projects/[id]/payment — 지급 비고 저장
 *
 * 지급일 4칸(영업 1·2차, 시공 1·2차)은 원장으로 옮겼다 — /api/projects/[id]/payouts.
 * 여기 남은 것은 금액만으로 설명되지 않는 사정을 적는 비고뿐이다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const PATCH = adminWrite<{ id: string }, { payNote?: unknown; basePayNote?: unknown }>(
  '한백 관리자만 저장할 수 있습니다.',
  async ({ body, params, actor }) => {
    if (!body || !('payNote' in body)) throw new BadRequest('바꿀 값이 없습니다.');
    const v = body.payNote;
    if (v !== null && typeof v !== 'string') throw new BadRequest('비고는 문자열이어야 합니다.');
    // 화면이 본 값 — 있으면 저장소가 지금 값과 견준다 (감사 M32). 없으면 옛 방식(덮어쓰기)이다.
    const base = body.basePayNote;
    if (base !== undefined && base !== null && typeof base !== 'string') throw new BadRequest('basePayNote 가 올바르지 않습니다.');
    const expect = base === undefined ? undefined : { payNote: typeof base === 'string' && base.trim() ? base.trim() : null };
    await getRepository().setPayment(
      params.id,
      { payNote: typeof v === 'string' && v.trim() ? v.trim() : null },
      actor,
      expect
    );
  }
);

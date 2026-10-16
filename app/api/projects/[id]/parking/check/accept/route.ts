/**
 * POST /api/projects/[id]/parking/check/accept — 주차면 대조 결과 「확인함」 · 취소 [한백 전용]
 *
 * 한백 결정 2026-10-16 「막는다」 — 짚을 것이 남은 대조는 한백이 결과를 보고 넘겨야 계약을 확인한다.
 *   { checkedAt, accept: true }   본 결과를 넘긴다 (checkedAt = 화면이 본 결과의 대조 시각)
 *   { checkedAt, accept: false }  넘긴 것을 되돌린다
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { checkedAt?: unknown; accept?: unknown } | undefined>(
  '한백 관리자만 대조 결과를 확인할 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.checkedAt !== 'string' || typeof body.accept !== 'boolean') {
      throw new BadRequest('checkedAt(문자열)과 accept(참·거짓)가 필요합니다.');
    }
    await getRepository().acceptParkingCheck(params.id, body.checkedAt, body.accept, actor);
  }
);

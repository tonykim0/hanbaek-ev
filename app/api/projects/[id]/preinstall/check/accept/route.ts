/**
 * POST /api/projects/[id]/preinstall/check/accept — 기설치 대조 결과 「확인함」 · 취소 [한백 전용]
 *
 * 한백 지시 2026-10-07 「검증 필수」 — 보조사업 현장은 대조가 맞음이거나 한백이 결과를 보고 넘겨야
 * 계약을 확인한다. 짚을 것·개별 검토가 남은 결과를 넘기는 문이 여기다. 판정·잠금은 저장소가 한다.
 *
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
    await getRepository().acceptPreInstallCheck(params.id, body.checkedAt, body.accept, actor);
  }
);

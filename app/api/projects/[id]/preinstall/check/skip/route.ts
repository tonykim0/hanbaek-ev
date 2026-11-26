/**
 * POST /api/projects/[id]/preinstall/check/skip — 기설치 대조 없이 넘기기 · 넘김 취소 [한백 전용]
 *
 * 한백 2026-11-26 「기설치 조사에서 대조없이 넘어갈수있게 force 버튼 하나만들어줘」 — 대조 전 · 서류 바뀜처럼 볼 결과가
 * 없을 때도 계약 확인을 연다. 결과를 보고 넘기는 문은 옆의 accept 다. 판정·잠금은 저장소가 한다.
 *
 *   { skip: true }   대조 없이 넘긴다
 *   { skip: false }  넘긴 것을 무른다
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { skip?: unknown } | undefined>(
  '한백 관리자만 기설치 대조 없이 넘길 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.skip !== 'boolean') throw new BadRequest('skip(참·거짓)이 필요합니다.');
    await getRepository().skipPreInstallCheck(params.id, body.skip, actor);
  }
);

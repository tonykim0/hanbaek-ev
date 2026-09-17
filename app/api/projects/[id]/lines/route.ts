/**
 * POST /api/projects/[id]/lines — 계약 라인 달기 [한백 전용]
 *
 * ★접수는 대수 없이도 통과한다★ — checkDraft 는 대수가 없으면 막지 않고 「현장 상세에서
 * 채웁니다」로 넘긴다(계약접수 칸은 처음 모으는 자리다). 그 약속을 지키는 자리가 없어서
 * 라인 0개인 현장은 대수를 영영 못 넣었다(한백 지적 2026-09-17 — HB-2026-174).
 *
 * 대수가 없으면 단가도 못 붙고 기성·지급 계획도 서지 않는다. 잠금·검사는 저장소가 한다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import type { NewContractLine } from '@/types/project';

export const POST = adminWrite<{ id: string }, Partial<NewContractLine>>(
  '한백 관리자만 계약 라인을 달 수 있습니다.',
  async ({ body, params, actor }) => {
    if (typeof body?.qty !== 'number' || typeof body?.termYears !== 'number') {
      throw new BadRequest('대수와 계약연수를 넣어주세요.');
    }
    return {
      id: await getRepository().addContractLine(params.id, {
        qty: body.qty,
        termYears: body.termYears,
        powerType: body.powerType ?? null,
        replType: body.replType ?? null,
      }, actor),
    };
  }
);

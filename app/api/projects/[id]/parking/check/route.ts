/**
 * POST /api/projects/[id]/parking/check — 주차면 대조 [한백 전용]
 *
 * 한백 지시 2026-10-16 「계약단계에서 건축물대장에 대한 에이전트를 하나 더」. 건축물대장(K-apt·공문) = 사전현장컨설팅
 * 결과서 = 설치신청서의 주차면과 열람용 여부를 판독이 읽고, 맞는지는 코드가 가른다(lib/parking-check).
 * ★접수 단계에서는 저절로 돈다★(lib/parking-run scheduleParkingCheck). 여기는 한백이 손으로 다시 돌리는 길이다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { runParkingCheck } from '@/lib/parking-run';

/** 판독까지 도는 경로라 길다 — 기설치 대조와 같은 예산 */
export const maxDuration = 300;

export const POST = adminWrite<{ id: string }, undefined>(
  '한백 관리자만 주차면을 대조할 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const detail = await repo.getProject(params.id, actor);
    if (!detail) throw new Error('현장을 찾을 수 없습니다.');
    const check = await runParkingCheck(detail);
    await repo.saveParkingCheck(params.id, check, actor);
    return { check };
  }
);

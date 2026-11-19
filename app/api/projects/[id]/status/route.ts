/**
 * POST /api/projects/[id]/status — 공정 진행 단계 옮기기
 *
 * 보드에서 카드를 끌어다 놓으면 이 경로로 온다.
 * 넘어갈 수 있는지는 여기서 판단하지 않는다 — 조건은 lib/process.ts 한 곳에 있고
 * 저장소가 확인한다(422). 여기서 하는 일은 값 검사뿐이다.
 *
 * 누가 옮기는지도 저장소가 본다(lib/process mayMoveStatus) — 한백 관리자는 모든 걸음, 그 현장의 협력사는
 * 「기후부 승인 → 행위신고」 하나(한백 지시 2026-11-19). 그래서 문은 로그인한 쓰기(열람 전용은 껍데기가 403)다.
 */
import { getRepository } from '@/lib/data';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';
import { PROCESS_STATUSES } from '@/types/project';

export const POST = sessionWrite<{ id: string }, { status?: string }>(
  async ({ body, params, actor }) => {
    const status = PROCESS_STATUSES.find((s) => s === body.status);
    if (!status) {
      throw new BadRequest(`status 는 ${PROCESS_STATUSES.join(' · ')} 중 하나여야 합니다.`);
    }
    await getRepository().setProcessStatus(params.id, status, actor);
  }
);

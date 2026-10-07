/**
 * POST /api/projects/[id]/preinstall/check — 기설치 이력 엑셀 ↔ 증빙 대조 [한백 전용]
 *
 * 한백 지시 2026-10-06 「기설치 이력엑셀에 있는 수치와 증빙자료가 맞는지도 검증」.
 * 엑셀은 코드가 읽고(lib/legacy-sheet), 증빙은 판독이 숫자만 읽고(lib/legacy-evidence),
 * 맞는지는 코드가 가른다(lib/preinstall-check). 결과는 저장해 현장 상세가 다시 보여준다.
 *
 * ★접수 단계에서는 저절로 돈다★(2026-10-07 — lib/preinstall-run schedulePreInstallCheck). 여기는 한백이 손으로 다시
 * 돌리는 길이다. 반려는 결과를 보고 사람이 누른다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { runPreInstallCheck } from '@/lib/preinstall-run';

/** 판독까지 도는 경로라 길다 — 접수 ZIP 과 같은 예산 */
export const maxDuration = 300;

export const POST = adminWrite<{ id: string }, undefined>(
  '한백 관리자만 기설치를 대조할 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const detail = await repo.getProject(params.id, actor);
    if (!detail) throw new Error('현장을 찾을 수 없습니다.');
    const check = await runPreInstallCheck(detail);
    await repo.savePreInstallCheck(params.id, check, actor);
    return { check };
  }
);

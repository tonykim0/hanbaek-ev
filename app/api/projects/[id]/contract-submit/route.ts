/**
 * POST /api/projects/[id]/contract-submit — 계약서 접수 · 접수 취소
 *
 * 협력사가 서류를 다 올리고 「계약서 접수하기」를 누르는 자리다. 이것이 계약접수와
 * 계약검토를 가른다(lib/board.ts) — 서류 칸이 차는 것만으로 넘기면 협력사가 아직
 * 고치는 중인 것이 한백의 검토 칸에 선다(한백 지시 2026-08-24).
 *
 * 조건 확인은 여기서 하지 않는다. 저장소가 contractStateFor 로 다시 보고 거절한다 —
 * 조건을 두 곳에 쓰면 「버튼은 눌리는데 저장이 거절되는」 상태가 생긴다.
 */
import { getRepository } from '@/lib/data';
import { sessionWrite, BadRequest } from '@/lib/api/write-route';
import { schedulePreInstallCheck } from '@/lib/preinstall-run';
import { scheduleParkingCheck } from '@/lib/parking-run';
import { scheduleSiteMailIntake } from '@/lib/site-mail-run';

/** 접수하면 기설치 대조가 응답 뒤에 돈다 — 판독까지 가는 길이라 예산을 넉넉히 */
export const maxDuration = 300;

export const POST = sessionWrite<{ id: string }, { submitted?: unknown }>(
  async ({ body, params, actor }) => {
    if (typeof body.submitted !== 'boolean') throw new BadRequest('submitted 가 필요합니다.');
    await getRepository().submitContract(params.id, body.submitted, actor);
    /*
     * ★접수 단계에서 기설치 대조를 저절로★ (한백 지시 2026-10-07) — 서류는 이미 올라와 있다(이 기능 전에 올린
     * 것까지). 이미 이 서류로 대조했으면 다시 돌지 않는다.
     */
    if (body.submitted) schedulePreInstallCheck(params.id);
    // 건축물대장 대조도 같다 — 건축물대장·결과서·신청서로(lib/parking-run, 한백 지시 2026-10-16)
    if (body.submitted) scheduleParkingCheck(params.id);
    /*
     * ★운영사 담당이 양식 메일을 저절로★ (한백 지시 2026-11-04 · lib/site-mail) — 나이스는 계약서 초안, 현대엔지니어링은 설치승인서.
     * 그 담당이 할 일을 적고 초안을 쓰고 대화에 남긴다. 서류가 없으면 못 보낸다고 한백 관리자에게 알린다. 나이스는 쓰기 전에 결과서
     * 「6. 중복설치」(제출 정보 7번)를 읽는다 — 이 기능 전에 올린 결과서까지.
     */
    if (body.submitted) scheduleSiteMailIntake(params.id);
  }
);

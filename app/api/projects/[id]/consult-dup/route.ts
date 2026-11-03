/**
 * POST /api/projects/[id]/consult-dup — 사전현장컨설팅 결과서 「6. 중복설치」를 지금 다시 읽는다 [한백 관리자]
 *
 * ★저절로도 읽는다★(결과서 칸에 파일이 들고 날 때 · 계약서 접수 때 — lib/consult-dup-run scheduleConsultDup). 여기는 한백이
 * 나이스인프라 제출 정보의 「결과서에서 다시 읽기」를 누르는 길이다 — 이 기능 전에 결과서를 낸 현장, 잘못 읽은 것을 다시 볼 때.
 * 판독이 20~40초 걸린다.
 */
import { adminWrite } from '@/lib/api/write-route';
import { readConsultDupNow } from '@/lib/consult-dup-run';

export const maxDuration = 300;

export const POST = adminWrite<{ id: string }, undefined>(
  '결과서 읽기는 한백 관리자만 돌릴 수 있습니다.',
  async ({ params, actor }) => {
    const value = await readConsultDupNow(params.id, actor);
    if (!value) throw new Error('사전현장컨설팅 결과서가 없습니다 — 결과서 칸에 먼저 올려 주세요.');
    return { consultDup: value };
  }
);

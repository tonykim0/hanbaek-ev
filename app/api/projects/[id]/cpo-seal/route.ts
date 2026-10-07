/**
 * POST /api/projects/[id]/cpo-seal — 계약서의 운영사 직인을 다시 읽는다 [한백 전용]
 *
 * 한백 지시 2026-10-07 「현대엔지니어링과 SK 계약서는 충전사업자 직인이 필요해 — 파일을 읽고 태깅을 따로 해줘」.
 * 계약서 칸에 파일이 올라오면 저절로 읽는다(lib/cpo-seal-run scheduleCpoSealRead). 여기는 이미 올라와 있던 계약서와
 * 판독이 틀렸다고 보이는 것을 한백이 다시 읽히는 길이다 — 칸의 파일을 모두 다시 읽는다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { readCpoSealsNow } from '@/lib/cpo-seal-run';

/** 파일마다 판독 한 번(6~10초)을 차례로 — 계약서가 여러 장이면 길다 */
export const maxDuration = 300;

export const POST = adminWrite<{ id: string }, undefined>(
  '한백 관리자만 운영사 직인을 다시 읽을 수 있습니다.',
  async ({ params, actor }) => {
    const detail = await getRepository().getProject(params.id, actor);
    if (!detail) throw new Error('현장을 찾을 수 없습니다.');
    const results = await readCpoSealsNow(params.id, actor, true);
    return { results };
  }
);

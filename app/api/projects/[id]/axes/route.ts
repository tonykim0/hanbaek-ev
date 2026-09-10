/**
 * PATCH /api/projects/[id]/axes — 단가·흐름의 축 고치기 [한백 전용]
 *
 * 운영사·사업구분·수전방식. 값을 바로잡는다는 점은 /facts 와 같은데 파급이 달라 문을 갈랐다
 * (한백 지시 2026-09-10). 셋은 단가 케이스를 고르는 축이고, 사업구분은 공정 흐름까지 바꾼다.
 *
 * 잠금(지급조건 확정)·흐름 검사(지금 서 있는 칸이 새 흐름에 있는가)·단가 해제는 저장소가
 * 한다(setProjectAxes) — 화면 없이 부르는 길도 같은 문을 지나야 한다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import type { ProjectAxesPatch } from '@/types/project';

const FIELDS = ['cpo', 'bizType', 'powerType'] as const;

export const PATCH = adminWrite<{ id: string }, ProjectAxesPatch>(
  '한백 관리자만 고칠 수 있습니다.',
  async ({ body, params, actor }) => {
    const unknown = Object.keys(body ?? {}).filter((k) => !(FIELDS as readonly string[]).includes(k));
    if (unknown.length > 0) {
      throw new BadRequest(`이 자리에서 고칠 수 없는 값입니다: ${unknown.join(', ')}`);
    }
    if (!body || !FIELDS.some((f) => f in body)) throw new BadRequest('고칠 값이 없습니다.');
    await getRepository().setProjectAxes(params.id, body, actor);
  }
);

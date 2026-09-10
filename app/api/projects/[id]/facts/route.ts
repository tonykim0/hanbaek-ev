/**
 * PATCH /api/projects/[id]/facts — 현장을 설명하는 값 고치기 [한백 전용]
 *
 * ★접수는 사람이 아니라 판독이 채운다★ — 계약서 스캔을 AI 가 읽어 열두 칸을 미리 넣는다.
 * 잘 맞지만 틀릴 때가 있고, 틀린 채로 굳으면 고칠 자리가 없었다(한백 지적 2026-09-10).
 *
 * 무엇을 받고 무엇을 안 받는지는 저장소가 정한다(setProjectFacts) — 돈도 흐름도 안
 * 건드리는 값만이다. 여기서는 보낸 칸이 하나라도 있는지만 본다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import type { ProjectFactsPatch } from '@/types/project';

const FIELDS = [
  'addr', 'bldgType', 'contractParty', 'parkTotal', 'mgr', 'tel', 'mail', 'note', 'createdAt',
] as const;

export const PATCH = adminWrite<{ id: string }, ProjectFactsPatch>(
  '한백 관리자만 현장 정보를 고칠 수 있습니다.',
  async ({ body, params, actor }) => {
    /*
     * ★모르는 칸을 먼저 본다★ — 「없다」보다 「여기서는 못 고친다」가 먼저 나와야 한다.
     * 순서를 뒤집었더니 사업구분을 보냈을 때 「고칠 값이 없습니다」가 떴다(2026-09-10):
     * 값을 보낸 사람에게 안 보냈다고 말하는 꼴이라, 무엇이 문제인지 알 수 없다.
     * 조용히 버리지 않는 이유는 그러면 「고쳤는데 그대로」가 되기 때문이다.
     */
    const unknown = Object.keys(body ?? {}).filter((k) => !(FIELDS as readonly string[]).includes(k));
    if (unknown.length > 0) {
      throw new BadRequest(`이 자리에서 고칠 수 없는 값입니다: ${unknown.join(', ')}`);
    }
    if (!body || !FIELDS.some((f) => f in body)) throw new BadRequest('고칠 값이 없습니다.');
    await getRepository().setProjectFacts(params.id, body, actor);
  }
);

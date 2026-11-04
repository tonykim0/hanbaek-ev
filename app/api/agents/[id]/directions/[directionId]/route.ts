/** DELETE /api/agents/[id]/directions/[directionId] — 팀 목표 · 방향 지우기 [한백 관리자]. 지운 것은 감사기록에 통째로 남는다 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';

export const DELETE = adminWrite<{ id: string; directionId: string }, undefined>(
  '목표 · 방향은 한백 관리자만 지울 수 있습니다.',
  async ({ params, actor }) => {
    await getRepository().deleteAgentDirection({ leadId: params.id, id: params.directionId }, actor);
  }
);

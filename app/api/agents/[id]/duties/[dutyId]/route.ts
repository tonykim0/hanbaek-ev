/** DELETE /api/agents/[id]/duties/[dutyId] — 업무 정의 지우기 [한백 관리자]. 지운 것은 감사기록에 통째로 남는다 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';

export const DELETE = adminWrite<{ id: string; dutyId: string }, undefined>(
  '업무 정의는 한백 관리자만 지울 수 있습니다.',
  async ({ params, actor }) => {
    await getRepository().deleteAgentDuty({ agentId: params.id, id: params.dutyId }, actor);
  }
);

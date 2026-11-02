/**
 * PATCH  /api/agents/[id]/tasks/[taskId] — 끝냄 · 되살림 { done } [한백 관리자]
 * DELETE /api/agents/[id]/tasks/[taskId] — 지우기 [한백 관리자]. 지운 것은 감사기록에 남는다
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const PATCH = adminWrite<{ id: string; taskId: string }, { done?: unknown }>(
  '에이전트의 할 일은 한백 관리자만 바꿀 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.done !== 'boolean') throw new BadRequest('끝냈는지(done)가 없습니다.');
    await getRepository().setAgentTaskDone({ agentId: params.id, id: params.taskId, done: body.done }, actor);
  }
);

export const DELETE = adminWrite<{ id: string; taskId: string }, undefined>(
  '에이전트의 할 일은 한백 관리자만 지울 수 있습니다.',
  async ({ params, actor }) => {
    await getRepository().deleteAgentTask({ agentId: params.id, id: params.taskId }, actor);
  }
);

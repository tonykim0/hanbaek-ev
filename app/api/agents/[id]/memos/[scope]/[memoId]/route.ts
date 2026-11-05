/** DELETE /api/agents/[id]/memos/[scope]/[memoId] — 메모 지우기 [한백 관리자]. 지운 것은 감사기록에 통째로 남는다 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { MEMO_SCOPES, type MemoScope } from '@/types/agents';

export const DELETE = adminWrite<{ id: string; scope: string; memoId: string }, undefined>(
  '메모는 한백 관리자만 지울 수 있습니다.',
  async ({ params, actor }) => {
    if (!(MEMO_SCOPES as readonly string[]).includes(params.scope)) throw new BadRequest('메모 자리가 잘못됐습니다.');
    await getRepository().deleteAgentMemo({ agentId: params.id, scope: params.scope as MemoScope, id: params.memoId }, actor);
  }
);

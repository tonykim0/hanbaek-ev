/**
 * POST /api/agents/[id]/messages — 에이전트에게 말을 남긴다 { body, note? } [한백 관리자]
 *
 * note 가 true 면 기록만 남긴다(운영사 담당자와 통화한 내용 같은 것 — 에이전트를 부르지 않는다). 아니면 지시다 —
 * 화면이 이어서 /reply 를 불러 에이전트가 답한다. 둘을 가른 것은 답이 실패해도 지시는 남아야 해서다(「다시 묻기」).
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { body?: unknown; note?: unknown }>(
  '에이전트와의 대화는 한백 관리자만 남길 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.body !== 'string' || !body.body.trim()) throw new BadRequest('내용을 적어주세요.');
    const message = await getRepository().addAgentMessage(
      { agentId: params.id, role: body.note === true ? 'note' : 'user', body: body.body },
      actor
    );
    return { message };
  }
);

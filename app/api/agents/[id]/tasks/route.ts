/** POST /api/agents/[id]/tasks — 할 일 적기 { title, note?, due?, projectId? } [한백 관리자] */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

const optional = (v: unknown, what: string): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new BadRequest(`${what}이(가) 글이 아닙니다.`);
  return v;
};

export const POST = adminWrite<{ id: string }, { title?: unknown; note?: unknown; due?: unknown; projectId?: unknown }>(
  '에이전트의 할 일은 한백 관리자만 적을 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.title !== 'string') throw new BadRequest('할 일이 없습니다.');
    const { id } = await getRepository().addAgentTask({
      agentId: params.id,
      title: body.title,
      note: optional(body.note, '덧붙일 말'),
      due: optional(body.due, '기한'),
      projectId: optional(body.projectId, '현장'),
    }, actor);
    return { id };
  }
);

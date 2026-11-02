/**
 * POST /api/agents/[id]/duties — 업무 정의 넣기 · 고치기 { id?, title, body } [한백 관리자]
 *
 * 한백이 담당마다 적는다(한백 지시 2026-11-02 「그 업무들에 대한 정의도 내가 담당자별로 지정할거야」). 에이전트는 이것을
 * 지시로 읽는다(lib/agents/brain). id 가 있으면 그 정의를 고친다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { id?: unknown; title?: unknown; body?: unknown }>(
  '업무 정의는 한백 관리자만 적을 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.title !== 'string') throw new BadRequest('업무 이름이 없습니다.');
    if (body.body !== undefined && typeof body.body !== 'string') throw new BadRequest('업무 정의가 글이 아닙니다.');
    if (body.id !== undefined && typeof body.id !== 'string') throw new BadRequest('업무 정의 id 가 잘못됐습니다.');
    const id = await getRepository().saveAgentDuty(
      { agentId: params.id, id: body.id as string | undefined, title: body.title, body: (body.body as string | undefined) ?? '' },
      actor
    );
    return { id };
  }
);

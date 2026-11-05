/**
 * POST /api/agents/[id]/memos/[scope] — 메모 넣기 · 고치기 { id?, title, body } [한백 관리자]
 *
 * scope 는 mine(그 담당의 메모) · team(그 담당 사업의 팀 공용 메모). 담당이 대화 중에 적은 메모를 한백이 화면에서 고치고 더하는
 * 자리다(migrations/0122 · 한백 2026-11-05 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는 방법」). id 가 있으면 그 메모를 고친다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { MEMO_SCOPES, type MemoScope } from '@/types/agents';

export const POST = adminWrite<{ id: string; scope: string }, { id?: unknown; title?: unknown; body?: unknown }>(
  '메모는 한백 관리자만 적을 수 있습니다.',
  async ({ params, body, actor }) => {
    if (!(MEMO_SCOPES as readonly string[]).includes(params.scope)) throw new BadRequest('메모 자리가 잘못됐습니다.');
    if (typeof body?.title !== 'string') throw new BadRequest('메모의 이름이 없습니다.');
    if (body.body !== undefined && typeof body.body !== 'string') throw new BadRequest('메모의 내용이 글이 아닙니다.');
    if (body.id !== undefined && typeof body.id !== 'string') throw new BadRequest('메모 id 가 잘못됐습니다.');
    return getRepository().saveAgentMemo(
      {
        agentId: params.id, scope: params.scope as MemoScope, id: (body.id as string | undefined) ?? null,
        title: body.title, body: (body.body as string | undefined) ?? '',
      },
      actor
    );
  }
);

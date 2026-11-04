/**
 * POST /api/agents/[id]/directions — 팀 목표 · 방향 넣기 · 고치기 { id?, title, body } [한백 관리자]
 *
 * [id] 는 팀장(전략·기획 담당)이다 — 목표 · 방향은 팀장의 것이고 그 사업의 실무자 모두가 부를 때마다 읽는다(migrations/0120 ·
 * 한백 2026-11-04 「전략및기획에서 세우는 목표나 OKR 방향성 또는 다른 사업구조에 대해서도 밑에 실무자들이 알아야하는」).
 * 팀장이 아닌 담당이면 저장소가 422 로 거절한다. id 가 있으면 그 줄을 고친다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

export const POST = adminWrite<{ id: string }, { id?: unknown; title?: unknown; body?: unknown }>(
  '목표 · 방향은 한백 관리자만 적을 수 있습니다.',
  async ({ params, body, actor }) => {
    if (typeof body?.title !== 'string') throw new BadRequest('목표 · 방향의 이름이 없습니다.');
    if (body.body !== undefined && typeof body.body !== 'string') throw new BadRequest('목표 · 방향의 내용이 글이 아닙니다.');
    if (body.id !== undefined && typeof body.id !== 'string') throw new BadRequest('목표 · 방향 id 가 잘못됐습니다.');
    return getRepository().saveAgentDirection(
      { leadId: params.id, id: body.id as string | undefined, title: body.title, body: (body.body as string | undefined) ?? '' },
      actor
    );
  }
);

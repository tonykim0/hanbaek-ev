/**
 * PUT    /api/agit/hook { url } — 아지트 그룹 웹훅 연결 [한백 관리자]
 * PATCH  /api/agit/hook { assignees } — 요청 글 담당자(아지트 ID, 쉼표 · 띄어쓰기로 여럿 · 빈 글이면 비움) [한백 관리자]
 * DELETE /api/agit/hook         — 연결 끊기 [한백 관리자]
 *
 * 열린구매 글을 올릴 아지트 그룹의 웹훅(https://agit.io/webhook/<토큰>) 하나다(store/agit · migrations/0126). 주소가 곧 열쇠라 잠가
 * 두고 응답에 싣지 않는다. ★연결할 때 시험 글을 올리지 않는다★ — 그 그룹 사람들에게 보인다. 틀린 주소는 첫 글이 「못 올림」으로
 * 말한다(아지트가 404 를 준다). 끊어도 올린 글의 기록은 남는다(화면 규칙 7 — 다시 연결하면 그대로 올린다).
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';

export const PUT = adminWrite<Record<string, never>, { url?: unknown }>(
  '아지트는 한백 관리자만 연결할 수 있습니다.',
  async ({ body, actor }) => {
    if (typeof body?.url !== 'string') throw new BadRequest('웹훅 주소가 글이 아닙니다.');
    return { hook: await getRepository().saveAgitHook({ url: body.url }, actor) };
  }
);

export const PATCH = adminWrite<Record<string, never>, { assignees?: unknown }>(
  '아지트 담당자는 한백 관리자만 정할 수 있습니다.',
  async ({ body, actor }) => {
    if (typeof body?.assignees !== 'string') throw new BadRequest('담당자가 글이 아닙니다.');
    return { hook: await getRepository().saveAgitAssignees({ assignees: body.assignees }, actor) };
  }
);

export const DELETE = adminWrite<Record<string, never>, undefined>(
  '아지트 연결은 한백 관리자만 끊을 수 있습니다.',
  async ({ actor }) => {
    await getRepository().deleteAgitHook(actor);
  }
);

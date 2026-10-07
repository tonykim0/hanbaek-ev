/**
 * POST /api/notices/[id]/messages — 공지에 메시지를 남긴다 { body, org? } [협력사 · 한백 관리자]
 *
 * 협력사는 제 업체의 대화에 남는다(org 를 보내도 저장소가 무시한다). 한백은 답할 업체(org)를 골라 보낸다.
 * 받는 쪽에 알림이 간다 — 누가 받는지는 저장소(store/notice-messages · notifications)가 정한다.
 * 열람 전용은 껍데기(sessionWrite)가 막는다.
 */
import { getRepository } from '@/lib/data';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';

export const POST = sessionWrite<{ id: string }, { body?: unknown; org?: unknown }>(
  async ({ body, params, actor }) => {
    if (typeof body?.body !== 'string' || !body.body.trim()) throw new BadRequest('내용을 적어주세요.');
    const org = typeof body.org === 'string' ? body.org : null;
    const id = await getRepository().addNoticeMessage({ noticeId: params.id, body: body.body, org }, actor);
    return { id };
  }
);

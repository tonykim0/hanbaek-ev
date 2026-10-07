/**
 * POST /api/notices/[id]/messages — 공지에 메모를 남긴다 { body } [협력사 · 한백 관리자]
 *
 * 메모는 모두가 보는 한 줄기다(migrations/0095) — 한백 관리자와 협력사 모두에게 알림이 간다(쓴 사람 빼고).
 * 누가 받는지는 저장소(store/notice-messages · notifications)가 정한다. 열람 전용은 껍데기(sessionWrite)가 막는다.
 */
import { getRepository } from '@/lib/data';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';

export const POST = sessionWrite<{ id: string }, { body?: unknown }>(
  async ({ body, params, actor }) => {
    if (typeof body?.body !== 'string' || !body.body.trim()) throw new BadRequest('내용을 적어주세요.');
    const id = await getRepository().addNoticeMessage({ noticeId: params.id, body: body.body }, actor);
    return { id };
  }
);

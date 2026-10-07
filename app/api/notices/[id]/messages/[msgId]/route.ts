/**
 * DELETE /api/notices/[id]/messages/[msgId] — 내가 남긴 공지 메시지를 지운다 [쓴 사람]
 *
 * 남의 것은 저장소가 거절한다. 지운 글은 감사기록에 남고, 그 글의 알림은 같이 지워진다.
 */
import { getRepository } from '@/lib/data';
import { sessionWrite } from '@/lib/api/write-route';

export const DELETE = sessionWrite<{ id: string; msgId: string }, undefined>(
  async ({ params, actor }) => {
    await getRepository().deleteNoticeMessage(params.msgId, actor);
  }
);

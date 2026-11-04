/**
 * 공지의 메모 — 한백과 협력사가 공지마다 주고받는 글 (한백 지시 2026-10-07, migrations/0094 · 0095).
 *
 * ★모두가 보는 한 줄기다★ (한백 지시 2026-10-07 「메시지는 협력사별로 보내는 게 아니라 모든 협력사에게 다 보내는
 * 거야」). 0094 에서는 공지 × 업체마다 줄기를 갈라 업체끼리 서로의 말을 못 보게 했는데, 공지에 붙는 말은 공지처럼
 * 모두에게 가는 것이 맞다고 정했다. 그래서 읽기는 로그인한 전부(열람 전용 포함), 쓰기는 협력사와 한백 관리자
 * (열람 전용은 write-route 가 막는다).
 *
 * ★알림으로 이어진다★ — 남기는 트랜잭션 안에서 받는 사람마다 한 줄(store/notifications fanOutNoticeMessage):
 * 한백 관리자와 협력사 계정 모두, 쓴 사람만 빼고. 진행현황 글과 같은 길이다(그 현장 → 이 공지).
 *
 * 지우기는 쓴 사람만(진행현황과 같다) — 지운 글은 감사기록에 통째로 남는다. 그 글의 알림은 같이 지워진다(cascade).
 *
 * ★메모는 그 공지의 사업을 따른다★ (migrations/0116) — 목록은 그 사업의 공지에 붙은 것만, 알림은 그 사업으로(태양광 공지의
 * 메모는 태양광을 보는 계정에게만 · 태양광 알림), 태양광 공지에는 태양광을 보는 계정만 남긴다(seesSolar 와 같은 판정).
 */
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { noticeMessages, notices, users } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { asBiz, type Biz } from '@/lib/biz';
import { isHanbaek } from '@/lib/roles';
import type { NoticeMessage } from '@/types/project';
import type { ProjectRepository } from '../repository';
import { fanOutNoticeMessage } from './notifications';

/** 한 줄 상한 — 진행현황 글과 같은 결의 메모다. 공지 본문을 다시 쓰는 자리가 아니다 */
const MAX_BODY = 2000;

export const noticeMessageStore: Pick<
  ProjectRepository,
  'listNoticeMessages' | 'addNoticeMessage' | 'deleteNoticeMessage'
> = {
  async listNoticeMessages(me, biz: Biz = 'ev'): Promise<NoticeMessage[]> {
    const rows = await getDb()
      .select({
        id: noticeMessages.id, noticeId: noticeMessages.noticeId, author: noticeMessages.author,
        body: noticeMessages.body, at: noticeMessages.at, authorId: noticeMessages.authorId,
      })
      .from(noticeMessages)
      .innerJoin(notices, eq(notices.id, noticeMessages.noticeId))
      .where(eq(notices.biz, biz))
      .orderBy(asc(noticeMessages.at));
    return rows.map((r) => ({
      id: r.id, noticeId: r.noticeId, author: r.author, body: r.body,
      at: stampOf(r.at), mine: r.authorId === me.id,
    }));
  },

  async addNoticeMessage(input, actor): Promise<string> {
    const body = input.body?.trim();
    if (!body) throw new Error('내용을 적어주세요.');
    if (body.length > MAX_BODY) throw new Error(`메모는 ${MAX_BODY}자까지입니다.`);
    // 열람 전용은 라우트(write-route)가 먼저 막는다 — 여기는 저장소를 바로 부르는 길(시험·스크립트)의 문이다
    if (actor.role === 'viewer') throw new Error('공지 메모를 남길 수 없는 계정입니다.');

    const db = getDb();
    const [notice] = await db
      .select({ title: notices.title, biz: notices.biz })
      .from(notices)
      .where(eq(notices.id, input.noticeId))
      .limit(1);
    if (!notice) throw new Error('공지를 찾을 수 없습니다.');
    const biz = asBiz(notice.biz);
    /*
     * 태양광 공지에는 태양광을 보는 계정만 — 한백의 눈이거나 태양광 참여를 켠 협력사(lib/biz seesSolar 와 같은 판정).
     * Actor 에는 태양광 참여가 실려 있지 않아 계정 줄을 읽는다(라우트를 거치지 않는 길 — 시험 · 스크립트 — 에도 같은 문).
     */
    if (biz === 'solar' && !isHanbaek(actor.role)) {
      const [me] = await db.select({ solar: users.solar }).from(users).where(eq(users.id, actor.id)).limit(1);
      if (!me?.solar) throw new Error('태양광 공지에는 태양광 참여 계정만 메모를 남길 수 있습니다.');
    }

    // 누가 썼나 — 진행현황과 같다: 한백 또는 협력사 이름(계정이 회사당 하나라 사람 이름은 안 적는다)
    const fromHanbaek = actor.role === 'admin';
    const author = fromHanbaek ? '한백' : actor.org ?? actor.name;
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(noticeMessages).values({
        id, noticeId: input.noticeId, org: fromHanbaek ? null : actor.org, author, authorId: actor.id, body,
      });
      await fanOutNoticeMessage(tx, { msgId: id, noticeId: input.noticeId, actorId: actor.id, biz });
      await writeAudit(tx, {
        projectId: null, actor, action: '공지 메모',
        field: 'noticeMessages', oldValue: notice.title, newValue: body.slice(0, 200),
      });
    });
    return id;
  },

  async deleteNoticeMessage(id, actor): Promise<void> {
    const db = getDb();
    const [row] = await db.select().from(noticeMessages).where(eq(noticeMessages.id, id)).limit(1);
    if (!row) throw new Error('메모를 찾을 수 없습니다.');
    if (row.authorId !== actor.id) throw new Error('내가 남긴 메모만 지울 수 있습니다.');
    await db.transaction(async (tx) => {
      await tx.delete(noticeMessages).where(eq(noticeMessages.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '공지 메모 삭제',
        field: 'noticeMessages', oldValue: row.body.slice(0, 200), newValue: null,
      });
    });
  },
};

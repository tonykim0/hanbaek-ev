/**
 * 공지의 메시지 — 협력사 ↔ 한백 (한백 지시 2026-10-07 「공지에도 메모를 남기게 해서 협력사와 한백 간 메시지를
 * 주고받게, 그리고 알림으로 이어지게」, migrations/0094).
 *
 * ★대화는 공지 × 협력사마다 한 줄기다★ — 공지는 협력사 모두가 보는 글이라, 한 업체의 문의가 다른 업체에 보이면
 * 안 된다. 협력사는 제 업체(org)의 줄기만 읽고 거기에만 쓴다. 한백은 줄기 전부를 읽고, 답은 그 줄기에 단다.
 * 열람 전용은 읽기만 한다(쓰기는 write-route 가 막는다).
 *
 * ★알림으로 이어진다★ — 남기는 트랜잭션 안에서 받는 사람마다 한 줄(store/notifications fanOutNoticeMessage):
 * 협력사가 쓰면 한백 관리자 전부, 한백이 쓰면 그 업체의 계정 전부. 쓴 사람은 빠진다. 진행현황 글과 같은 길이다.
 *
 * 지우기는 쓴 사람만(진행현황과 같다) — 지운 글은 감사기록에 통째로 남는다. 그 글의 알림은 같이 지워진다(cascade).
 */
import { and, asc, eq, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { noticeMessages, notices, users } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { isHanbaek } from '@/lib/roles';
import type { NoticeMessage } from '@/types/project';
import type { ProjectRepository } from '../repository';
import { fanOutNoticeMessage } from './notifications';

/** 한 줄 상한 — 진행현황 글과 같은 결의 메시지다. 공지 본문을 다시 쓰는 자리가 아니다 */
const MAX_BODY = 2000;

/** 한백 쪽 계정 — 이 밖이 협력사다(lib/roles isHanbaek 과 같은 둘) */
const HANBAEK_ROLES = ['admin', 'viewer'];

export const noticeMessageStore: Pick<
  ProjectRepository,
  'listNoticeMessages' | 'addNoticeMessage' | 'deleteNoticeMessage'
> = {
  async listNoticeMessages(me): Promise<NoticeMessage[]> {
    const hanbaek = isHanbaek(me.role);
    if (!hanbaek && !me.org) return [];
    const rows = await getDb().select().from(noticeMessages)
      .where(hanbaek ? undefined : eq(noticeMessages.org, me.org!))
      .orderBy(asc(noticeMessages.at));
    return rows.map((r) => ({
      id: r.id, noticeId: r.noticeId, org: r.org, author: r.author, body: r.body,
      at: stampOf(r.at), mine: r.authorId === me.id,
    }));
  },

  async addNoticeMessage(input, actor): Promise<string> {
    const body = input.body?.trim();
    if (!body) throw new Error('내용을 적어주세요.');
    if (body.length > MAX_BODY) throw new Error(`메모는 ${MAX_BODY}자까지입니다.`);

    const db = getDb();
    const fromHanbaek = actor.role === 'admin';
    /*
     * 줄기 — 협력사는 늘 제 업체다(보내온 org 를 믿지 않는다: 남의 업체 줄기에 끼어들 수 있다).
     * 한백은 답할 업체를 골라 보낸다 — 그 업체에 협력사 계정이 있어야 한다(받을 사람이 없는 줄기를 만들지 않는다).
     */
    let org: string;
    if (fromHanbaek) {
      org = input.org?.trim() ?? '';
      if (!org) throw new Error('어느 업체에 남기는지가 없습니다.');
      const [known] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.org, org), notInArray(users.role, HANBAEK_ROLES), eq(users.active, true))).limit(1);
      if (!known) throw new Error(`「${org}」 계정이 없습니다.`);
    } else if (!isHanbaek(actor.role) && actor.org) {
      org = actor.org;
    } else {
      throw new Error('공지 메모를 남길 수 없는 계정입니다.');
    }

    const [notice] = await db.select({ title: notices.title }).from(notices).where(eq(notices.id, input.noticeId)).limit(1);
    if (!notice) throw new Error('공지를 찾을 수 없습니다.');

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(noticeMessages).values({
        id, noticeId: input.noticeId, org, author: fromHanbaek ? '한백' : org, authorId: actor.id, body,
      });
      await fanOutNoticeMessage(tx, { msgId: id, noticeId: input.noticeId, org, fromHanbaek, actorId: actor.id });
      await writeAudit(tx, {
        projectId: null, actor, action: '공지 메모',
        field: 'noticeMessages', oldValue: `${notice.title} · ${org}`, newValue: body.slice(0, 200),
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

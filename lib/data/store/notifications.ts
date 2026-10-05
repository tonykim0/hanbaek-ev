/**
 * 알림 — 진행현황 글이 상대방에게 간다 (한백 지시 2026-10-05). 누구에게 갈지는 lib/notify.ts 가 정한다.
 *
 * ★남길 때 받는 사람마다 한 줄을 펼쳐 넣는다★(fanOutNote — addNote 의 트랜잭션 안에서). 읽음은 그 줄의 read_at.
 * 화면 셋이 읽는다: 사이드바의 안 읽은 수 · 알림 목록(/notifications) · 현장 상세의 「새 글」 표시.
 *
 * ★협력사는 지금 볼 수 있는 현장의 알림만 센다★ — 현장의 영업사·시공사가 바뀌면 옛 알림이 갈 데 없는 링크가
 * 된다. 한백(관리자)은 전 현장을 본다.
 * 읽음 찍기는 사업 데이터의 쓰기가 아니다 — 열람 전용도 제 것을 찍는다(공지 읽음과 같다). 대행 중에는 찍지
 * 않는다(라우트가 거른다 — 관리자가 들여다본 것은 협력사가 읽은 것이 아니다).
 */
import { and, desc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { notifications, projectNotes, projects, users } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { isHanbaek } from '@/lib/roles';
import { noteAudience } from '@/lib/notify';
import { isNoteScope, type NoteNotification, type NoteScope } from '@/types/project';
import type { ProjectRepository, Recipient } from '../repository';
import type { TxLike } from './shared';

/** 협력사는 지금 볼 수 있는 현장만 — 한백은 전부 */
const accessible = (me: Recipient): SQL | undefined =>
  isHanbaek(me.role) ? undefined : or(eq(projects.salesOrg, me.org ?? ''), eq(projects.gcOrg, me.org ?? ''));

/**
 * 글 하나를 받는 사람마다 펼친다 — addNote 의 트랜잭션 안에서 부른다(글과 알림이 같이 남거나 같이 안 남는다).
 * 쓴 사람(actorId)은 빼고, 멈춘 계정은 받지 않는다.
 */
export async function fanOutNote(tx: TxLike, input: {
  noteId: string; projectId: string; scope: NoteScope; byHanbaek: boolean; actorId: string;
  salesOrg: string | null; gcOrg: string | null;
}): Promise<number> {
  const to = noteAudience(input);
  if (!to) return 0;
  const who = to.kind === 'hanbaek'
    ? and(eq(users.role, 'admin'), eq(users.active, true), ne(users.id, input.actorId))
    : and(eq(users.org, to.org), eq(users.active, true), ne(users.id, input.actorId));
  const rows = await tx.select({ id: users.id }).from(users).where(who);
  if (rows.length === 0) return 0;
  await tx.insert(notifications).values(rows.map((u) => ({
    id: crypto.randomUUID(), userId: u.id, projectId: input.projectId, noteId: input.noteId,
  })));
  return rows.length;
}

export const notificationStore: Pick<
  ProjectRepository,
  'listNotifications' | 'countUnreadNotifications' | 'markNotificationsRead' | 'unreadNoteIds'
> = {
  async listNotifications(me, limit = 100): Promise<NoteNotification[]> {
    const rows = await getDb()
      .select({
        id: notifications.id, projectId: notifications.projectId, noteId: notifications.noteId,
        createdAt: notifications.createdAt, readAt: notifications.readAt,
        projectName: projects.name, author: projectNotes.author, body: projectNotes.body, scope: projectNotes.scope,
      })
      .from(notifications)
      .innerJoin(projectNotes, eq(projectNotes.id, notifications.noteId))
      .innerJoin(projects, eq(projects.id, notifications.projectId))
      .where(and(eq(notifications.userId, me.id), accessible(me)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: r.projectName,
      noteId: r.noteId,
      scope: isNoteScope(r.scope) ? r.scope : '시공',
      author: r.author,
      body: r.body,
      at: stampOf(r.createdAt),
      read: r.readAt !== null,
    }));
  },

  async countUnreadNotifications(me): Promise<number> {
    const [row] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .innerJoin(projects, eq(projects.id, notifications.projectId))
      .where(and(eq(notifications.userId, me.id), isNull(notifications.readAt), accessible(me)));
    return row?.n ?? 0;
  },

  /**
   * 읽음 — 범위를 주면 그것만: 현장 하나(그 갈래만 — 계약 탭을 열었다고 시공 탭의 새 글이 읽힌 것은 아니다) ·
   * 알림 하나. 범위가 없으면 내 것 전부(「모두 읽음」).
   */
  async markNotificationsRead(userId, where = {}): Promise<number> {
    const db = getDb();
    const conds: SQL[] = [eq(notifications.userId, userId), isNull(notifications.readAt)];
    if (where.id) conds.push(eq(notifications.id, where.id));
    if (where.projectId) conds.push(eq(notifications.projectId, where.projectId));
    if (where.scope) {
      conds.push(inArray(notifications.noteId,
        db.select({ id: projectNotes.id }).from(projectNotes).where(eq(projectNotes.scope, where.scope))));
    }
    const done = await db.update(notifications).set({ readAt: new Date() }).where(and(...conds))
      .returning({ id: notifications.id });
    return done.length;
  },

  /** 이 현장에서 내가 아직 안 읽은 글 — 현장 상세가 「새 글」로 표시한다 */
  async unreadNoteIds(userId, projectId): Promise<string[]> {
    const rows = await getDb()
      .select({ noteId: notifications.noteId })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.projectId, projectId), isNull(notifications.readAt)));
    return [...new Set(rows.map((r) => r.noteId))];
  },
};

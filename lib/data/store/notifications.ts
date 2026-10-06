/**
 * 알림 — 진행현황 글 · 서류 반려 · 누락 서류 보완요청이 그 현장의 사람들에게 간다 (한백 지시 2026-10-05·06).
 * 누구에게 갈지는 lib/notify.ts 가 정한다(그 현장의 기록을 같이 쓰는 사람 모두, 쓴 사람만 빼고).
 *
 * ★남길 때 받는 사람마다 한 줄을 펼쳐 넣는다★ — 글은 addNote, 반려는 setDocumentStatus, 보완요청은 askMissingDocs 의
 * 트랜잭션 안에서(일과 알림이 같이 남거나 같이 안 남는다). 읽음은 그 줄의 read_at.
 * 화면 셋이 읽는다: 사이드바의 안 읽은 수 · 알림 목록(/notifications) · 현장 상세(「새 글」과 그 탭의 읽음).
 *
 * ★반려를 풀면 아직 안 읽은 반려 알림을 거둔다★ — 반려 취소·해제·다시 올리기. 풀린 반려를 알리면 거짓말이다.
 * 읽은 것은 둔다(이미 본 기록이다). 보완요청 취소도 같다.
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
import { isNoteScope, type NoteNotification, type NoteScope, type NotificationKind } from '@/types/project';
import type { ProjectRepository } from '../repository';
import type { TxLike } from './shared';

/** 협력사는 지금 볼 수 있는 현장만 — 한백은 전부 */
const accessible = (me: { role: Parameters<typeof isHanbaek>[0]; org: string | null }): SQL | undefined =>
  isHanbaek(me.role) ? undefined : or(eq(projects.salesOrg, me.org ?? ''), eq(projects.gcOrg, me.org ?? ''));

/** 받는 사람 — 그 갈래의 기록을 같이 쓰는 계정 모두, 쓴 사람(actorId)·멈춘 계정은 빼고 */
async function recipientsOf(tx: TxLike, input: {
  scope: NoteScope; actorId: string; salesOrg: string | null; gcOrg: string | null;
}): Promise<string[]> {
  const to = noteAudience(input);
  const sides: SQL[] = [];
  if (to.hanbaek) sides.push(eq(users.role, 'admin'));
  if (to.orgs.length) sides.push(inArray(users.org, to.orgs));
  if (sides.length === 0) return [];
  const rows = await tx.select({ id: users.id }).from(users)
    .where(and(or(...sides), eq(users.active, true), ne(users.id, input.actorId)));
  return rows.map((r) => r.id);
}

async function insertFor(tx: TxLike, userIds: string[], row: {
  projectId: string; kind: NotificationKind; scope: NoteScope;
  noteId?: string; docKind?: string | null; title?: string | null; body?: string | null;
}): Promise<number> {
  if (userIds.length === 0) return 0;
  await tx.insert(notifications).values(userIds.map((userId) => ({
    id: crypto.randomUUID(), userId, ...row,
  })));
  return userIds.length;
}

/** 진행현황 글 하나를 펼친다 — addNote 의 트랜잭션 안에서 */
export async function fanOutNote(tx: TxLike, input: {
  noteId: string; projectId: string; scope: NoteScope; actorId: string;
  salesOrg: string | null; gcOrg: string | null;
}): Promise<number> {
  return insertFor(tx, await recipientsOf(tx, input), {
    projectId: input.projectId, kind: 'note', scope: input.scope, noteId: input.noteId,
  });
}

/**
 * 반려·보완요청을 펼친다 — 그 일의 트랜잭션 안에서. 같은 서류의 안 읽은 반려 알림은 먼저 거둔다(사유를 고쳐
 * 다시 반려하면 알림이 둘 서지 않게 — 새 사유 하나만).
 */
export async function notifyReview(tx: TxLike, input: {
  projectId: string; kind: 'reject' | 'ask'; scope: NoteScope; actorId: string;
  docKind: string | null; title: string; body: string;
}): Promise<number> {
  await retractReview(tx, { projectId: input.projectId, kind: input.kind, docKind: input.docKind });
  const [p] = await tx.select({ salesOrg: projects.salesOrg, gcOrg: projects.gcOrg })
    .from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!p) return 0;
  const to = await recipientsOf(tx, { scope: input.scope, actorId: input.actorId, salesOrg: p.salesOrg, gcOrg: p.gcOrg });
  return insertFor(tx, to, {
    projectId: input.projectId, kind: input.kind, scope: input.scope,
    docKind: input.docKind, title: input.title, body: input.body,
  });
}

/** 풀린 반려·취소된 보완요청의 안 읽은 알림을 거둔다 — docKind 를 주면 그 서류 것만 */
export async function retractReview(tx: TxLike, input: {
  projectId: string; kind: 'reject' | 'ask'; docKind?: string | null;
}): Promise<void> {
  const conds: SQL[] = [
    eq(notifications.projectId, input.projectId), eq(notifications.kind, input.kind), isNull(notifications.readAt),
  ];
  if (input.docKind) conds.push(eq(notifications.docKind, input.docKind));
  await tx.delete(notifications).where(and(...conds));
}

const KINDS: NotificationKind[] = ['note', 'reject', 'ask'];

export const notificationStore: Pick<
  ProjectRepository,
  'listNotifications' | 'countUnreadNotifications' | 'markNotificationsRead' | 'unreadOnProject'
> = {
  async listNotifications(me, limit = 100): Promise<NoteNotification[]> {
    const rows = await getDb()
      .select({
        id: notifications.id, kind: notifications.kind, projectId: notifications.projectId, noteId: notifications.noteId,
        scope: notifications.scope, title: notifications.title, ownBody: notifications.body,
        createdAt: notifications.createdAt, readAt: notifications.readAt,
        projectName: projects.name,
        noteAuthor: projectNotes.author, noteBody: projectNotes.body, noteScope: projectNotes.scope,
      })
      .from(notifications)
      .innerJoin(projects, eq(projects.id, notifications.projectId))
      .leftJoin(projectNotes, eq(projectNotes.id, notifications.noteId))
      .where(and(eq(notifications.userId, me.id), accessible(me)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return rows.map((r) => {
      const kind = (KINDS as string[]).includes(r.kind) ? (r.kind as NotificationKind) : 'note';
      const scope = r.scope ?? r.noteScope;
      return {
        id: r.id,
        kind,
        projectId: r.projectId,
        projectName: r.projectName,
        noteId: r.noteId,
        title: r.title,
        scope: isNoteScope(scope) ? scope : '시공',
        // 반려·보완요청은 한백만 한다
        author: kind === 'note' ? r.noteAuthor ?? '' : '한백',
        body: (kind === 'note' ? r.noteBody : r.ownBody) ?? '',
        at: stampOf(r.createdAt),
        read: r.readAt !== null,
      };
    });
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
    const conds: SQL[] = [eq(notifications.userId, userId), isNull(notifications.readAt)];
    if (where.id) conds.push(eq(notifications.id, where.id));
    if (where.projectId) conds.push(eq(notifications.projectId, where.projectId));
    if (where.scope) conds.push(eq(notifications.scope, where.scope));
    const done = await getDb().update(notifications).set({ readAt: new Date() }).where(and(...conds))
      .returning({ id: notifications.id });
    return done.length;
  },

  /** 이 현장에서 내가 아직 안 읽은 것 — 글(「새 글」 표시)과 알림이 남은 갈래(그 탭을 열면 읽음) */
  async unreadOnProject(userId, projectId): Promise<{ noteIds: string[]; scopes: NoteScope[] }> {
    const rows = await getDb()
      .select({ noteId: notifications.noteId, scope: notifications.scope })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.projectId, projectId), isNull(notifications.readAt)));
    return {
      noteIds: [...new Set(rows.flatMap((r) => (r.noteId ? [r.noteId] : [])))],
      scopes: [...new Set(rows.flatMap((r) => (isNoteScope(r.scope) ? [r.scope] : [])))],
    };
  },
};

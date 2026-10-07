/**
 * 공지의 메모 — 한백과 협력사 모두가 보는 한 줄기 (한백 지시 2026-10-07, migrations/0094 · 0095).
 *
 * 「메시지는 협력사별로 보내는 게 아니라 모든 협력사에게 다 보내는 거야」 — 누가 써도 모두가 보고, 쓴 사람 빼고
 * 모두(한백 관리자·협력사)에게 알림이 간다. 열람 전용은 읽기만 한다. 여기서 그 문을 개발 DB 에 대고 본다.
 * 개발 DB 계정: admin · navy(네이비인프라) · ecoelec(에코일렉) · lnselec(엘앤에스) · viewer · finance(열람 전용).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/notices/[id]/messages/route';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, call, signIn, signOut } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const me = (u: (typeof USERS)[keyof typeof USERS]) => ({ id: u.id, role: u.role, org: u.org });
let noticeId = '';

/** 이 공지의 내 알림 — 다른 시험이 남긴 줄과 섞이지 않게 공지로 거른다 */
const noticeAlerts = async (u: (typeof USERS)[keyof typeof USERS]) =>
  (await repo.listNotifications(me(u))).filter((n) => n.noticeId === noticeId);
const memosFor = async (u: (typeof USERS)[keyof typeof USERS]) =>
  (await repo.listNoticeMessages(me(u))).filter((m) => m.noticeId === noticeId);

beforeAll(async () => {
  noticeId = await repo.saveNotice({ title: `[시험 ${RUN}] 공지`, body: '메모 시험' }, admin);
});
afterAll(async () => {
  // 공지를 지우면 메모와 그 알림이 같이 지워진다(cascade)
  if (noticeId) await repo.deleteNotice(noticeId, admin);
});

describe('공지 메모 — 모두가 보는 한 줄기', () => {
  it('★한백이 남기면 협력사 모두가 받는다★ — 쓴 사람·열람 전용은 빼고', async () => {
    await repo.addNoticeMessage({ noticeId, body: '새 양식으로 내주세요.' }, admin);
    for (const u of [USERS.navy, USERS.ecoelec]) {
      const got = await noticeAlerts(u);
      expect(got, u.id).toHaveLength(1);
      expect(got[0]).toMatchObject({ kind: 'notice', author: '한백', body: '새 양식으로 내주세요.', read: false });
      expect(got[0].noticeTitle).toContain(RUN);
    }
    expect(await noticeAlerts(USERS.admin), '쓴 사람').toHaveLength(0);
    expect(await noticeAlerts(USERS.viewer), '열람 전용').toHaveLength(0);
  });

  it('협력사가 남기면 한백 관리자와 다른 협력사가 받고, 모두가 같은 줄기를 본다', async () => {
    await repo.addNoticeMessage({ noticeId, body: '언제부터인가요?' }, actorOf(USERS.navy));
    expect((await noticeAlerts(USERS.admin)).map((n) => n.author)).toEqual(['네이비인프라']);
    expect((await noticeAlerts(USERS.ecoelec)).map((n) => n.author).sort()).toEqual(['네이비인프라', '한백']);
    expect((await noticeAlerts(USERS.navy)).map((n) => n.author), '제 글은 안 받는다').toEqual(['한백']);
    for (const u of [USERS.navy, USERS.ecoelec, USERS.viewer, USERS.admin]) {
      expect((await memosFor(u)).map((m) => m.author), u.id).toEqual(['한백', '네이비인프라']);
    }
  });

  it('열람 전용은 못 남긴다 (403)', async () => {
    await signIn(USERS.viewer);
    const r = await call(POST, { params: { id: noticeId }, body: { body: '재무팀 질문' } });
    signOut();
    expect(r.status).toBe(403);
  });

  it('공지를 펼치면 그 공지의 알림이 읽힌다 — 안 읽은 수에서 빠진다', async () => {
    const before = await repo.countUnreadNotifications(me(USERS.ecoelec));
    const marked = await repo.markNotificationsRead(USERS.ecoelec.id, { noticeId });
    expect(marked).toBe(2);
    expect(await repo.countUnreadNotifications(me(USERS.ecoelec))).toBe(before - 2);
    expect((await noticeAlerts(USERS.ecoelec)).every((n) => n.read)).toBe(true);
  });

  it('지우기는 쓴 사람만 — 지우면 그 글의 알림도 사라진다', async () => {
    const id = await repo.addNoticeMessage({ noticeId, body: '지울 글' }, actorOf(USERS.navy));
    await expect(repo.deleteNoticeMessage(id, admin)).rejects.toThrow(/내가 남긴 메모만/);
    expect((await noticeAlerts(USERS.admin)).some((n) => n.body === '지울 글')).toBe(true);
    await repo.deleteNoticeMessage(id, actorOf(USERS.navy));
    expect((await noticeAlerts(USERS.admin)).some((n) => n.body === '지울 글')).toBe(false);
    expect((await memosFor(USERS.ecoelec)).some((m) => m.body === '지울 글')).toBe(false);
  });
});

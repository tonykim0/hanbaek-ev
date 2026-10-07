/**
 * 공지의 메시지 — 협력사 ↔ 한백 (한백 지시 2026-10-07, migrations/0094).
 *
 * ★대화는 공지 × 협력사마다 한 줄기다★ — 같은 공지를 여러 업체가 보므로 한 업체의 말이 다른 업체에 새면 안 된다.
 * 여기서 그 문(누가 읽나 · 누가 쓰나 · 누가 알림을 받나 · 누가 지우나)을 개발 DB 에 대고 본다.
 * 시드 계정: navy = 네이비인프라(영업사) · daesang = 대상전력(시공사) · admin · viewer.
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

beforeAll(async () => {
  noticeId = await repo.saveNotice({ title: `[시험 ${RUN}] 공지`, body: '메시지 시험' }, admin);
});
afterAll(async () => {
  // 공지를 지우면 메시지와 그 알림이 같이 지워진다(cascade)
  if (noticeId) await repo.deleteNotice(noticeId, admin);
});

describe('공지 메시지 — 업체마다 한 줄기', () => {
  it('협력사가 남기면 한백 관리자가 알림을 받고, 다른 업체는 글도 알림도 못 본다', async () => {
    await repo.addNoticeMessage({ noticeId, body: '이 양식 언제부터 쓰나요?' }, actorOf(USERS.navy));

    const forAdmin = await noticeAlerts(USERS.admin);
    expect(forAdmin).toHaveLength(1);
    expect(forAdmin[0]).toMatchObject({ kind: 'notice', author: '네이비인프라', org: '네이비인프라', read: false });
    expect(forAdmin[0].noticeTitle).toContain(RUN);

    expect(await noticeAlerts(USERS.navy), '쓴 사람은 안 받는다').toHaveLength(0);
    expect(await noticeAlerts(USERS.daesang), '다른 업체').toHaveLength(0);
    expect((await repo.listNoticeMessages(me(USERS.daesang))).filter((m) => m.noticeId === noticeId)).toHaveLength(0);
    expect((await repo.listNoticeMessages(me(USERS.viewer))).filter((m) => m.noticeId === noticeId), '열람 전용은 읽는다').toHaveLength(1);
  });

  it('한백이 그 업체에 답하면 그 업체만 알림을 받는다', async () => {
    await repo.addNoticeMessage({ noticeId, body: '다음 주부터입니다.', org: '네이비인프라' }, admin);
    const navy = await noticeAlerts(USERS.navy);
    expect(navy).toHaveLength(1);
    expect(navy[0]).toMatchObject({ author: '한백', body: '다음 주부터입니다.' });
    expect(await noticeAlerts(USERS.daesang)).toHaveLength(0);
    // 협력사 화면에는 제 줄기의 두 글이 대화 순서로
    const mine = (await repo.listNoticeMessages(me(USERS.navy))).filter((m) => m.noticeId === noticeId);
    expect(mine.map((m) => m.author)).toEqual(['네이비인프라', '한백']);
  });

  it('★한백이 먼저 보낸다★ — 아직 오간 메모가 없는 업체에도 남기면 그 업체만 알림을 받는다', async () => {
    // 에코일렉 — 개발 DB 에 계정이 있는 업체(대상전력은 시드 계정이 DB 에 없어 저장소가 거절한다)
    await repo.addNoticeMessage({ noticeId, body: '이 양식으로 다시 내주세요.', org: '에코일렉' }, admin);
    const eco = await noticeAlerts(USERS.ecoelec);
    expect(eco).toHaveLength(1);
    expect(eco[0]).toMatchObject({ author: '한백', org: '에코일렉', body: '이 양식으로 다시 내주세요.' });
    expect((await noticeAlerts(USERS.navy)).some((n) => n.org === '에코일렉'), '다른 업체').toBe(false);
  });

  it('★협력사가 남의 업체를 적어 보내도 제 업체 줄기에 남는다★ — 끼어들 수 없다', async () => {
    await repo.addNoticeMessage({ noticeId, body: '끼어들기', org: '네이비인프라' }, actorOf(USERS.daesang));
    const navySees = (await repo.listNoticeMessages(me(USERS.navy))).filter((m) => m.noticeId === noticeId);
    expect(navySees.some((m) => m.body === '끼어들기')).toBe(false);
    const daesangSees = (await repo.listNoticeMessages(me(USERS.daesang))).filter((m) => m.noticeId === noticeId);
    expect(daesangSees.find((m) => m.body === '끼어들기')?.org).toBe('대상전력');
    expect(daesangSees.every((m) => m.org === '대상전력')).toBe(true);
  });

  it('한백이 계정 없는 업체에 답하면 거절한다 — 받을 사람이 없는 줄기를 만들지 않는다', async () => {
    await expect(repo.addNoticeMessage({ noticeId, body: '?', org: `없는업체-${RUN}` }, admin)).rejects.toThrow(/계정이 없습니다/);
  });

  it('열람 전용은 못 남긴다 (403)', async () => {
    await signIn(USERS.viewer);
    const r = await call(POST, { params: { id: noticeId }, body: { body: '재무팀 질문' } });
    signOut();
    expect(r.status).toBe(403);
  });

  it('공지를 펼치면 그 공지의 알림이 읽힌다 — 안 읽은 수에서 빠진다', async () => {
    const before = await repo.countUnreadNotifications(me(USERS.admin));
    const marked = await repo.markNotificationsRead(USERS.admin.id, { noticeId });
    expect(marked).toBeGreaterThanOrEqual(1);
    expect(await repo.countUnreadNotifications(me(USERS.admin))).toBe(before - marked);
    expect((await noticeAlerts(USERS.admin)).every((n) => n.read)).toBe(true);
  });

  it('지우기는 쓴 사람만 — 지우면 그 글의 알림도 사라진다', async () => {
    const id = await repo.addNoticeMessage({ noticeId, body: '지울 글' }, actorOf(USERS.navy));
    await expect(repo.deleteNoticeMessage(id, admin)).rejects.toThrow(/내가 남긴 메모만/);
    expect((await noticeAlerts(USERS.admin)).some((n) => n.body === '지울 글')).toBe(true);
    await repo.deleteNoticeMessage(id, actorOf(USERS.navy));
    expect((await noticeAlerts(USERS.admin)).some((n) => n.body === '지울 글')).toBe(false);
  });
});

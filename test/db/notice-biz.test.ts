/**
 * 공지는 사업마다 따로다 (2026-11-04, migrations/0116 — 한백 「태양광에 있는 공지내용은 지워줘야지 전기차만 해당되는데,
 * 모든 공지와 알림은 분리해(전기차/태양광)」).
 *
 * 목록 · 안 읽은 수 · 읽음 시각이 사업마다 따로이고, 태양광 공지의 메모는 태양광을 보는 계정 사이에서만 오간다(알림도
 * 태양광으로). 개발 DB 계정: ecoelec 은 태양광 참여(0105), navy 는 아니다 — 시험 처음에 그 전제를 확인한다(daesang 은
 * 개발 DB 의 users 에 줄이 없는 파일 계정이라 쓰지 않는다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { POST as createNotice } from '@/app/api/notices/route';
import { GET as unreadRoute } from '@/app/api/notices/unread/route';
import { POST as readRoute } from '@/app/api/notices/read/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { notices, notifications, users } from '@/lib/db/schema';
import { RUN, USERS, actorOf, call, signIn, signOut } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const me = (u: (typeof USERS)[keyof typeof USERS]) => ({ id: u.id, role: u.role, org: u.org });
let evId = '';
let solarId = '';
const made: string[] = [];

/** 쿼리 문자열을 단 GET — kit.call 은 주소를 고정하므로 직접 만든다 */
async function getUnread(biz: string): Promise<number> {
  const res = await unreadRoute(new Request(`http://test.local/api/notices/unread?biz=${biz}`));
  return ((await res.json()) as { count: number }).count;
}

beforeAll(async () => {
  const flags = await getDb().select({ id: users.id, solar: users.solar }).from(users)
    .where(inArray(users.id, [USERS.ecoelec.id, USERS.navy.id]));
  const solarOf = (id: string) => flags.find((f) => f.id === id)?.solar;
  expect(solarOf(USERS.ecoelec.id), '전제 — 에코일렉은 태양광 참여 계정(migrations/0105)').toBe(true);
  expect(solarOf(USERS.navy.id), '전제 — 네이비인프라는 태양광 참여가 아니다').toBe(false);

  evId = await repo.saveNotice({ title: `[시험 ${RUN}] 전기차 공지`, body: '전기차' }, admin);
  solarId = await repo.saveNotice({ title: `[시험 ${RUN}] 태양광 공지`, body: '태양광', biz: 'solar' }, admin);
  made.push(evId, solarId);
});
afterAll(async () => {
  signOut();
  // 공지를 지우면 메모와 그 알림이 같이 지워진다(cascade)
  for (const id of made) await repo.deleteNotice(id, admin).catch(() => undefined);
});

describe('공지 — 사업마다 따로', () => {
  it('목록은 그 사업의 공지만 — 사업을 안 주면 전기차(그전 공지가 전부 전기차)', async () => {
    const ev = (await repo.listNotices('ev')).map((n) => n.id);
    const solar = (await repo.listNotices('solar')).map((n) => n.id);
    expect(ev).toContain(evId);
    expect(ev).not.toContain(solarId);
    expect(solar).toContain(solarId);
    expect(solar).not.toContain(evId);
    expect((await repo.listNotices()).map((n) => n.id)).toEqual(ev);
  });

  it('읽음은 사업마다 — 태양광 공지 화면을 연 것이 전기차 공지를 읽은 것이 아니다', async () => {
    const u = USERS.ecoelec.id;
    await repo.markNoticesRead(u, 'solar');
    expect(await repo.countUnreadNotices(u, 'solar')).toBe(0);
    expect(await repo.countUnreadNotices(u, 'ev'), '전기차 공지는 그대로 안 읽음').toBeGreaterThan(0);
    await repo.markNoticesRead(u, 'ev');
    expect(await repo.countUnreadNotices(u, 'ev')).toBe(0);
  });

  it('쓴 사람의 배지에는 제 공지가 안 선다 — 그 사업의 읽음 칸에 찍힌다', async () => {
    const id = await repo.saveNotice({ title: `[시험 ${RUN}] 태양광 공지 둘`, body: '둘', biz: 'solar' }, admin);
    made.push(id);
    expect(await repo.countUnreadNotices(USERS.admin.id, 'solar')).toBe(0);
  });

  it('라우트 — 태양광을 안 보는 계정에게 태양광 공지는 0 이고, 읽음 본문의 사업을 따른다', async () => {
    await signIn(USERS.navy);
    expect(await getUnread('solar'), '태양광 공지가 있어도 네이비인프라에게는 0').toBe(0);

    await signIn(USERS.ecoelec);
    const solarDb = await repo.countUnreadNotices(USERS.ecoelec.id, 'solar');
    expect(await getUnread('solar')).toBe(solarDb);
    const r = await call(readRoute, { method: 'POST', body: { biz: 'solar' } });
    expect(r.status).toBe(200);
    expect(await repo.countUnreadNotices(USERS.ecoelec.id, 'solar')).toBe(0);
  });

  it('공지 등록 — biz 를 그대로 남기고, 모르는 사업은 400', async () => {
    await signIn(USERS.admin);
    const ok = await call(createNotice, { body: { title: `[시험 ${RUN}] 라우트 태양광`, body: '라우트', biz: 'solar' } });
    expect(ok.status).toBe(200);
    const id = String(ok.json?.id);
    made.push(id);
    const [row] = await getDb().select({ biz: notices.biz }).from(notices).where(eq(notices.id, id));
    expect(row?.biz).toBe('solar');
    const bad = await call(createNotice, { body: { title: 'x', body: 'y', biz: 'wind' } });
    expect(bad.status).toBe(400);
  });
});

describe('공지 메모 — 그 공지의 사업을 따른다', () => {
  const alertsOf = async (msgId: string) =>
    getDb().select({ userId: notifications.userId, biz: notifications.biz }).from(notifications)
      .where(and(eq(notifications.noticeMsgId, msgId)));

  it('태양광 공지의 메모는 태양광을 보는 계정에게만, 태양광 알림으로', async () => {
    const msgId = await repo.addNoticeMessage({ noticeId: solarId, body: '태양광 메모' }, admin);
    const got = await alertsOf(msgId);
    const to = got.map((a) => a.userId);
    expect(to).toContain(USERS.ecoelec.id);
    expect(to, '태양광 참여가 아닌 협력사는 안 받는다').not.toContain(USERS.navy.id);
    expect(new Set(got.map((a) => a.biz))).toEqual(new Set(['solar']));
  });

  it('전기차 공지의 메모는 지금까지처럼 모두에게, 전기차 알림으로', async () => {
    const msgId = await repo.addNoticeMessage({ noticeId: evId, body: '전기차 메모' }, admin);
    const got = await alertsOf(msgId);
    const to = got.map((a) => a.userId);
    expect(to).toEqual(expect.arrayContaining([USERS.ecoelec.id, USERS.navy.id]));
    expect(new Set(got.map((a) => a.biz))).toEqual(new Set(['ev']));
  });

  it('태양광 공지에는 태양광을 안 보는 협력사가 메모를 못 남긴다 — 보는 협력사는 남긴다', async () => {
    await expect(repo.addNoticeMessage({ noticeId: solarId, body: '못 남김' }, actorOf(USERS.navy)))
      .rejects.toThrow('태양광 참여');
    await expect(repo.addNoticeMessage({ noticeId: solarId, body: '에코일렉' }, actorOf(USERS.ecoelec)))
      .resolves.toBeTruthy();
  });

  it('메모 목록도 그 사업의 공지 것만', async () => {
    const ev = await repo.listNoticeMessages(me(USERS.admin), 'ev');
    const solar = await repo.listNoticeMessages(me(USERS.admin), 'solar');
    expect(ev.some((m) => m.noticeId === solarId)).toBe(false);
    expect(solar.some((m) => m.noticeId === solarId)).toBe(true);
    expect(solar.some((m) => m.noticeId === evId)).toBe(false);
  });
});

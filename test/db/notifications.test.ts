/**
 * 진행현황 글이 상대방에게 알림으로 간다 (한백 지시 2026-10-05 · lib/notify.ts).
 * 시험 현장: 영업사 네이비인프라(navy) · 시공사 에코일렉(ecoelec). ★받는 사람은 DB 의 users 에서 찾는다★ —
 * 개발 DB 에는 대상전력(daesang) 줄이 없어(파일 계정으로만 로그인된다) 그 회사를 시공사로 두면 받을 계정이 없다.
 */
import { describe, expect, it } from 'vitest';
import { POST as notePOST, DELETE as noteDELETE } from '@/app/api/projects/[id]/notes/route';
import { GET as listGET } from '@/app/api/notifications/route';
import { GET as unreadGET } from '@/app/api/notifications/unread/route';
import { POST as readPOST } from '@/app/api/notifications/read/route';
import { getRepository } from '@/lib/data';
import { USERS, call, signIn, signInAs, withProject } from './kit';

const repo = getRepository();
const site = { salesOrg: USERS.navy.org, gcOrg: USERS.ecoelec.org };
const me = (u: (typeof USERS)[keyof typeof USERS]) => ({ id: u.id, role: u.role, org: u.org });
const unread = async (u: (typeof USERS)[keyof typeof USERS], projectId: string) =>
  (await repo.listNotifications(me(u))).filter((n) => n.projectId === projectId && !n.read);

describe('진행현황 알림', () => {
  it('협력사가 남기면 한백 관리자에게 — 열람 전용·다른 협력사·쓴 사람은 받지 않는다', () => withProject(async (id) => {
    await signIn(USERS.ecoelec);
    expect((await call(notePOST, { params: { id }, body: { body: '관리사무소 요청으로 착공 연기', scope: '시공' } })).status).toBe(200);
    const got = await unread(USERS.admin, id);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ author: '에코일렉', scope: '시공', body: '관리사무소 요청으로 착공 연기' });
    expect(await unread(USERS.viewer, id)).toHaveLength(0);
    expect(await unread(USERS.navy, id)).toHaveLength(0);
    expect(await unread(USERS.ecoelec, id)).toHaveLength(0);
    // 라우트 — 수·목록이 같은 것을 센다
    await signIn(USERS.admin);
    const n = await call(unreadGET, { method: 'GET' });
    expect(Number(n.json?.count)).toBeGreaterThanOrEqual(1);
    const list = await call(listGET, { method: 'GET' });
    expect((list.json?.items as Array<{ projectId: string }>).some((x) => x.projectId === id)).toBe(true);
  }, site));

  it('한백이 남기면 그 일을 맡은 협력사에게 — 계약은 영업사, 시공은 시공사, 기성은 아무에게도', () => withProject(async (id) => {
    await signIn(USERS.admin);
    for (const [scope, body] of [['계약', '계약서 날인면 보완'], ['시공', '착공계 보완'], ['기성', '운영사 기성 지연']] as const) {
      expect((await call(notePOST, { params: { id }, body: { body, scope } })).status).toBe(200);
    }
    expect((await unread(USERS.navy, id)).map((x) => x.body)).toEqual(['계약서 날인면 보완']);
    expect((await unread(USERS.ecoelec, id)).map((x) => x.body)).toEqual(['착공계 보완']);
    expect(await unread(USERS.admin, id)).toHaveLength(0);
  }, site));

  it('읽음 — 현장·갈래 하나만 찍힌다 · 대행 중에는 안 찍힌다 · 「모두 읽음」', () => withProject(async (id) => {
    await signIn(USERS.ecoelec);
    await call(notePOST, { params: { id }, body: { body: '시공 쪽 이야기', scope: '시공' } });
    await call(notePOST, { params: { id }, body: { body: '계약 쪽 이야기', scope: '계약' } });
    expect(await unread(USERS.admin, id)).toHaveLength(2);
    // 대행 — 관리자가 에코일렉 눈으로 「모두 읽음」을 눌러도 아무것도 안 찍힌다
    await signInAs(USERS.admin, USERS.ecoelec.id);
    expect(Number((await call(readPOST, { method: 'POST', body: {} })).json?.marked)).toBe(0);
    expect(await unread(USERS.admin, id)).toHaveLength(2);
    // 계약 탭을 열면 계약 글만
    await signIn(USERS.admin);
    expect(Number((await call(readPOST, { method: 'POST', body: { projectId: id, scope: '계약' } })).json?.marked)).toBe(1);
    expect((await unread(USERS.admin, id)).map((x) => x.body)).toEqual(['시공 쪽 이야기']);
    expect(await repo.unreadNoteIds(USERS.admin.id, id)).toHaveLength(1);
    // 열람 전용도 제 것을 찍는다(받은 것이 없어 0)
    await signIn(USERS.viewer);
    expect((await call(readPOST, { method: 'POST', body: {} })).status).toBe(200);
    // 모두 읽음
    await signIn(USERS.admin);
    await call(readPOST, { method: 'POST', body: {} });
    expect(await unread(USERS.admin, id)).toHaveLength(0);
  }, site));

  it('글을 지우면 알림도 사라진다', () => withProject(async (id) => {
    await signIn(USERS.navy);
    await call(notePOST, { params: { id }, body: { body: '잘못 남긴 글', scope: '계약' } });
    const [n] = await unread(USERS.admin, id);
    expect(n).toBeDefined();
    expect((await call(noteDELETE, { method: 'DELETE', params: { id }, body: { noteId: n.noteId } })).status).toBe(200);
    expect((await repo.listNotifications(me(USERS.admin))).some((x) => x.noteId === n.noteId)).toBe(false);
  }, site));
});

/**
 * 공지 읽음 표시는 화면을 연 사람에게 찍힌다 — 감사 2026-09-04 L20.
 * 관리자가 협력사 계정으로 대행 중일 때 세션의 id 는 협력사다. 읽음은 관리자 본인(via)에게 찍혀야 한다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/notices/read/route';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, call, signInAs } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
let noticeId: string;

beforeAll(async () => {
  noticeId = await repo.saveNotice({ title: `[시험 ${RUN}] 공지`, body: '읽음 표시 시험' }, admin);
});
afterAll(async () => {
  await repo.deleteNotice(noticeId, admin).catch(() => undefined);
});

describe('공지 읽음 표시', () => {
  it('L20 — 대행 중 읽음은 대행 대상이 아니라 관리자 본인에게 찍힌다', async () => {
    const partnerBefore = await repo.countUnreadNotices(USERS.daesang.id);
    expect(await repo.countUnreadNotices(USERS.admin.id), '새 공지가 있으니 관리자는 안 읽은 것이 있다').toBeGreaterThan(0);
    await signInAs(USERS.admin, USERS.daesang.id);
    const r = await call(POST, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(await repo.countUnreadNotices(USERS.admin.id), '관리자 본인이 읽었다').toBe(0);
    expect(await repo.countUnreadNotices(USERS.daesang.id), '대행 대상은 그대로').toBe(partnerBefore);
  });
});

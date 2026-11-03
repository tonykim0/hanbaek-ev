/**
 * 알림은 사업마다 따로다 (2026-11-03, migrations/0107 — 한백 「지금까지 모든 알림은 전기차 알림이라 전기차 페이지에서만」).
 * 목록 · 배지 · 「모두 읽음」이 그 사업의 것만 본다. 태양광 알림을 남기는 일은 아직 없어 줄을 직접 넣어 본다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { notifications } from '@/lib/db/schema';
import { RUN, USERS } from './kit';

const made: string[] = [];
const admin = { id: USERS.admin.id, role: USERS.admin.role, org: USERS.admin.org };

async function put(biz: 'ev' | 'solar') {
  const id = crypto.randomUUID();
  made.push(id);
  await getDb().insert(notifications).values({ id, userId: 'admin', kind: 'note', title: `사업 시험 ${RUN}`, body: biz, biz });
  return id;
}

afterAll(async () => {
  if (made.length) await getDb().delete(notifications).where(inArray(notifications.id, made));
});

describe('알림 — 사업마다 따로', () => {
  it('태양광 알림은 전기차 목록 · 배지에 안 서고, 태양광 쪽에만 선다', async () => {
    const repo = getRepository();
    const evBefore = await repo.countUnreadNotifications(admin, 'ev');
    const solarBefore = await repo.countUnreadNotifications(admin, 'solar');
    const solarId = await put('solar');
    expect(await repo.countUnreadNotifications(admin, 'ev')).toBe(evBefore);
    expect(await repo.countUnreadNotifications(admin, 'solar')).toBe(solarBefore + 1);
    expect((await repo.listNotifications(admin, 500, 'ev')).map((n) => n.id)).not.toContain(solarId);
    expect((await repo.listNotifications(admin, 500, 'solar')).map((n) => n.id)).toContain(solarId);
  });

  it('사업을 안 주면 전기차다 — 지금까지 부르던 곳(현장 상세 · 옛 배지)이 그대로 전기차를 본다', async () => {
    const repo = getRepository();
    const evId = await put('ev');
    expect((await repo.listNotifications(admin)).map((n) => n.id)).toContain(evId);
    expect(await repo.countUnreadNotifications(admin)).toBe(await repo.countUnreadNotifications(admin, 'ev'));
  });

  it('「모두 읽음」은 그 사업의 것만 찍는다', async () => {
    const repo = getRepository();
    const solarId = await put('solar');
    // 전기차 「모두 읽음」 범위로는 태양광 줄이 안 찍힌다
    expect(await repo.markNotificationsRead('admin', { id: solarId, biz: 'ev' })).toBe(0);
    expect(await repo.markNotificationsRead('admin', { id: solarId, biz: 'solar' })).toBe(1);
  });
});

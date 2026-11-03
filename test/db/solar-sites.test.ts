/**
 * 태양광 상담 접수의 문 (2026-11-03 — 「에코일렉은 태양광도 같이할거야 · 현장관리에서 상담 개소 접수」).
 *
 * 누가 접수하나(태양광 참여 협력사 · 한백 관리자) · 누가 보나(협력사는 제 소속만) · 누가 고치고 지우나(담당 협력사 · 한백) ·
 * 담당은 누가 정하나(협력사는 제 소속으로 굳고, 한백만 고른다) · 번호는 다시 쓰지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { POST } from '@/app/api/solar/sites/route';
import { DELETE, PATCH } from '@/app/api/solar/sites/[id]/route';
import { SITE_NOT_FOUND, solarSiteStore } from '@/lib/data/solar-sites';
import { getDb } from '@/lib/db/client';
import { auditLog, solarSites, users } from '@/lib/db/schema';
import { call, RUN, signIn, USERS, viewerOf } from './kit';

const made: string[] = [];
const body = (over: Record<string, unknown> = {}) => ({
  name: `시험 태양광 ${RUN}`,
  address: '충북 충주시 산척면 동충주산단4길 17',
  kind: 'roof',
  customer: '김담당',
  phone: '010-0000-0000',
  memo: '경계 시험',
  ...over,
});

async function create(user: (typeof USERS)[keyof typeof USERS], over: Record<string, unknown> = {}) {
  await signIn(user);
  const r = await call(POST, { body: body(over) });
  if (r.status === 200) made.push(String(r.json?.id));
  return r;
}

const setSolar = (id: string, on: boolean) => getDb().update(users).set({ solar: on }).where(eq(users.id, id));

beforeAll(async () => {
  // 전제 — 에코일렉은 참여(migrations/0105 가 켠다), 대상전력은 안 함
  await setSolar('ecoelec', true);
  await setSolar('daesang', false);
});

afterAll(async () => {
  await setSolar('ecoelec', true);
  if (made.length) await getDb().delete(solarSites).where(inArray(solarSites.id, made));
});

describe('상담 접수 — 누가', () => {
  it('참여 협력사가 접수하면 제 소속이 담당이다 — 보낸 org 는 안 본다', async () => {
    const r = await create(USERS.ecoelec, { org: '대상전력' });
    expect(r.status).toBe(200);
    expect(String(r.json?.id)).toMatch(/^SL-\d{4}-\d{3,}$/);
    const site = await solarSiteStore.get(String(r.json?.id), viewerOf(USERS.admin));
    expect(site?.org).toBe('에코일렉');
    expect(site?.createdBy).toBe('ecoelec');
  });

  it('참여하지 않는 협력사는 접수 못 한다(422) · 열람 전용은 쓰기가 없다(403)', async () => {
    expect((await create(USERS.daesang)).status).toBe(422);
    expect((await create(USERS.viewer)).status).toBe(403);
  });

  it('빈 현장명은 접수가 아니다 — 서버가 한 번 더 본다', async () => {
    const r = await create(USERS.ecoelec, { name: '  ' });
    expect(r.status).toBe(422);
    expect(String(r.json?.error)).toContain('현장명');
  });

  it('한백 관리자는 담당을 고른다 — 참여 협력사 · 「한백 직접」(비움)만, 참여하지 않는 곳은 못 고른다', async () => {
    expect((await create(USERS.admin, { org: '대상전력' })).status).toBe(422);
    const a = await create(USERS.admin, { org: '에코일렉' });
    const b = await create(USERS.admin, { org: null });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await solarSiteStore.get(String(b.json?.id), viewerOf(USERS.admin)))?.org).toBeNull();
  });
});

describe('보기 — 협력사는 제 소속만, 한백은 전부', () => {
  it('목록 · 한 곳 모두 소속으로 가른다', async () => {
    const r = await create(USERS.ecoelec);
    const id = String(r.json?.id);
    expect((await solarSiteStore.list(viewerOf(USERS.ecoelec))).map((s) => s.id)).toContain(id);
    expect((await solarSiteStore.list(viewerOf(USERS.admin))).map((s) => s.id)).toContain(id);
    expect((await solarSiteStore.list(viewerOf(USERS.daesang))).map((s) => s.id)).not.toContain(id);
    expect(await solarSiteStore.get(id, viewerOf(USERS.daesang))).toBeNull();
  });
});

describe('고치기 · 지우기 — 담당 협력사와 한백', () => {
  it('남의 현장은 「찾지 못했습니다」 — 있는지도 안 알린다', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    await signIn(USERS.daesang);
    const p = await call(PATCH, { method: 'PATCH', body: { phone: '1' }, params: { id } });
    const d = await call(DELETE, { method: 'DELETE', params: { id } });
    expect([p.status, d.status]).toEqual([422, 422]);
    expect(p.json?.error).toBe(SITE_NOT_FOUND);
  });

  it('담당 협력사가 고치면 그 칸만 바뀌고 감사 기록이 남는다 · 담당은 한백만 바꾼다', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    await signIn(USERS.ecoelec);
    expect((await call(PATCH, { method: 'PATCH', body: { phone: '010-1111-2222' }, params: { id } })).status).toBe(200);
    const site = await solarSiteStore.get(id, viewerOf(USERS.ecoelec));
    expect([site?.phone, site?.name]).toEqual(['010-1111-2222', `시험 태양광 ${RUN}`]);
    const logs = await getDb().select().from(auditLog).where(and(eq(auditLog.action, `태양광 ${id}`), eq(auditLog.field, '연락처')));
    expect(logs.map((l) => [l.oldValue, l.newValue])).toEqual([['010-0000-0000', '010-1111-2222']]);
    expect((await call(PATCH, { method: 'PATCH', body: { org: null }, params: { id } })).status).toBe(422);
  });

  it('참여를 끄면 그 계정은 제 현장도 못 고친다 — 지금 값을 DB 에서 읽는다', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    await setSolar('ecoelec', false);
    try {
      await signIn(USERS.ecoelec);
      expect((await call(PATCH, { method: 'PATCH', body: { memo: '끈 뒤' }, params: { id } })).status).toBe(422);
    } finally {
      await setSolar('ecoelec', true);
    }
  });

  it('지우면 사라지고, 번호는 다시 쓰지 않는다', async () => {
    const first = String((await create(USERS.ecoelec)).json?.id);
    await signIn(USERS.ecoelec);
    expect((await call(DELETE, { method: 'DELETE', params: { id: first } })).status).toBe(200);
    expect(await solarSiteStore.get(first, viewerOf(USERS.admin))).toBeNull();
    const next = String((await create(USERS.ecoelec)).json?.id);
    const seq = (id: string) => Number(id.split('-').pop());
    expect(seq(next)).toBeGreaterThan(seq(first));
  });
});

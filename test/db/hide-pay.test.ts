/**
 * 정산 안 보기(users.hide_pay) — 현장은 보고 돈은 안 본다.
 *
 * 2026-11-18 「이브이솔루션(시공)은 협력사 정산관리랑 지급관리만 안보이면돼. 그대신 모든 현장은 보여야해」 — 지급은 같은 소속의
 * 턴키 계정이 맡고 이 계정은 현장 · 시공만 본다. 시험 현장의 시공사는 대상전력(daesang · 시공사)이다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth/session';
import { inArray } from 'drizzle-orm';
import { PATCH, POST } from '@/app/api/admin/accounts/route';
import { RUN, USERS, call, signIn, signOut, viewerOf, withProject } from './kit';

describe('정산 안 보기 계정의 눈', () => {
  it('제 현장은 그대로 열리고 지급관리에는 그 현장의 줄이 하나도 없다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      const plain = viewerOf(USERS.daesang);
      const hidden = { ...plain, hidePay: true };

      // 끄기 전 — 시공비 줄이 선다
      const before = await repo.listPayoutOverview(plain);
      expect(before.plans.filter((r) => r.projectId === id).map((r) => r.kind)).toEqual(['시공비']);

      // 켠 뒤 — 현장은 열리고 돈 줄은 없다
      expect(await repo.getProject(id, hidden)).not.toBeNull();
      const after = await repo.listPayoutOverview(hidden);
      expect(after.plans.filter((r) => r.projectId === id)).toEqual([]);
      expect(after.history.filter((r) => r.projectId === id)).toEqual([]);
    });
  });
});

describe('계정설정 — 정산 보기 켜고 끄기', () => {
  // 개발 DB 의 시드 계정 navy 를 고쳤다가 되돌린다(daesang 은 파일 계정이라 DB 에 없다 · 같은 개발 DB 를 다른 시험도 쓴다)
  afterAll(async () => {
    await getDb().update(users).set({ hidePay: false }).where(eq(users.id, USERS.navy.id));
    signOut();
  });

  it('관리자가 끄면 그 계정의 세션에 실리고, 다시 켜면 풀린다', async () => {
    await signIn(USERS.admin);
    expect((await call(PATCH, { method: 'PATCH', body: { id: USERS.navy.id, hidePay: true } })).status).toBe(200);
    await signIn(USERS.navy);
    expect((await getSessionUser())?.hidePay).toBe(true);

    await signIn(USERS.admin);
    expect((await call(PATCH, { method: 'PATCH', body: { id: USERS.navy.id, hidePay: false } })).status).toBe(200);
    await signIn(USERS.navy);
    expect((await getSessionUser())?.hidePay).toBe(false);
  });

  it('한백 계정에는 못 켠다(422) · 참거짓이 아니면 400 · 협력사는 못 고친다(403)', async () => {
    await signIn(USERS.admin);
    expect((await call(PATCH, { method: 'PATCH', body: { id: USERS.viewer.id, hidePay: true } })).status).toBe(422);
    expect((await call(PATCH, { method: 'PATCH', body: { id: USERS.navy.id, hidePay: 'yes' } })).status).toBe(400);
    await signIn(USERS.navy);
    expect((await call(PATCH, { method: 'PATCH', body: { id: USERS.navy.id, hidePay: true } })).status).toBe(403);
  });
});

describe('계정 만들기 — 정산 봄 · 안 봄을 그때 고른다', () => {
  // 2026-11-23 한백 「에코일렉 앱 처럼 계정생성 당시 정산부분을 볼 수 있는 사람과 없는 사람을 구분해줘」 — 협력사 계정은 기본값 없이 골라야 만든다
  const ids = { hide: `hp-${RUN}`, see: `hs-${RUN}`, none: `hn-${RUN}`, view: `hv-${RUN}` };
  const org = `정산시험-${RUN}`;
  afterAll(async () => {
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
    signOut();
  });
  const create = (id: string, role: string, extra: Record<string, unknown>) =>
    call(POST, { body: { id, name: `시험 ${id}`, role, org, password: 'test-1234', ...extra } });
  const rowOf = async (id: string) => (await getDb().select().from(users).where(eq(users.id, id)))[0];

  it('협력사 계정은 안 고르면 400 · 고른 대로 만든다', async () => {
    await signIn(USERS.admin);
    expect((await create(ids.none, 'cons', {})).status).toBe(400);
    expect(await rowOf(ids.none)).toBeUndefined();

    expect((await create(ids.hide, 'cons', { hidePay: true })).status).toBe(200);
    expect((await rowOf(ids.hide))?.hidePay).toBe(true);
    expect((await create(ids.see, 'salesCons', { hidePay: false })).status).toBe(200);
    expect((await rowOf(ids.see))?.hidePay).toBe(false);
  });

  it('열람 전용은 고를 것이 없다 — 보내도 늘 본다', async () => {
    await signIn(USERS.admin);
    expect((await create(ids.view, 'viewer', { hidePay: true })).status).toBe(200);
    expect((await rowOf(ids.view))?.hidePay).toBe(false);
  });
});

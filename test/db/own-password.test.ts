/**
 * 내 비밀번호 바꾸기(app/api/auth/password) — 2026-11-23 한백 「각 계정에서 자기 비밀번호 재설정 할 수 있도록 해줘」.
 *
 * 시험 계정은 이 실행이 만들고 끝나면 지운다(시드 계정 navy 등은 프리뷰가 dev1234! 로 쓴다 — 건드리지 않는다).
 * 보는 것: 지금 비밀번호가 틀리면 403 · 규칙에 막히면 400 · 되면 새 쿠키 · 그 전 쿠키(발급 시각이 있든 없든)는 안 받음 ·
 * 새 비밀번호로 로그인 · 열람 전용도 바꿈 · 대행 중 403 · 한백의 재설정도 남은 로그인을 푼다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import type { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashPassword, signPayload } from '@/lib/auth/crypto';
import { getSecret, getSessionUser } from '@/lib/auth/session';
import { clearLoginLock } from '@/lib/auth/throttle';
import { userStore } from '@/lib/auth/users';
import { SESSION_COOKIE, SESSION_TTL_SEC, type User } from '@/lib/auth/types';
import { POST } from '@/app/api/auth/password/route';
import { PATCH } from '@/app/api/admin/accounts/route';
import { jar } from './cookie-jar';
import { RUN, USERS, call, signIn, signInAs, signOut } from './kit';

const partner: User = { id: `pw-${RUN}`, name: `비번 시험 ${RUN}`, role: 'sales', org: `비번시험-${RUN}` };
const viewer: User = { id: `pwv-${RUN}`, name: `비번 열람 ${RUN}`, role: 'viewer', org: null };

/** 그 계정의 지난 쿠키 — 60초 전에 발급한 것. iat 를 빼면 옛 모양(발급 시각 없음 · 만료에서 거꾸로 센다) */
async function oldCookie(u: User, withIat: boolean): Promise<string> {
  const at = Math.floor(Date.now() / 1000) - 60;
  return signPayload({ id: u.id, name: u.name, role: u.role, org: u.org, ...(withIat ? { iat: at } : {}), exp: at + SESSION_TTL_SEC }, getSecret());
}

/** 라우트를 불러 새 쿠키까지 받는다(kit.call 은 머리를 안 준다) */
async function change(current: string, next: string): Promise<{ status: number; error?: string; cookie?: string }> {
  const res = (await POST(new Request('http://test.local/api/auth/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ current, next }),
  }))) as NextResponse;
  const json = (await res.json()) as { error?: string };
  return { status: res.status, error: json.error, cookie: res.cookies.get(SESSION_COOKIE)?.value };
}

beforeAll(async () => {
  await getDb().insert(users).values([
    { id: partner.id, name: partner.name, role: partner.role, org: partner.org, passwordHash: await hashPassword('old-pass') },
    { id: viewer.id, name: viewer.name, role: viewer.role, org: null, passwordHash: await hashPassword('old-view') },
  ]);
});

afterAll(async () => {
  await getDb().delete(users).where(inArray(users.id, [partner.id, viewer.id]));
  await clearLoginLock(partner.id);
  await clearLoginLock(viewer.id);
  signOut();
});

describe('내 비밀번호 바꾸기', () => {
  it('지금 비밀번호가 틀리면 403 · 규칙에 막히면 400 — 둘 다 비밀번호는 그대로', async () => {
    await signIn(partner);
    expect(await change('wrong', 'new-pass')).toMatchObject({ status: 403, error: '현재 비밀번호가 맞지 않습니다.' });
    expect((await change('old-pass', 'ab')).status).toBe(400);
    expect((await change('old-pass', 'old-pass')).status).toBe(400);
    expect(await userStore.authenticate(partner.id, 'old-pass')).not.toBeNull();
    await clearLoginLock(partner.id);
  });

  it('되면 새 쿠키를 주고, 그 전에 발급한 쿠키는(발급 시각이 없는 옛 모양도) 안 받는다', async () => {
    const before = await oldCookie(partner, true);
    const legacy = await oldCookie(partner, false);
    jar.set(SESSION_COOKIE, before);
    expect((await getSessionUser())?.id).toBe(partner.id);

    const r = await change('old-pass', 'new-pass');
    expect(r.status).toBe(200);
    expect(r.cookie).toBeTruthy();

    // 이 기기 — 새 쿠키로 그대로 들어와 있다
    jar.set(SESSION_COOKIE, r.cookie!);
    expect((await getSessionUser())?.id).toBe(partner.id);
    // 다른 기기 — 바꾸기 전에 받은 쿠키는 풀린다
    jar.set(SESSION_COOKIE, before);
    expect(await getSessionUser()).toBeNull();
    jar.set(SESSION_COOKIE, legacy);
    expect(await getSessionUser()).toBeNull();

    expect(await userStore.authenticate(partner.id, 'new-pass')).not.toBeNull();
    expect(await userStore.authenticate(partner.id, 'old-pass')).toBeNull();
  });

  it('열람 전용도 제 비밀번호는 바꾼다(쓰기 껍데기의 403 이 아니다)', async () => {
    await signIn(viewer);
    expect((await change('old-view', 'new-view')).status).toBe(200);
    expect(await userStore.authenticate(viewer.id, 'new-view')).not.toBeNull();
  });

  it('대행 중에는 403 · 로그인 없으면 401', async () => {
    await signInAs(USERS.admin, partner.id);
    expect((await change('new-pass', 'other-pass')).status).toBe(403);
    signOut();
    expect((await change('new-pass', 'other-pass')).status).toBe(401);
  });

  it('한백의 비밀번호 재설정도 그 계정의 남은 로그인을 푼다', async () => {
    const before = await oldCookie(partner, true);
    await signIn(USERS.admin);
    expect((await call(PATCH, { method: 'PATCH', body: { id: partner.id, password: 'reset-pass' } })).status).toBe(200);
    jar.set(SESSION_COOKIE, before);
    expect(await getSessionUser()).toBeNull();
    expect(await userStore.authenticate(partner.id, 'reset-pass')).not.toBeNull();
  });
});

/**
 * 내 비밀번호 바꾸기 — 로그인한 계정 본인이(2026-11-23 한백 「각 계정에서 자기 비밀번호 재설정 할 수 있도록 해줘」 · 화면 /account/password).
 *
 *   POST { current, next }   지금 비밀번호를 대고 새 비밀번호로
 *
 * ★열람 전용도 바꾼다★ — 제 로그인을 지키는 일이지 콘솔 자료를 바꾸는 일이 아니다. 그래서 쓰기 껍데기(열람 전용 403)를 안 쓰고
 * 로그인만 본다(test/conventions/routes UNGATED_BY_DESIGN). 한백 관리자도 제 것은 바꾼다(lib/auth/users changeOwnPassword).
 * ★대행 중에는 막는다★ — 대행 세션의 계정은 협력사인데 쿠키의 임자는 관리자라, 누구의 비밀번호를 바꾸는지가 갈린다.
 *
 * 지금 비밀번호를 맞춰 보기 전에 로그인과 같은 잠금을 센다(lib/auth/throttle) — 훔친 쿠키로 지금 비밀번호를 두드려 맞히지 못하게.
 * 규칙에 막히면(4자 미만 · 지금과 같음 …) 잠금을 세지 않고 400 — 맞춰 본 시도가 아니라서.
 * 되면 이 기기에 새 로그인 쿠키를 준다 — 바꾼 시각보다 먼저 발급한 쿠키는 이 기기 것까지 받지 않기 때문이다(다른 기기는 다시 로그인).
 */
import { NextResponse } from 'next/server';
import { createSessionToken, getSessionUser } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import { checkLoginThrottle } from '@/lib/auth/throttle';
import { ownPasswordBlocker } from '@/lib/auth/own-password';
import { SESSION_COOKIE, SESSION_TTL_SEC } from '@/lib/auth/types';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return fail('로그인이 필요합니다.', 401);
  if (session.via) return fail('대행 중에는 비밀번호를 바꿀 수 없습니다 — 대행을 끝내고 바꾸세요.', 403);

  let body: { current?: unknown; next?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('요청을 읽을 수 없습니다.', 400);
  }
  const current = typeof body?.current === 'string' ? body.current : '';
  const next = typeof body?.next === 'string' ? body.next : '';
  const block = ownPasswordBlocker({ current, next, loginId: session.id });
  if (block) return fail(block, 400);

  const throttle = await checkLoginThrottle(request, session.id);
  if (throttle.lockedForSec !== null) {
    const min = Math.ceil(throttle.lockedForSec / 60);
    return fail(`여러 번 틀려 잠시 막았습니다 — ${min}분 뒤에 다시 하세요.`, 429);
  }

  try {
    const result = await userStore.changeOwnPassword(session.id, current, next);
    if (result === 'file') return fail('배포 설정 계정이라 여기서 못 바꿉니다.', 422);
    if (result === 'wrong') {
      await throttle.onFail();
      return fail('현재 비밀번호가 맞지 않습니다.', 403);
    }
    await throttle.onSuccess();

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken({ id: session.id, name: session.name, role: session.role, org: session.org }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_TTL_SEC,
      }
    );
    return response;
  } catch (err) {
    console.error('[api] 비밀번호 변경 실패:', err);
    return fail('비밀번호를 바꾸지 못했습니다.', 500);
  }
}

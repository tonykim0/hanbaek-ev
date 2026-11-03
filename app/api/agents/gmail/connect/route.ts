/**
 * GET /api/agents/gmail/connect?back=/admin/agents/… — 「Gmail 연결」 [한백 관리자]. 구글 동의 화면으로 보낸다.
 *
 * 확인값(state)을 쿠키에 두고 구글이 돌려줄 때(callback) 견준다 — 남이 만든 연결 주소로 우리 콘솔에 엉뚱한 Gmail 이 붙는 길을
 * 막는다. 돌아갈 화면도 같은 쿠키에 싣는다(에이전트 화면 안의 주소만 — lib/agents/gmail mailBackOf).
 * 연결은 운영 주소와 로컬에서만 시작한다(callbackOrigins) — Google Cloud 의 「승인된 리디렉션 URI」에 넣은 주소여야 구글이 돌려보낸다.
 */
import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import {
  callbackOrigins, GMAIL_CALLBACK_PATH, GMAIL_STATE_COOKIE, gmailAuthUrl, mailBackOf, oauthClient, withMailNote,
} from '@/lib/agents/gmail';
import { CONSOLE_URL } from '@/lib/portal-intake';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = mailBackOf(url.searchParams.get('back'));
  const session = await requireAdmin();
  if (!session) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, url.origin));

  const client = oauthClient();
  if (!client) {
    return NextResponse.redirect(new URL(
      withMailNote(back, 'mail_error', 'Gmail 연결 설정(구글 클라이언트 ID · 보안 비밀번호)이 콘솔에 아직 없습니다.'), url.origin,
    ));
  }
  if (!callbackOrigins().includes(url.origin)) {
    return NextResponse.redirect(new URL(
      withMailNote(back, 'mail_error', `Gmail 연결은 운영 주소(${CONSOLE_URL.replace(/^https?:\/\//, '')})에서 해 주세요.`), url.origin,
    ));
  }

  const state = randomBytes(18).toString('base64url');
  const res = NextResponse.redirect(gmailAuthUrl({ clientId: client.id, redirectUri: `${url.origin}${GMAIL_CALLBACK_PATH}`, state }));
  res.cookies.set(GMAIL_STATE_COOKIE, `${state}|${back}`, {
    httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', path: '/api/agents/gmail', maxAge: 600,
  });
  return res;
}

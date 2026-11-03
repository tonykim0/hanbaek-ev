/**
 * GET /api/agents/gmail/callback — 구글이 동의 뒤 돌려보내는 자리 [한백 관리자]. 갱신 토큰을 받아 잠가 두고 화면으로 돌아간다.
 *
 * 확인값이 쿠키의 것과 같아야 받는다(connect). 구글은 범위마다 체크를 풀 수 있어서, 메일 보내기(gmail.send)를 빼고 허용했으면
 * 받은 토큰을 구글에 거두고 「체크해 주세요」로 돌아간다. 결과는 돌아간 화면의 주소에 붙는다(mail=connected · mail_error=…) —
 * 화면이 연결 줄 옆에 그대로 띄운다(화면 규칙 9).
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import {
  exchangeCode, GMAIL_CALLBACK_PATH, GMAIL_SEND_SCOPE, GMAIL_STATE_COOKIE, mailBackOf, revokeToken, withMailNote,
} from '@/lib/agents/gmail';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = cookies().get(GMAIL_STATE_COOKIE)?.value ?? '';
  const cut = raw.indexOf('|');
  const state = cut > 0 ? raw.slice(0, cut) : '';
  const back = mailBackOf(cut > 0 ? raw.slice(cut + 1) : null);

  const go = (key: 'mail' | 'mail_error', value: string) => {
    const res = NextResponse.redirect(new URL(withMailNote(back, key, value), url.origin));
    res.cookies.set(GMAIL_STATE_COOKIE, '', { path: '/api/agents/gmail', maxAge: 0 });
    return res;
  };

  const session = await requireAdmin();
  if (!session) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, url.origin));
  if (url.searchParams.get('error')) return go('mail_error', '구글에서 허용하지 않았습니다 — 연결하려면 「Gmail 연결」을 다시 눌러 주세요.');
  if (!state || url.searchParams.get('state') !== state) {
    return go('mail_error', '연결 확인값이 맞지 않습니다(시간이 지났거나 다른 창에서 시작했습니다) — 「Gmail 연결」을 다시 눌러 주세요.');
  }
  const code = url.searchParams.get('code');
  if (!code) return go('mail_error', '구글이 연결 코드를 주지 않았습니다 — 「Gmail 연결」을 다시 눌러 주세요.');

  try {
    const got = await exchangeCode({ code, redirectUri: `${url.origin}${GMAIL_CALLBACK_PATH}` });
    if (!got.scopes.includes(GMAIL_SEND_SCOPE)) {
      await revokeToken(got.refreshToken);
      return go('mail_error', '메일 보내기 권한에 체크하지 않으셨습니다 — 다시 연결하면서 「메일 보내기」에 체크해 주세요.');
    }
    await getRepository().saveMailAccount({ email: got.email, refreshToken: got.refreshToken, scopes: got.scopes }, actorOf(session));
    return go('mail', 'connected');
  } catch (e) {
    const human = e instanceof Error && /[가-힣]/.test(e.message);
    if (!human) console.error('[mail] 연결 실패', e);
    return go('mail_error', human ? (e as Error).message : 'Gmail 을 연결하지 못했습니다 — 다시 눌러 주세요.');
  }
}

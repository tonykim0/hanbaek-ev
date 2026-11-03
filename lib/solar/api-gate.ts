import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';
import { isHanbaek } from '@/lib/roles';

/**
 * 태양광 설치 검토 API 의 문 — 화면(/solar 아래)과 같이 한백의 눈(관리자 · 열람 전용)만 들인다.
 * 미들웨어는 api 를 안 보므로(라우트가 스스로 본다) 여기서 막는다. 바깥 자료(VWorld · 한전 · 카카오)의 하루 한도와
 * 판독 비용이 걸려 있어 로그인 없이 열지 않는다. DB 에는 아무것도 쓰지 않는다 — 열람 전용도 쓴다(조회 도구다).
 */
export async function solarGate(): Promise<{ session: SessionPayload; denied: null } | { session: null; denied: NextResponse }> {
  const session = await getSessionUser();
  if (!session) return { session: null, denied: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  if (!isHanbaek(session.role)) return { session: null, denied: NextResponse.json({ error: '한백만 쓰는 화면입니다.' }, { status: 403 }) };
  return { session, denied: null };
}

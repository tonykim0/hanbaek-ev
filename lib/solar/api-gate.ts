import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';
import { seesSolar } from '@/lib/biz';

/**
 * 태양광 API 의 문 — 화면(/solar 아래)과 같이 태양광을 보는 계정만 들인다: 한백의 눈(관리자 · 열람 전용)과 태양광 참여를
 * 켠 협력사(lib/biz seesSolar · 2026-11-03 에코일렉). 미들웨어는 api 를 안 보므로(라우트가 스스로 본다) 여기서 막는다.
 * 바깥 자료(VWorld · 한전 · 카카오)의 하루 한도와 판독 비용이 걸려 있어 로그인 없이 열지 않는다.
 * 부지 검토는 DB 에 아무것도 쓰지 않는다 — 열람 전용도 쓴다(조회 도구다). 현장 쓰기는 쓰기 껍데기가 한 번 더 본다.
 */
export async function solarGate(): Promise<{ session: SessionPayload; denied: null } | { session: null; denied: NextResponse }> {
  const session = await getSessionUser();
  if (!session) return { session: null, denied: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  if (!seesSolar(session)) return { session: null, denied: NextResponse.json({ error: '태양광에 참여하는 계정만 씁니다.' }, { status: 403 }) };
  return { session, denied: null };
}

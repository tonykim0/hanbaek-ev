/**
 * GET /api/notices/unread?biz=ev|solar — 내가 아직 안 읽은 그 사업의 공지 수 (로그인한 누구나)
 *
 * 상단바 배지가 화면을 옮길 때마다 부른다 — 사이드바의 할 일 배지(/api/todos)와 같은 방식.
 * 사업마다 센다(migrations/0116 — 안 주면 전기차). 태양광을 안 보는 계정에게 태양광 공지는 없다 — 0 이다.
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser } from '@/lib/auth/session';
import { asBiz, seesSolar } from '@/lib/biz';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const biz = asBiz(new URL(request.url).searchParams.get('biz'));
  if (biz === 'solar' && !seesSolar(session)) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: await getRepository().countUnreadNotices(session.id, biz) });
}

/**
 * GET /api/notifications/unread — 안 읽은 알림 수 [로그인한 누구나]
 *
 * 사이드바의 「알림」 배지가 화면을 옮길 때·1분마다·현장에서 새 글을 읽었을 때 부른다(공지 배지와 같은 방식).
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const count = await getRepository().countUnreadNotifications({ id: session.id, role: session.role, org: session.org });
  return NextResponse.json({ count });
}

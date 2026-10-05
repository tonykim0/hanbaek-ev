/**
 * GET /api/notifications — 내 알림 목록(진행현황 글이 나에게 온 것) [로그인한 누구나]
 *
 * 누구에게 가는지는 lib/notify.ts, 세는 법은 store/notifications.ts. 대행 중이면 그 계정의 것을 본다(눈이 그 계정이다).
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const items = await getRepository().listNotifications({ id: session.id, role: session.role, org: session.org });
  return NextResponse.json({ items });
}

/**
 * POST /api/notifications/read — 알림을 읽었다고 찍는다 { id? } | { projectId, scope? } | { noticeId } | {} (전부) [로그인한 누구나]
 *
 * sessionWrite 를 쓰지 않는다 — 그 껍데기는 열람 전용을 막는데(사업 데이터의 쓰기 규칙), 이것은 제 읽음 표시다
 * (공지 읽음과 같다). 남의 것은 못 건드린다 — 세션의 id 로만 찍는다.
 * ★대행 중에는 찍지 않는다★ — 관리자가 협력사 눈으로 들여다본 것은 협력사가 읽은 것이 아니다(공지 L20 과 같은 까닭).
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { getSessionUser } from '@/lib/auth/session';
import { isNoteScope } from '@/types/project';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (session.via) return NextResponse.json({ ok: true, marked: 0 });
  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown; projectId?: unknown; noticeId?: unknown; scope?: unknown;
  };
  const where = {
    id: typeof body.id === 'string' ? body.id : undefined,
    projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
    // 공지 하나 — 그 공지를 펼치면 그 공지의 메시지 알림이 읽힌다
    noticeId: typeof body.noticeId === 'string' ? body.noticeId : undefined,
    scope: isNoteScope(body.scope) ? body.scope : undefined,
  };
  const marked = await getRepository().markNotificationsRead(session.id, where);
  return NextResponse.json({ ok: true, marked });
}

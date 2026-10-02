/**
 * GET  /api/survey-drafts?cpo=pluglink — 내 임시 저장본 목록 [본인]
 * POST /api/survey-drafts               — 빈 저장본 만들기 { cpo, title } → { id } [본인]
 *
 * 실사보고서 임시 저장(한백 지시 2026-10-01 — 클라우드). 사진은 저장본이 생긴 뒤 그 폴더로 올린다
 * ([id]/photo). 누가 무엇을 보나는 저장소가 본다(store/survey-drafts — 저장한 계정만).
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { BadRequest, SERVER_ERROR_MESSAGE, isUnexpectedError, sessionWrite } from '@/lib/api/write-route';
import { canWrite } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const cpo = new URL(request.url).searchParams.get('cpo') ?? '';
  try {
    // canSave — 열람 전용은 저장하지 못한다. 화면이 단추 이름에 그 이유를 적는다(화면 규칙 3)
    const drafts = await getRepository().listSurveyDrafts(cpo, actorOf(session));
    return NextResponse.json({ drafts, canSave: canWrite(session.role) });
  } catch (e) {
    if (isUnexpectedError(e)) {
      console.error('[api] GET /api/survey-drafts', e);
      return NextResponse.json({ error: SERVER_ERROR_MESSAGE }, { status: 500 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export const POST = sessionWrite<Record<string, never>, { cpo?: unknown; title?: unknown }>(async ({ body, actor }) => {
  if (typeof body?.cpo !== 'string') throw new BadRequest('서식을 알 수 없습니다.');
  const id = await getRepository().createSurveyDraft(
    { cpo: body.cpo, title: typeof body.title === 'string' ? body.title : '' }, actor
  );
  return { id };
});

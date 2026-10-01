/**
 * GET    /api/survey-drafts/[id] — 저장본 하나(값까지) [본인]
 * PUT    /api/survey-drafts/[id] — 값 저장 { title, data } [본인]
 * DELETE /api/survey-drafts/[id] — 저장본 지우기(사진 폴더째) [본인]
 *
 * 사진 자리는 여기서 확인한다(lib/survey/draft-blobs vetPhotos) — 이 계정·이 저장본의 폴더에 실제로
 * 있는 것만 받는다. 저장하면서 빠진 사진은 저장 뒤에 지운다.
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';
import { dropDraftFolder, dropPhotos, vetPhotos } from '@/lib/survey/draft-blobs';
import { MAX_DRAFT_JSON } from '@/lib/survey/draft-shape';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    return NextResponse.json({ draft: await getRepository().getSurveyDraft(params.id, actorOf(session)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '불러오지 못했습니다.' }, { status: 404 });
  }
}

export const PUT = sessionWrite<{ id: string }, { title?: unknown; data?: unknown }>(async ({ params, body, actor }) => {
  if (!body || typeof body.data !== 'object' || body.data === null) throw new BadRequest('저장할 값이 없습니다.');
  if (JSON.stringify(body.data).length > MAX_DRAFT_JSON) throw new BadRequest('저장할 값이 너무 큽니다.');
  const repo = getRepository();
  const before = await repo.getSurveyDraft(params.id, actor);
  const data = await vetPhotos(body.data, before.data, actor.id, params.id);
  const { removed } = await repo.saveSurveyDraft(params.id, {
    title: typeof body.title === 'string' ? body.title : '', data,
  }, actor);
  await dropPhotos(removed);
  return { savedAt: new Date().toISOString() };
});

export const DELETE = sessionWrite<{ id: string }, undefined>(async ({ params, actor }) => {
  await getRepository().deleteSurveyDraft(params.id, actor);
  await dropDraftFolder(actor.id, params.id);
});

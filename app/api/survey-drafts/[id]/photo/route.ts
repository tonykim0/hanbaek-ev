/**
 * POST /api/survey-drafts/[id]/photo — 저장본 사진 한 장의 업로드 토큰 [본인]
 *
 * 경로는 서버가 짓는다(survey-drafts/<계정>/<저장본>/<무작위>.jpg) — 클라이언트가 지으면 남의 자리를
 * 가리킬 수 있다(app/api/upload 머리말과 같은 이유). 저장본이 그 계정의 것인지 먼저 본다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { getRepository } from '@/lib/data';
import { sessionWrite } from '@/lib/api/write-route';
import { draftPrefix } from '@/lib/survey/draft-shape';

/** 사진 한 장 상한 — 화면이 긴 변 2400px 로 줄여 올리므로 넉넉하다(못 줄인 원본도 받는다) */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export const POST = sessionWrite<{ id: string }, undefined>(async ({ params, actor }) => {
  await getRepository().getSurveyDraft(params.id, actor);
  const pathname = `${draftPrefix(actor.id, params.id)}${crypto.randomUUID()}.jpg`;
  const token = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN!,
    pathname,
    validUntil: Date.now() + 10 * 60 * 1000,
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/octet-stream'],
    maximumSizeInBytes: MAX_PHOTO_BYTES,
  });
  return { token, pathname };
});

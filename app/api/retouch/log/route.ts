/**
 * POST /api/retouch/log — 서류 문구 수정으로 PDF 를 받았다는 기록 { file, prompt, edits: [{ page, from, to }] }
 * [한백 관리자]
 *
 * 파일은 남기지 않는다(원본도 결과도 화면에서만 돈다). 누가 어느 파일의 무엇을 무엇으로 바꿨는지만 audit_log 에 남긴다 —
 * 직인사용동의로 고친 서류를 나중에 물으면 보여 줄 근거다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import type { RetouchLog } from '@/lib/retouch/types';

export const POST = adminWrite<
  Record<string, never>,
  { file?: unknown; prompt?: unknown; edits?: unknown }
>('서류 문구 수정은 한백 관리자만 쓸 수 있습니다.', async ({ body, actor }) => {
  if (typeof body?.file !== 'string' || !body.file.trim()) throw new BadRequest('파일 이름이 없습니다.');
  if (!Array.isArray(body.edits) || body.edits.length === 0) throw new BadRequest('고친 것이 없습니다.');
  const edits: RetouchLog['edits'] = [];
  for (const e of body.edits as Array<Record<string, unknown>>) {
    if (!Number.isInteger(e.page) || typeof e.from !== 'string' || typeof e.to !== 'string') {
      throw new BadRequest('고친 것의 모양이 잘못됐습니다.');
    }
    edits.push({ page: e.page as number, from: e.from, to: e.to });
  }
  await getRepository().logRetouch({
    file: body.file.trim(),
    prompt: typeof body.prompt === 'string' ? body.prompt : '',
    edits,
  }, actor);
  return { ok: true };
});

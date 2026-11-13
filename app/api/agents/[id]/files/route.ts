/**
 * POST /api/agents/[id]/files — 담당에게 넘길 파일 한 개의 업로드 토큰 { name, size } [한백 관리자]
 *
 * 파일은 브라우저가 Blob 에 바로 올린다 — 서버는 자리를 지어 주고 토큰만 준다(survey-drafts 사진과 같은 길). 자리는 서버가
 * 짓는다(agent-files/<담당>/<무작위>/<파일 이름>) — 클라이언트가 지으면 남의 자리를 가리킬 수 있다. 올린 파일은 말을 남길 때
 * 붙는다(/messages 의 files) — 그때 라우트가 그 자리가 이 담당의 것이고 우리 Blob 에 실제로 있는지 다시 본다.
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { AGENT_FILE_MAX_BYTES, agentFileName, agentFilePrefix, sizeLabel } from '@/lib/agents/files';
import { clientUploadToken } from '@/lib/blob/server';

/** 담당 id 는 마이그레이션이 심은 짧은 영문 — 경로에 들어가므로 그 모양만 받는다 */
const AGENT_ID = /^[a-z0-9-]{1,40}$/;

export const POST = adminWrite<{ id: string }, { name?: unknown; size?: unknown }>(
  '담당에게 파일을 넘기는 것은 한백 관리자만 할 수 있습니다.',
  async ({ params, body }) => {
    if (!AGENT_ID.test(params.id)) throw new BadRequest('담당을 찾을 수 없습니다.');
    if (typeof body?.name !== 'string' || !body.name.trim()) throw new BadRequest('파일 이름이 없습니다.');
    const size = typeof body.size === 'number' ? body.size : NaN;
    if (!Number.isFinite(size) || size <= 0) throw new BadRequest('빈 파일입니다.');
    if (size > AGENT_FILE_MAX_BYTES) throw new Error(`파일은 ${sizeLabel(AGENT_FILE_MAX_BYTES)}까지 넘길 수 있습니다.`);
    const pathname = `${agentFilePrefix(params.id)}${crypto.randomUUID()}/${agentFileName(body.name)}`;
    const token = await clientUploadToken({
      pathname,
      validUntil: Date.now() + 10 * 60 * 1000,
      maximumSizeInBytes: AGENT_FILE_MAX_BYTES,
    });
    return { token, pathname };
  }
);

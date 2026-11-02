/**
 * POST /api/agents/[id]/messages — 에이전트에게 말을 남긴다 { body, note?, files? } [한백 관리자]
 *
 * note 가 true 면 기록만 남긴다(운영사 담당자와 통화한 내용 같은 것 — 에이전트를 부르지 않는다). 아니면 지시다 —
 * 화면이 이어서 /reply 를 불러 에이전트가 답한다. 둘을 가른 것은 답이 실패해도 지시는 남아야 해서다(「다시 묻기」).
 *
 * files 는 /files 토큰으로 브라우저가 올린 것 [{ pathname, name }]. ★클라이언트가 준 자리를 믿지 않는다★ — 이 담당의
 * 자리(agent-files/<담당>/)이고 우리 Blob 에 실제로 있어야 받고, 주소 · 크기 · 형식은 Blob 이 답한 것으로 적는다.
 * 파일만 넘기면 글은 비어도 된다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { ourBlob } from '@/lib/intake-stage';
import { AGENT_FILES_PER_MESSAGE, agentFilePrefix } from '@/lib/agents/files';

type FileIn = { pathname?: unknown; name?: unknown };

export const POST = adminWrite<{ id: string }, { body?: unknown; note?: unknown; files?: unknown }>(
  '에이전트와의 대화는 한백 관리자만 남길 수 있습니다.',
  async ({ params, body, actor }) => {
    if (body?.body !== undefined && typeof body.body !== 'string') throw new BadRequest('내용을 글로 적어주세요.');
    const text = typeof body?.body === 'string' ? body.body : '';
    const raw = body?.files ?? [];
    if (!Array.isArray(raw)) throw new BadRequest('파일 목록이 올바르지 않습니다.');
    if (raw.length > AGENT_FILES_PER_MESSAGE) throw new BadRequest(`파일은 한 번에 ${AGENT_FILES_PER_MESSAGE}개까지입니다.`);
    if (!text.trim() && raw.length === 0) throw new BadRequest('내용을 적어주세요.');

    const prefix = agentFilePrefix(params.id);
    const files = [];
    for (const f of raw as FileIn[]) {
      if (typeof f?.pathname !== 'string' || typeof f?.name !== 'string') throw new BadRequest('파일 목록이 올바르지 않습니다.');
      if (!f.pathname.startsWith(prefix) || f.pathname.includes('..')) throw new BadRequest('이 담당에게 올린 파일이 아닙니다.');
      let found: Awaited<ReturnType<typeof ourBlob>>;
      try {
        found = await ourBlob(f.pathname);
      } catch {
        throw new BadRequest(`올린 파일을 찾을 수 없습니다 — 「${f.name}」을 다시 올려 주세요.`);
      }
      files.push({ name: f.name, pathname: f.pathname, url: found.url, size: found.size, contentType: found.contentType ?? null });
    }

    const message = await getRepository().addAgentMessage(
      { agentId: params.id, role: body?.note === true ? 'note' : 'user', body: text, files },
      actor
    );
    return { message };
  }
);

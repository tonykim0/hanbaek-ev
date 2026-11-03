/**
 * PATCH /api/agents/[id]/mails/[mailId] — 메일 초안 고치기 · 버리기 · 되살리기 [한백 관리자]
 *   { action: 'edit', to, cc, subject, body }   승인 대기 · 보내지 못함만
 *   { action: 'discard' } · { action: 'restore' }
 * 보내기는 따로다(./send) — 되돌릴 수 없는 일이라 다른 문으로 둔다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite, BadRequest } from '@/lib/api/write-route';

type Body = { action?: unknown; to?: unknown; cc?: unknown; subject?: unknown; body?: unknown };

export const PATCH = adminWrite<{ id: string; mailId: string }, Body>(
  '메일은 한백 관리자만 고칠 수 있습니다.',
  async ({ params, body, actor }) => {
    const repo = getRepository();
    const ref = { agentId: params.id, id: params.mailId };
    switch (body?.action) {
      case 'edit': {
        if (typeof body.subject !== 'string' || typeof body.body !== 'string') throw new BadRequest('제목 · 본문이 글이 아닙니다.');
        return { mail: await repo.editAgentMail({ ...ref, to: body.to, cc: body.cc, subject: body.subject, body: body.body }, actor) };
      }
      case 'discard':
        return { mail: await repo.setAgentMailDiscarded({ ...ref, discarded: true }, actor) };
      case 'restore':
        return { mail: await repo.setAgentMailDiscarded({ ...ref, discarded: false }, actor) };
      default:
        throw new BadRequest('무엇을 할지(action)가 없습니다.');
    }
  }
);

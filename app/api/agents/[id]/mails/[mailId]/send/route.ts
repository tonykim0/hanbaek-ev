/**
 * POST /api/agents/[id]/mails/[mailId]/send — 「승인하고 보내기」 [한백 관리자]. 담당이 올린 초안을 한백의 다음 메일로 보낸다.
 *
 * ★메일이 나가는 문은 이것과 예약 보내기의 크론(/api/cron/mails — 한백이 예약한 것만) 둘이다★ — 에이전트는 초안까지만 올린다
 * (lib/agents/brain draft_mail). 한백 2026-11-03 「난 그거에 대해 승인을 하고 너가 메일을 보내는건데」. 보내는 일은
 * lib/agents/mail-send 한 곳이다 — 보내지 못하면 그 까닭을 「보내지 못함」으로 남기고 단추 옆에 띄운다(422).
 */
import { adminWrite } from '@/lib/api/write-route';
import { sendAgentMail } from '@/lib/agents/mail-send';

export const maxDuration = 60;

export const POST = adminWrite<{ id: string; mailId: string }, undefined>(
  '메일은 한백 관리자만 보낼 수 있습니다.',
  async ({ params, actor }) => ({ mail: await sendAgentMail({ agentId: params.id, id: params.mailId }, actor) }),
);

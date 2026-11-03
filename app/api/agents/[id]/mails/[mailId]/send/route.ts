/**
 * POST /api/agents/[id]/mails/[mailId]/send — 「승인하고 보내기」 [한백 관리자]. 담당이 올린 초안을 한백의 다음 메일로 보낸다.
 *
 * ★이것이 메일이 나가는 유일한 문이다★ — 에이전트는 초안까지만 올린다(lib/agents/brain draft_mail). 한백 2026-11-03 「난 그거에
 * 대해 승인을 하고 너가 메일을 보내는건데」.
 *
 * 순서: 연결한 계정을 푼다 → 그 줄을 「보내는 중」으로 잡는다(store/agent-mail — 두 번 눌러도 한 번만 잡힌다) → 붙일 파일을 읽어
 * 메일을 짓는다(lib/agents/mime) → 다음 메일 서버로 보낸다(lib/agents/smtp) → 보냄으로 닫는다. 보내지 못하면 그 까닭을 남겨
 * 「보내지 못함」으로 닫고, 같은 까닭을 단추 옆에 띄운다(422) — 고쳐서 다시 보낼 수 있다.
 * 보내는 이름은 「한백」이다 — 받는 쪽은 한백과 일하는 것이지 담당 이름을 볼 까닭이 없다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { buildMime, type MailAttachment } from '@/lib/agents/mime';
import { sendSmtp } from '@/lib/agents/smtp';
import type { AgentMail } from '@/types/agents';

export const maxDuration = 60;

const FROM_NAME = '한백';

async function attachmentsOf(mail: AgentMail): Promise<MailAttachment[]> {
  const out: MailAttachment[] = [];
  for (const f of mail.files) {
    const res = await fetch(f.url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!res?.ok) throw new Error(`붙일 파일 「${f.name}」을 읽지 못했습니다 — 잠시 뒤 다시 보내 주세요.`);
    out.push({ name: f.name, contentType: f.contentType, data: new Uint8Array(await res.arrayBuffer()) });
  }
  return out;
}

export const POST = adminWrite<{ id: string; mailId: string }, undefined>(
  '메일은 한백 관리자만 보낼 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const ref = { agentId: params.id, id: params.mailId };
    const account = await repo.mailCredential(actor);
    const mail = await repo.claimAgentMail(ref, actor);

    let sent: { id: string };
    try {
      const data = buildMime({
        fromName: FROM_NAME, from: account.email, to: mail.to, cc: mail.cc,
        subject: mail.subject, body: mail.body, attachments: await attachmentsOf(mail),
      });
      sent = await sendSmtp({ user: account.email, pass: account.secret, from: account.email, to: [...mail.to, ...mail.cc], data });
    } catch (e) {
      const why = e instanceof Error && /[가-힣]/.test(e.message) ? e.message : '보내지 못했습니다 — 다시 눌러 주세요.';
      if (!(e instanceof Error && /[가-힣]/.test(e.message))) console.error('[mail] 보내기 실패', e);
      await repo.finishAgentMail({ ...ref, result: { ok: false, error: why } }, actor);
      throw new Error(why);
    }
    /* 여기서부터는 나간 메일이다 — 닫다가 실패하면 「보내는 중」으로 남고(다시 잡기는 10분 뒤), 500 과 [api] 로그가 그 신호다 */
    return { mail: await repo.finishAgentMail({ ...ref, result: { ok: true, from: account.email, ref: sent.id } }, actor) };
  }
);

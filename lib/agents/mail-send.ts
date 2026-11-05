/**
 * 메일 한 통을 보낸다 (서버 전용) — 「승인하고 보내기」(app/api/agents/[id]/mails/[mailId]/send)와 예약 보내기의 크론(/api/cron/mails)이
 * 같이 쓴다. 메일이 나가는 길은 이 하나다.
 *
 * 순서: 연결한 계정을 푼다(없으면 초안 그대로 사람 말로 던진다) → 그 줄을 「보내는 중」으로 잡는다(store/agent-mail — 두 번 불려도
 * 한 번만 잡힌다) → 붙일 파일을 읽어 메일을 짓는다(lib/agents/mime) → 다음 메일 서버로 보낸다(lib/agents/smtp) → 보냄으로 닫는다.
 * 보내지 못하면 그 까닭을 남겨 「보내지 못함」으로 닫고 같은 까닭을 사람 말로 던진다 — 고쳐서 다시 보낼 수 있다.
 * 보내는 이름은 「한백」이다 — 받는 쪽은 한백과 일하는 것이지 담당 이름을 볼 까닭이 없다.
 */
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { buildMime, type MailAttachment } from './mime';
import { sendSmtp } from './smtp';
import type { AgentMail } from '@/types/agents';

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

export async function sendAgentMail(ref: { agentId: string; id: string }, actor: Actor): Promise<AgentMail> {
  const repo = getRepository();
  /* 그 담당의 사업의 계정 — 태양광 담당의 초안은 태양광 계정으로만 나간다 */
  const account = await repo.mailCredential(actor, ref.agentId);
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
  return repo.finishAgentMail({ ...ref, result: { ok: true, from: account.email, ref: sent.id } }, actor);
}

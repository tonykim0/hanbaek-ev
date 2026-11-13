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
import { blobPathOf } from '@/lib/blob/path';
import { fileLink, readBlob } from '@/lib/blob/server';

const FROM_NAME = '한백';

async function attachmentsOf(mail: AgentMail): Promise<MailAttachment[]> {
  const out: MailAttachment[] = [];
  for (const f of mail.files) {
    // 비공개 저장소 — SDK 로 읽는다(lib/blob/server)
    const data = await readBlob(f.url).catch(() => null);
    if (!data) throw new Error(`붙일 파일 「${f.name}」을 읽지 못했습니다 — 잠시 뒤 다시 보내 주세요.`);
    out.push({ name: f.name, contentType: f.contentType, data: new Uint8Array(data) });
  }
  return out;
}

/**
 * 본문의 우리 파일 주소를 받는 사람이 열 수 있는 고정 링크로 — 받는 사람은 콘솔 계정이 없고 파일은 비공개 저장소라 맨
 * 주소는 403 이다. 큰 묶음 링크(lib/agents/bundle bundleLinkLines)는 초안을 쓸 때 이미 고정 링크지만, 비공개로 넘어가기
 * 전에 쓴 초안에는 옛 공개 저장소의 주소가 남아 있다(2026-11-14).
 */
async function linkedBody(body: string): Promise<string> {
  const urls = [...new Set(body.match(/https:\/\/[a-z0-9]+\.(?:public|private)\.blob\.vercel-storage\.com\/[^\s)>\]]+/gi) ?? [])];
  let out = body;
  for (const u of urls) {
    if (!blobPathOf(u)) continue;
    out = out.split(u).join(await fileLink(u));
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
      subject: mail.subject, body: await linkedBody(mail.body), attachments: await attachmentsOf(mail),
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

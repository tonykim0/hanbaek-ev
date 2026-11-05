/**
 * GET /api/cron/mails — 예약한 메일 보내기, 매일 아침 한 번 [Vercel 크론 — vercel.json crons · 00:00 UTC = 한국 오전 9시대]
 *
 * 한백이 메일 카드에서 날을 골라 예약한 메일(status 'scheduled' · migrations/0123) 중 그날 오전 9시가 지난 것을 하나씩 보낸다
 * (lib/agents/mail-send — 「승인하고 보내기」와 같은 길). 한백 2026-11-05 「내일 오전 9시에 보내달라」 → 「A로 충분해」. Vercel Hobby 의
 * 크론은 하루 한 번 · 정시에서 59분까지 늦게 돌아서 「9시대」다(lib/agents/mail-schedule).
 *
 * 보낸 사람(감사기록 · 카드의 「승인」)은 예약한 한백이다 — 「○○ (예약)」. 보내지 못한 것은 카드에 「보내지 못함」으로 남고
 * [mail] 로그가 감시를 울린다 — 한백이 고쳐서 다시 보낸다. 같은 메일이 두 번 불려도 한 번만 나간다(저장소의 줄 잠금 · 「보내는 중」).
 *
 * ★CRON_SECRET 으로만 연다★ — /api/cron/agents 와 같다(값이 없으면 [cron] 500 · 미들웨어는 api 를 안 본다 · 넘기기도 비킨다).
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { sendAgentMail } from '@/lib/agents/mail-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** 크론의 손 — 한백의 쓰기를 대신한다(예약한 사람의 이름을 단다) */
const cronActor = (by: string | null): Actor => ({ id: 'system', name: by ? `${by} (예약)` : '예약 보내기', role: 'admin', org: null });

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET 없음 — 예약한 메일이 나가지 않는다');
    return NextResponse.json({ error: '설정이 없습니다.' }, { status: 500 });
  }
  if (!same(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    const due = await getRepository().dueAgentMails(cronActor(null), new Date());
    let sent = 0;
    const failed: string[] = [];
    const repo = getRepository();
    for (const m of due) {
      const ref = { agentId: m.agentId, id: m.id };
      const actor = cronActor(m.scheduledBy);
      /*
       * 메일 연결이 끊겼으면 예약인 채 두지 않고 「보내지 못함」으로 — 카드에 까닭이 서야 한백이 안다(누른 「승인하고 보내기」는 초안
       * 그대로 두고 단추 옆에 띄우지만, 예약은 아무도 보고 있지 않다)
       */
      try {
        await repo.mailCredential(actor, m.agentId);
      } catch (e) {
        const why = e instanceof Error ? e.message : '메일 연결을 풀지 못했습니다.';
        await repo.claimAgentMail(ref, actor);
        await repo.finishAgentMail({ ...ref, result: { ok: false, error: why } }, actor);
        failed.push(m.id);
        console.error('[mail] 예약 보내기 실패 — 메일 연결', m.agentId, m.id, why);
        continue;
      }
      try {
        await sendAgentMail(ref, actor);
        sent += 1;
      } catch (e) {
        failed.push(m.id);
        console.error('[mail] 예약 보내기 실패', m.agentId, m.id, e instanceof Error ? e.message : e);
      }
    }
    return NextResponse.json({ ok: true, due: due.length, sent, failed });
  } catch (err) {
    console.error('[cron] mails', err);
    return NextResponse.json({ error: '예약한 메일을 보내지 못했습니다.' }, { status: 500 });
  }
}

/**
 * 에이전트의 정기 일 (서버 전용) — 매일 아침 크론(app/api/cron/agents · vercel.json)이 부른다. 지금은 하나:
 *   정산 담당의 열린구매 상신 알림(lib/agents/open-purchase — 정기결제 10일 · 25일의 3영업일 전, 한백 지시 2026-11-04)과
 *   그 결제일의 아지트 열린구매 글 초안(lib/agit — 한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면
 *   정산담당에이전트가 아지트에 글을 올리는 구조」). 초안은 알림의 말 밑에 카드로 서고, 한백이 승인해야 올라간다.
 * 같은 결제일은 한 번만 남는다(store/agents agentRemind 가 열쇠로 가른다) — 하루에 몇 번 불려도 된다. 초안도 알림이 새로 섰을 때만 짓는다.
 * 그날 나갈 배치는 지급관리 · 거래명세서와 같은 정본에서 그때 읽는다(lib/agents/scope · lib/agit/load — 저장하지 않는다).
 */
import { getRepository } from '@/lib/data';
import { today } from '@/lib/date';
import { AUTO } from '@/lib/check-kit';
import { loadAgitDraft } from '@/lib/agit/load';
import type { Actor } from '@/lib/data/repository';
import { loadScope } from './scope';
import { OPEN_PURCHASE_AGENT, openPurchaseDue, openPurchasePlan, unknownYears } from './open-purchase';

/** 저절로 한 일의 이름 — 감사기록에 그 담당이 선다(사람이 아니다 · lib/site-mail-run 과 같다) */
const REMIND_ACTOR: Actor = { id: AUTO.id, name: '정산 담당', role: 'admin', org: null };

export async function runAgentReminders(now: Date = new Date()): Promise<{
  day: string; due: string[]; reminded: string[]; drafted: string[];
}> {
  const day = today(now);
  const dues = openPurchaseDue(day);
  if (dues.length === 0) return { day, due: [], reminded: [], drafted: [] };
  const { batches } = await loadScope(REMIND_ACTOR);
  const reminded: string[] = [];
  const drafted: string[] = [];
  for (const due of dues) {
    const years = unknownYears(due);
    if (years.length) console.error('[agents] 공휴일 표 없음', years.join(','), '— lib/business-days 에 그 해를 더한다');
    const draft = await loadAgitDraft(REMIND_ACTOR, due.payDate);
    const plan = openPurchasePlan(due, day, batches.filter((b) => b.paidAt === due.payDate), draft.blocked);
    const r = await getRepository().agentRemind({
      agentId: OPEN_PURCHASE_AGENT, key: plan.key, task: plan.task, say: plan.say, alarm: plan.alarm,
      link: { href: '/statements', label: '거래명세서 보기 →' },
    }, REMIND_ACTOR);
    if (!r.created) continue;
    reminded.push(due.payDate);
    if (draft.blocked || !r.messageId) continue;
    /* 알림의 말 밑에 초안 — 이미 올린 결제일(손으로 먼저 올린 것)이면 건너뛴다. 알림은 남았으니 크론을 실패로 만들지 않는다 */
    try {
      await getRepository().draftAgitPost({
        payDate: draft.payDate, body: draft.text, total: draft.total, batches: draft.batches, again: false, messageId: r.messageId,
      }, REMIND_ACTOR);
      drafted.push(due.payDate);
    } catch (e) {
      console.error('[agents] 아지트 글 초안 못 지음', due.payDate, e instanceof Error ? e.message : String(e));
    }
  }
  return { day, due: dues.map((d) => d.payDate), reminded, drafted };
}

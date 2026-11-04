/**
 * 에이전트의 정기 일 (서버 전용) — 매일 아침 크론(app/api/cron/agents · vercel.json)이 부른다. 지금은 하나:
 *   정산 담당의 열린구매 상신 알림(lib/agents/open-purchase — 정기결제 10일 · 25일의 3영업일 전, 한백 지시 2026-11-04).
 * 같은 결제일은 한 번만 남는다(store/agents agentRemind 가 열쇠로 가른다) — 하루에 몇 번 불려도 된다.
 * 그날 나갈 배치는 지급관리 · 거래명세서와 같은 정본에서 그때 읽는다(lib/agents/scope — 저장하지 않는다).
 */
import { getRepository } from '@/lib/data';
import { today } from '@/lib/date';
import { AUTO } from '@/lib/check-kit';
import type { Actor } from '@/lib/data/repository';
import { loadScope } from './scope';
import { OPEN_PURCHASE_AGENT, openPurchaseDue, openPurchasePlan, unknownYears } from './open-purchase';

/** 저절로 한 일의 이름 — 감사기록에 그 담당이 선다(사람이 아니다 · lib/site-mail-run 과 같다) */
const REMIND_ACTOR: Actor = { id: AUTO.id, name: '정산 담당', role: 'admin', org: null };

export async function runAgentReminders(now: Date = new Date()): Promise<{ day: string; due: string[]; reminded: string[] }> {
  const day = today(now);
  const dues = openPurchaseDue(day);
  if (dues.length === 0) return { day, due: [], reminded: [] };
  const { batches } = await loadScope(REMIND_ACTOR);
  const reminded: string[] = [];
  for (const due of dues) {
    const years = unknownYears(due);
    if (years.length) console.error('[agents] 공휴일 표 없음', years.join(','), '— lib/business-days 에 그 해를 더한다');
    const plan = openPurchasePlan(due, day, batches.filter((b) => b.paidAt === due.payDate));
    const r = await getRepository().agentRemind({
      agentId: OPEN_PURCHASE_AGENT, key: plan.key, task: plan.task, say: plan.say, alarm: plan.alarm,
      link: { href: '/statements', label: '거래명세서 보기 →' },
    }, REMIND_ACTOR);
    if (r.created) reminded.push(due.payDate);
  }
  return { day, due: dues.map((d) => d.payDate), reminded };
}

/**
 * 주간 기록 — 한 주(월~일)에 그 담당과 오간 것의 셈. 줄을 누르면 왼쪽 대화 칸이 그 주의 말과 일로 바뀐다(?week=그 주 월요일)
 * (한백 지시 2026-11-02 「각 담당자마다 주단위로 뭐했는지도 과거 이력 조회 필요」).
 *
 * 셈은 저장소가 한다(store/agents getAgent — 말은 대화에서, 할 일 · 업무 정의는 감사기록에서, 파일은 넘긴 파일에서). 0인 셈은
 * 적지 않는다 — 그 주에 있던 것만 보인다. 무엇이든 오간 주만 줄이 선다.
 */
import Link from 'next/link';
import type { AgentWeek } from '@/types/agents';
import { PANEL, TEXT } from '@/components/ui';
import { weekName, weekRange } from '@/lib/agents/weeks';
import { AgentHead } from './kit';

function countsOf(w: AgentWeek): string {
  return [
    w.user && `지시 ${w.user}`,
    w.agent && `답 ${w.agent}`,
    w.note && `기록 ${w.note}`,
    w.tasksAdded && `할 일 적음 ${w.tasksAdded}`,
    w.tasksDone && `끝냄 ${w.tasksDone}`,
    w.dutyChanges && `업무 정의 ${w.dutyChanges}`,
    w.files && `파일 ${w.files}`,
  ].filter(Boolean).join(' · ');
}

export function AgentWeeks({ agentId, weeks, selected, today }: {
  agentId: string;
  weeks: AgentWeek[];
  /** 지금 펼친 주의 월요일 — 없으면 null */
  selected: string | null;
  today: string;
}) {
  return (
    <section className={`${PANEL} flex flex-col gap-2 p-5`}>
      <AgentHead meta={`${weeks.length}주`}>주간 기록</AgentHead>
      {weeks.length === 0 ? (
        <p className={TEXT.meta}>기록 0건</p>
      ) : (
        <ul className="-mx-2 flex max-h-[280px] flex-col overflow-y-auto">
          {weeks.map((w) => {
            const on = w.start === selected;
            const name = weekName(w.start, today);
            return (
              <li key={w.start}>
                <Link
                  href={on ? `/admin/agents/${agentId}` : `/admin/agents/${agentId}?week=${w.start}`}
                  aria-current={on ? 'true' : undefined}
                  className={`flex items-baseline gap-2 rounded-ctl px-2 py-1.5 transition ${on ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="w-[92px] shrink-0">
                    <span className={`block text-small font-bold ${on ? 'text-brand-800' : 'text-slate-800'}`}>{name}</span>
                    {name !== weekRange(w.start, today) && (
                      <span className={`block ${TEXT.meta} tabular-nums`}>{weekRange(w.start, today)}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 break-keep text-tiny font-semibold leading-relaxed text-slate-600 tabular-nums">
                    {countsOf(w)}
                  </span>
                  {w.usd > 0 && <span className={`shrink-0 ${TEXT.meta} tabular-nums`}>${w.usd.toFixed(2)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

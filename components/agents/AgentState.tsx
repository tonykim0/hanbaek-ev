/**
 * 담당의 지금 — 현황(AgentsTeam)의 한 줄과 담당 화면(AgentView)의 머리말이 같이 쓴다.
 *   StateBadge   상태 배지 — 색과 글자가 같이(막힘 · 확인 필요 · 정상 · 업무 정의 전, 판정은 ./status stateOf)
 *   StateLegend  색 풀이 한 줄 — 무엇이 그 색을 켜는지
 *   NowLine      지금 하는 일 한 줄 — 맨 앞의 열린 할 일, 없으면 최근 대화
 * (한백 2026-11-05 「각 담당자별로 현재 하고 있는 업무를 한줄로 표시해줘야할듯 · 초록색, 빨간색, 노란색, 회색으로 되어있는데 이것도
 * 표시해줘야할듯」)
 */
import type { Biz } from '@/lib/biz';
import type { AgentTask } from '@/types/agents';
import { Badge, Tag, TEXT } from '@/components/ui';
import { STATE_LABEL, STATE_TONE, stateLegend, type AgentState } from './status';

export function StateBadge({ state }: { state: AgentState }) {
  return <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>;
}

export function StateLegend({ biz }: { biz: Biz }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {stateLegend(biz).map(({ state, why }) => (
        <li key={state} className="flex items-center gap-1.5">
          <StateBadge state={state} />
          <span className={TEXT.meta}>{why}</span>
        </li>
      ))}
    </ul>
  );
}

/** 대화 한 줄에서 마크다운 기호를 걷는다 — 답의 첫머리가 「## 요약」 · 「**…**」로 시작하는 일이 많다 */
function plain(line: string): string {
  return line.replace(/[#*`>_~|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 지금 하는 일 — ①맨 앞의 열린 할 일(담당 화면의 할 일 목록 맨 위와 같은 것 — 기한 지난 것 · 이른 것이 앞)과 기한 · 나머지 수
 * ②열린 할 일이 없으면 최근 대화의 첫머리와 그 날 ③둘 다 없으면 「열린 할 일 0건」(세었고 없음 — 화면 규칙 10).
 * 승인을 기다리는 메일은 맨 앞의 노란 꼬리표다 — 한백이 눌러야 나가는 일이라 할 일보다 먼저 눈에 걸린다. 한 줄이고 넘치면 자른다.
 */
export function NowLine({ task, open, mails, last, today }: {
  task: AgentTask | null;
  /** 열린 할 일 수 — 맨 앞 것 밖의 수를 「외 N건」으로 */
  open: number;
  /** 승인을 기다리는 메일 */
  mails: number;
  last: { at: string; line: string } | null;
  today: string;
}) {
  const late = task?.due != null && task.due < today;
  return (
    <p className="flex min-w-0 items-center gap-2">
      {mails > 0 && <Tag tone="warn">승인 대기 메일 {mails}</Tag>}
      {task ? (
        <>
          <span className="min-w-0 truncate text-base text-slate-800">
            {task.title}
            {task.projectName && <span className="text-slate-500"> · {task.projectName}</span>}
          </span>
          {task.due && (late
            ? <Tag tone="stop">기한 지남 {task.due.slice(5)}</Tag>
            : <span className={`shrink-0 ${TEXT.meta} tabular-nums`}>기한 {task.due.slice(5)}</span>)}
          {open > 1 && <span className={`shrink-0 ${TEXT.meta} tabular-nums`}>외 {open - 1}건</span>}
        </>
      ) : last ? (
        <>
          <span className={`shrink-0 ${TEXT.meta} tabular-nums`}>최근 대화 {last.at.slice(5, 10)}</span>
          <span className="min-w-0 truncate text-base text-slate-600">{plain(last.line)}</span>
        </>
      ) : (
        <span className={TEXT.meta}>열린 할 일 0건</span>
      )}
    </p>
  );
}

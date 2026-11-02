import type { AgentHeadline } from '@/types/agents';
import { Chip } from './hud';

/** 담당이 지금 맡은 범위의 셈 — 가지 줄과 담당 머리말이 같은 모양으로 쓴다. 손봐야 할 수는 꼬리표로 뜬다 */
export function HeadlineCounts({ headline }: { headline: AgentHeadline }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {headline.counts.map((c) => (c.tone ? (
        <Chip key={c.label} tone={c.tone}>{c.label} {c.value}</Chip>
      ) : (
        <span key={c.label} className="text-tiny font-semibold text-slate-400">
          {c.label} <span className="font-mono text-small font-bold tabular-nums text-white">{c.value}</span>
        </span>
      )))}
    </div>
  );
}

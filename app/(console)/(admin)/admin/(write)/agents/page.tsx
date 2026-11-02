import Link from 'next/link';
import { redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { headlineOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';
import type { AgentHeadline, AgentSummary } from '@/types/agents';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { Activity, BranchName, Chip, Deck, HUD_PANEL, Led, Twig } from '@/components/agents/hud';
import { isLive, ledOf } from '@/components/agents/status';

export const metadata = { title: '에이전트 — 한백 전기차사업관리시스템' };
export const dynamic = 'force-dynamic';

/**
 * 에이전트 현황 [한백 관리자] (한백 지시 2026-11-01 「나의 에이전트 현황을 다 보고싶어」 · 11-02 「워크트리처럼 해서 좀 futurist 하게」).
 *
 * git 그래프처럼 그린다 — 뿌리(main)가 한백 본부, 담당마다 가지(⎇ agent/…), 가지 끝의 등이 상태다(components/agents/status).
 * 가지 줄마다: 맡은 범위의 셈(콘솔이 지금 셈한 것, lib/agents/brief headlineOf) · 최근 이레의 활동 칸 · 업무 정의 · 열린
 * 할 일 · 마지막 말. 누르면 그 담당과의 대화(/admin/agents/[id]). 셈은 저장하지 않는다 — 보드·명세서와 같은 정본을 읽는다.
 */
export default async function AgentsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/admin/agents');
  const actor = actorOf(session);
  const [agents, data] = await Promise.all([getRepository().listAgents(actor), loadScope(actor)]);
  const rows = agents.map((a) => ({ a, h: headlineOf(a, data) }));
  const operators = rows.filter((r) => r.a.kind === 'operator');
  const others = rows.filter((r) => r.a.kind !== 'operator');
  const open = agents.reduce((n, a) => n + a.openTasks, 0);
  const saidToday = agents.reduce((n, a) => n + (a.activity[a.activity.length - 1]?.n ?? 0), 0);
  const usdToday = agents.reduce((n, a) => n + a.usdToday, 0);

  return (
    <Deck>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-4">
        <div>
          <p className="font-mono text-tiny uppercase tracking-[0.25em] text-brand-300">hanbaek · agent tree</p>
          <h1 className="mt-1 text-h1 font-black text-white">에이전트</h1>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Stat label="담당" value={`${agents.length}`} />
          <Stat label="열린 할 일" value={`${open}`} />
          <Stat label="오늘 대화" value={`${saidToday}`} />
          <Stat label="오늘 비용" value={`$${usdToday.toFixed(2)}`} />
        </dl>
      </header>

      <div className="mt-5">
        {/* 뿌리 — 가지들의 줄기가 이 점에서 내려간다(세로줄 12px) */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand-300 bg-brand-400/15 shadow-[0_0_16px_rgba(86,167,108,0.7)]">
            <span className="h-2 w-2 rounded-full bg-brand-200" />
          </span>
          <span className="font-mono text-small font-bold text-white">main</span>
          <span className="text-small text-slate-400">한백 본부</span>
        </div>
        <ul>
          <Twig last={others.length === 0} node={<span aria-hidden className="block h-3 w-3 rotate-45 border border-brand-300 bg-[#070b10]" />}>
            <div className="flex h-[52px] items-center gap-2">
              <span className="font-mono text-small font-bold text-slate-100">operators/</span>
              <span className="text-small text-slate-400">운영사 담당 · {operators.length}</span>
            </div>
            <ul>
              {operators.map((r, i) => <Leaf key={r.a.id} agent={r.a} headline={r.h} last={i === operators.length - 1} />)}
            </ul>
          </Twig>
          {others.map((r, i) => <Leaf key={r.a.id} agent={r.a} headline={r.h} last={i === others.length - 1} />)}
        </ul>
      </div>
    </Deck>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-tiny font-semibold text-slate-400">{label}</dt>
      <dd className="font-mono text-h2 font-bold tabular-nums text-white">{value}</dd>
    </div>
  );
}

function Leaf({ agent: a, headline, last }: { agent: AgentSummary; headline: AgentHeadline; last: boolean }) {
  const led = ledOf({ lateTasks: a.lateTasks, duties: a.duties, headline });
  const live = isLive(a.last?.at);
  return (
    <Twig last={last} node={<Led tone={led.tone} live={live} label={`${led.label}${live ? ' · 최근 24시간 대화' : ''}`} />}>
      <Link
        href={`/admin/agents/${a.id}`}
        className={`mb-2 block ${HUD_PANEL} px-3 pb-3 pt-[14px] transition hover:border-brand-300/50 hover:bg-white/[0.06] hover:shadow-[0_0_28px_-10px_rgba(86,167,108,0.9)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/60`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-lead font-black text-white">{a.name}</span>
          <BranchName id={a.id} />
          <span className="ml-auto font-mono text-tiny tabular-nums text-slate-400">{a.last ? a.last.at.slice(5) : 'idle'}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <HeadlineCounts headline={headline} />
          <Activity cells={a.activity} />
          <span className="text-tiny font-semibold tabular-nums text-slate-400">업무 {a.duties} · 할 일 {a.openTasks}</span>
          {a.duties === 0 && <Chip tone="warn">업무 정의 미지정</Chip>}
          {a.lateTasks > 0 && <Chip tone="stop">기한 지남 {a.lateTasks}</Chip>}
        </div>
        {a.last && (
          <p className="mt-2 truncate text-small text-slate-400">
            <span className={a.last.role === 'agent' ? 'text-brand-300' : 'text-slate-300'}>
              {a.last.role === 'agent' ? '◆ ' : a.last.role === 'note' ? '✎ ' : '▸ '}
            </span>
            {a.last.line}
          </p>
        )}
      </Link>
    </Twig>
  );
}

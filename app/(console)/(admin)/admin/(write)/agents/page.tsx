import Link from 'next/link';
import { redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { headlineOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';
import type { AgentSummary } from '@/types/agents';
import { Empty, Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';

export const metadata = { title: '에이전트 — 한백 전기차사업관리시스템' };
export const dynamic = 'force-dynamic';

/**
 * 에이전트 현황 [한백 관리자] (한백 지시 2026-11-01 「나의 에이전트 현황을 다 보고싶어 — 운영사별 담당자 · 정산담당자 ·
 * 열린구매 상신 담당자 · 전략담당자의 현황을 웹사이트에서」).
 *
 * 담당마다 카드 한 장 — 지금 맡은 범위의 셈(콘솔이 지금 셈한 것, lib/agents/brief headlineOf) · 업무 정의 · 열린 할 일 ·
 * 마지막 말. 누르면 그 담당과의 대화(/admin/agents/[id]). 셈은 저장하지 않는다 — 보드·명세서와 같은 정본을 읽는다.
 */
export default async function AgentsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/admin/agents');
  const actor = actorOf(session);
  const [agents, data] = await Promise.all([getRepository().listAgents(actor), loadScope(actor)]);
  const open = agents.reduce((n, a) => n + a.openTasks, 0);
  const operators = agents.filter((a) => a.kind === 'operator');
  const others = agents.filter((a) => a.kind !== 'operator');

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-h1 font-black text-slate-900">에이전트</h1>
        <span className={`${TEXT.meta} tabular-nums`}>{agents.length}명 · 열린 할 일 {open}건</span>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className={TEXT.group}>운영사 담당</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {operators.map((a) => <AgentCard key={a.id} agent={a} headline={headlineOf(a, data)} />)}
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-2">
        <h2 className={TEXT.group}>정산 · 열린구매 · 전략·기획</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((a) => <AgentCard key={a.id} agent={a} headline={headlineOf(a, data)} />)}
        </div>
      </section>
    </div>
  );
}

function AgentCard({ agent, headline }: { agent: AgentSummary; headline: ReturnType<typeof headlineOf> }) {
  return (
    <Link
      href={`/admin/agents/${agent.id}`}
      className="flex min-w-0 flex-col gap-2 rounded-box border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <p className="text-lead font-black text-slate-900">{agent.name}</p>
      <HeadlineCounts headline={headline} />
      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
        <span className={`${TEXT.meta} tabular-nums`}>업무 정의 {agent.duties} · 할 일 {agent.openTasks}</span>
        {agent.duties === 0 && <Tag tone="warn">업무 정의 미지정</Tag>}
        {agent.lateTasks > 0 && <Tag tone="stop">기한 지남 {agent.lateTasks}</Tag>}
      </div>
      <div className="min-w-0">
        {agent.last ? (
          <>
            <p className={`${TEXT.meta} tabular-nums`}>
              {agent.last.at} · {agent.last.role === 'agent' ? agent.name : agent.last.role === 'note' ? '기록' : '지시'}
            </p>
            <p className="truncate text-small text-slate-700">{agent.last.line}</p>
          </>
        ) : (
          <p className={TEXT.meta}>대화 <Empty kind="wait" /></p>
        )}
      </div>
    </Link>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { headlineOf, siteLinesOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';
import type { AgentDetail } from '@/types/agents';
import { AGENT_KIND_LABEL } from '@/types/agents';
import { Badge } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { AgentRoom } from '@/components/agents/AgentRoom';
import { AgentDuties } from '@/components/agents/AgentDuties';
import { AgentTasks } from '@/components/agents/AgentTasks';

export const metadata = { title: '에이전트 — 한백 전기차사업관리시스템' };
export const dynamic = 'force-dynamic';

/**
 * 담당 하나 [한백 관리자] — 왼쪽은 대화(지시 · 기록 · 에이전트의 답이 그대로 남는다), 오른쪽은 업무 정의와 할 일.
 * (한백 지시 2026-11-02 「각 운영사별로 해야 할 업무들과 각 담당자와의 커뮤니케이션을 기록해야해 · 그 업무들에 대한 정의도
 * 내가 담당자별로 지정할거야」)
 */
export default async function AgentPage({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/admin/agents/${params.id}`);
  const actor = actorOf(session);
  let detail: AgentDetail;
  try {
    detail = await getRepository().getAgent(params.id, actor);
  } catch {
    notFound();
  }
  const data = await loadScope(actor);
  const { agent } = detail;
  /* 할 일에 고를 현장 — 운영사 담당은 그 운영사의 진행 중인 현장만 */
  const sites = agent.kind === 'operator' && agent.cpo
    ? siteLinesOf(data.projects, agent.cpo).live
      .map((s) => ({ id: s.id, label: `${s.no} ${s.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
    : [];

  return (
    <div className="max-w-6xl">
      <Link href="/admin/agents" className="text-small font-bold text-slate-500 transition hover:text-brand-700">
        ← 에이전트
      </Link>
      <div className="mb-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-h1 font-black text-slate-900">{agent.name}</h1>
        <Badge tone="mute">{AGENT_KIND_LABEL[agent.kind]}</Badge>
        <HeadlineCounts headline={headlineOf(agent, data)} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <AgentRoom agentId={agent.id} agentName={agent.name} messages={detail.messages} />
        <div className="flex flex-col gap-4">
          <AgentDuties agentId={agent.id} duties={detail.duties} />
          <AgentTasks agentId={agent.id} agentName={agent.name} tasks={detail.tasks} sites={sites} today={data.today} />
        </div>
      </div>
    </div>
  );
}

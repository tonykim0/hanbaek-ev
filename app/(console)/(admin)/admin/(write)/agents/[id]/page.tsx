import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { headlineOf, siteLinesOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';
import type { AgentDetail } from '@/types/agents';
import { AGENT_KIND_LABEL } from '@/types/agents';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { AgentRoom } from '@/components/agents/AgentRoom';
import { AgentDuties } from '@/components/agents/AgentDuties';
import { AgentTasks } from '@/components/agents/AgentTasks';
import { Chip, Deck, Led } from '@/components/agents/hud';
import { isLive, ledOf, roleLineOf } from '@/components/agents/status';

export const metadata = { title: '에이전트 — 한백 전기차사업관리시스템' };
export const dynamic = 'force-dynamic';

/**
 * 담당 하나 [한백 관리자] — 왼쪽은 대화(지시 · 기록 · 에이전트의 답이 로그처럼 남는다), 오른쪽은 업무 정의와 할 일.
 * (한백 지시 2026-11-02 「각 운영사별로 해야 할 업무들과 각 담당자와의 커뮤니케이션을 기록해야해 · 그 업무들에 대한 정의도
 * 내가 담당자별로 지정할거야」 · 같은 날 「워크트리처럼 해서 좀 futurist 하게」 — 모양은 components/agents/hud)
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
  const headline = headlineOf(agent, data);
  const lateTasks = detail.tasks.filter((t) => !t.doneAt && t.due !== null && t.due < data.today).length;
  const led = ledOf({ lateTasks, duties: detail.duties.length, headline });
  const live = isLive(detail.messages[detail.messages.length - 1]?.at);
  /* 할 일에 고를 현장 — 운영사 담당은 그 운영사의 진행 중인 현장만 */
  const sites = agent.kind === 'operator' && agent.cpo
    ? siteLinesOf(data.projects, agent.cpo).live
      .map((s) => ({ id: s.id, label: `${s.no} ${s.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
    : [];

  return (
    <Deck>
      <nav className="text-tiny font-semibold text-slate-400">
        <Link href="/admin/agents" className="transition hover:text-brand-200">← 에이전트 조직도</Link>
      </nav>
      <header className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.07] pb-4">
        <Led tone={led.tone} live={live} label={`${led.label}${live ? ' · 최근 24시간 대화' : ''}`} />
        <h1 className="text-h1 font-black text-white">{agent.name}</h1>
        <Chip>{AGENT_KIND_LABEL[agent.kind]}</Chip>
        <span className="text-small font-semibold text-slate-400">{roleLineOf(agent)}</span>
        <HeadlineCounts headline={headline} />
      </header>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <AgentRoom agentId={agent.id} agentName={agent.name} messages={detail.messages} />
        <div className="flex flex-col gap-4">
          <AgentDuties agentId={agent.id} duties={detail.duties} />
          <AgentTasks agentId={agent.id} agentName={agent.name} tasks={detail.tasks} sites={sites} today={data.today} />
        </div>
      </div>
    </Deck>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { headlineOf, siteLinesOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';
import type { AgentDetail } from '@/types/agents';
import { AGENT_KIND_LABEL } from '@/types/agents';
import { Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { AgentRoom } from '@/components/agents/AgentRoom';
import { AgentDuties } from '@/components/agents/AgentDuties';
import { AgentTasks } from '@/components/agents/AgentTasks';
import { AgentWeeks } from '@/components/agents/AgentWeeks';
import { AgentMark } from '@/components/agents/kit';
import { MailAccount } from '@/components/agents/MailAccount';
import { isLive, ledOf, roleLineOf } from '@/components/agents/status';

export const metadata = { title: 'AI에이전트' };
export const dynamic = 'force-dynamic';

/**
 * 담당 하나 [한백 관리자] — 왼쪽은 대화(지시 · 기록 · 에이전트의 답 · 넘긴 파일이 로그처럼 남는다), 오른쪽은 주간 기록 ·
 * 업무 정의 · 할 일. 주간 기록에서 한 주를 고르면(?week=그 주 월요일) 왼쪽이 그 주의 말과 일로 바뀐다.
 * (한백 지시 2026-11-02 「각 운영사별로 해야 할 업무들과 각 담당자와의 커뮤니케이션을 기록해야해 · 그 업무들에 대한 정의도
 * 내가 담당자별로 지정할거야」 · 「주단위로 뭐했는지도 과거 이력 조회」 · 「파일업로드 기능도」 — 모양은 components/agents/kit)
 * 담당이 올린 메일 초안은 대화의 그 답 밑에 서고 한백이 승인해야 나간다 — 보내는 메일(한백의 다음 메일)은 머리말 밑 한 줄이다(MailAccount).
 */
export default async function AgentPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/admin/agents/${params.id}`);
  const actor = actorOf(session);
  let detail: AgentDetail;
  try {
    detail = await getRepository().getAgent(params.id, actor, { week: searchParams.week ?? null });
  } catch {
    notFound();
  }
  const [data, account] = await Promise.all([loadScope(actor), getRepository().getMailAccount(actor)]);
  const { agent } = detail;
  const headline = headlineOf(agent, data);
  const lateTasks = detail.tasks.filter((t) => !t.doneAt && t.due !== null && t.due < data.today).length;
  const led = ledOf({ lateTasks, duties: detail.duties.length, headline });
  const live = isLive(detail.messages[detail.messages.length - 1]?.at) && !detail.week;
  /* 할 일에 고를 현장 — 운영사 담당은 그 운영사의 진행 중인 현장만 */
  const sites = agent.kind === 'operator' && agent.cpo
    ? siteLinesOf(data.projects, agent.cpo).live
      .map((s) => ({ id: s.id, label: `${s.no} ${s.name}` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
    : [];

  return (
    <>
      <nav className="mb-4">
        <Link href="/admin/agents" className="text-small font-bold text-slate-500 transition hover:text-brand-800">← AI에이전트 조직도</Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <AgentMark size="lg" tone={led.tone} live={live} label={`${led.label}${live ? ' · 최근 24시간 대화' : ''}`} />
        <div className="min-w-0">
          <p className="mb-0.5 text-small font-bold text-brand-700">AI 담당</p>
          <h1 className="text-h1 font-black text-slate-900">{agent.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* 갈래 이름은 운영사 담당에만 — 정산 · 전략·기획은 이름이 곧 갈래라 「정산 담당」 옆의 「정산」이 같은 말을 두 번 한다(규칙 5) */}
          {agent.kind === 'operator' && <Tag>{AGENT_KIND_LABEL[agent.kind]}</Tag>}
          <span className={TEXT.meta}>{roleLineOf(agent)}</span>
          <HeadlineCounts headline={headline} />
        </div>
      </header>
      <div className="-mt-3 mb-5">
        <MailAccount account={account} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 주를 바꾸면 새로 그린다 — 앞 주의 말이 한 번 비쳤다 바뀌지 않게 */}
        <AgentRoom
          key={detail.week?.start ?? 'live'}
          agentId={agent.id}
          agentName={agent.name}
          messages={detail.messages}
          mails={detail.mails}
          connected={account !== null}
          week={detail.week}
          today={data.today}
        />
        <div className="flex flex-col gap-4">
          <AgentWeeks agentId={agent.id} weeks={detail.weeks} selected={detail.week?.start ?? null} today={data.today} />
          <AgentDuties agentId={agent.id} duties={detail.duties} />
          <AgentTasks agentId={agent.id} agentName={agent.name} tasks={detail.tasks} sites={sites} today={data.today} />
        </div>
      </div>
    </>
  );
}

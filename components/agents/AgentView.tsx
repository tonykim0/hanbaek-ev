import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { loadAgentSide } from '@/lib/agents/scope';
import { BIZ_AGENTS, type Biz } from '@/lib/biz';
import type { AgentDetail } from '@/types/agents';
import { AGENT_KIND_LABEL, isCounterpart } from '@/types/agents';
import { Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { AgentRoom } from '@/components/agents/AgentRoom';
import { AgentDuties } from '@/components/agents/AgentDuties';
import { AgentTasks } from '@/components/agents/AgentTasks';
import { AgentWeeks } from '@/components/agents/AgentWeeks';
import { AgentMark } from '@/components/agents/kit';
import { MailAccount } from '@/components/agents/MailAccount';
import { ReadAgentAlarms } from '@/components/agents/ReadAgentAlarms';
import { isLive, ledOf, roleLineOf } from '@/components/agents/status';

/**
 * 담당 하나 [한백 관리자] — 왼쪽은 대화(지시 · 기록 · 에이전트의 답 · 넘긴 파일이 로그처럼 남는다), 오른쪽은 주간 기록 ·
 * 업무 정의 · 할 일. 주간 기록에서 한 주를 고르면(?week=그 주 월요일) 왼쪽이 그 주의 말과 일로 바뀐다.
 * (한백 지시 2026-11-02 「각 운영사별로 해야 할 업무들과 각 담당자와의 커뮤니케이션을 기록해야해 · 그 업무들에 대한 정의도
 * 내가 담당자별로 지정할거야」 · 「주단위로 뭐했는지도 과거 이력 조회」 · 「파일업로드 기능도」 — 모양은 components/agents/kit)
 * 담당이 올린 메일 초안은 대화의 그 답 밑에 서고 한백이 승인해야 나간다 — 보내는 메일(한백의 다음 메일)은 머리말 밑 한 줄이다(MailAccount).
 *
 * 사업마다의 조직도 밑에 선다(/admin/agents/[id] 전기차 · /solar/agents/[id] 태양광 — 2026-11-04). 다른 사업의 주소로 열면 제
 * 사업의 주소로 보낸다(알림 줄 · 옛 링크가 사업을 모르고 열어도 제 틀 · 제 조직도로 간다).
 */
export async function AgentView({ biz, id, week }: { biz: Biz; id: string; week: string | null }) {
  const page = `${BIZ_AGENTS[biz]}/${id}`;
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=${page}`);
  const actor = actorOf(session);
  let detail: AgentDetail;
  try {
    detail = await getRepository().getAgent(id, actor, { week });
  } catch {
    notFound();
  }
  const { agent } = detail;
  /* redirect 는 던져서 멈춘다 — 위 try 밖에서 */
  if (agent.biz !== biz) redirect(`${BIZ_AGENTS[agent.biz]}/${agent.id}${week ? `?week=${encodeURIComponent(week)}` : ''}`);
  const home = `${BIZ_AGENTS[agent.biz]}/${agent.id}`;
  const [side, account] = await Promise.all([loadAgentSide(biz, actor), getRepository().getMailAccount(actor, biz)]);
  const headline = side.headline(agent);
  const lateTasks = detail.tasks.filter((t) => !t.doneAt && t.due !== null && t.due < side.today).length;
  const led = ledOf({ lateTasks, duties: detail.duties.length, headline });
  const live = isLive(detail.messages[detail.messages.length - 1]?.at) && !detail.week;

  return (
    <>
      {/* 이 담당의 정기 알림(열린구매 상신)은 여기를 열면 읽힌다 — 알림 줄을 누르면 여기로 온다 */}
      <ReadAgentAlarms agentId={agent.id} />
      <nav className="mb-4">
        <Link href={BIZ_AGENTS[biz]} className="text-small font-bold text-slate-500 transition hover:text-brand-800">← AI에이전트 조직도</Link>
      </nav>
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <AgentMark size="lg" tone={led.tone} live={live} label={`${led.label}${live ? ' · 최근 24시간 대화' : ''}`} />
        <div className="min-w-0">
          <p className="mb-0.5 text-small font-bold text-brand-700">AI 담당</p>
          <h1 className="text-h1 font-black text-slate-900">{agent.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* 갈래 이름은 운영사 · 사업자 담당에만 — 정산 · 전략·기획은 이름이 곧 갈래라 「정산 담당」 옆의 「정산」이 같은 말을 두 번 한다(규칙 5) */}
          {isCounterpart(agent.kind) && <Tag>{AGENT_KIND_LABEL[agent.kind]}</Tag>}
          <span className={TEXT.meta}>{roleLineOf(agent)}</span>
          {headline.counts.length > 0 && <HeadlineCounts headline={headline} />}
        </div>
      </header>
      <div className="-mt-3 mb-5">
        <MailAccount account={account} biz={biz} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 주를 바꾸면 새로 그린다 — 앞 주의 말이 한 번 비쳤다 바뀌지 않게 */}
        <AgentRoom
          key={detail.week?.start ?? 'live'}
          agentId={agent.id}
          agentName={agent.name}
          home={home}
          messages={detail.messages}
          mails={detail.mails}
          connected={account !== null}
          week={detail.week}
          today={side.today}
        />
        <div className="flex flex-col gap-4">
          <AgentWeeks home={home} weeks={detail.weeks} selected={detail.week?.start ?? null} today={side.today} />
          <AgentDuties agentId={agent.id} duties={detail.duties} />
          {/* 할 일에 고를 현장 — 전기차 운영사 담당은 그 운영사의 진행 중인 현장만. 태양광은 아직 없다(loadAgentSide) */}
          <AgentTasks agentId={agent.id} agentName={agent.name} tasks={detail.tasks} sites={side.taskSites(agent)} today={side.today} />
        </div>
      </div>
    </>
  );
}

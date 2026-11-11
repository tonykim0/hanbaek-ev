import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { loadAgentSide } from '@/lib/agents/scope';
import { BIZ_AGENTS, type Biz } from '@/lib/biz';
import type { AgentDetail } from '@/types/agents';
import { AGENT_KIND_LABEL, isCounterpart, isLead } from '@/types/agents';
import { Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { AgentRoom } from '@/components/agents/AgentRoom';
import { AgentDuties } from '@/components/agents/AgentDuties';
import { AgentMemos } from '@/components/agents/AgentMemos';
import { AgentWeeks } from '@/components/agents/AgentWeeks';
import { AgentMark } from '@/components/agents/kit';
import { MailAccount } from '@/components/agents/MailAccount';
import { AgitAccount } from '@/components/agents/AgitAccount';
import { OPEN_PURCHASE_AGENT } from '@/lib/agents/open-purchase';
import { ReadAgentAlarms } from '@/components/agents/ReadAgentAlarms';
import { roleLineOf, stateOf } from '@/components/agents/status';
import { NowLine, StateBadge } from '@/components/agents/AgentState';

/**
 * 담당 하나 [한백 관리자] — 왼쪽은 대화(지시 · 기록 · 에이전트의 답 · 넘긴 파일이 로그처럼 남는다), 오른쪽은 업무 정의 ·
 * 메모 · 주간 기록. 주간 기록에서 한 주를 고르면(?week=그 주 월요일) 왼쪽이 그 주의 말과 일로 바뀐다.
 * (한백 지시 2026-11-02 「각 운영사별로 해야 할 업무들과 각 담당자와의 커뮤니케이션을 기록해야해 · 그 업무들에 대한 정의도
 * 내가 담당자별로 지정할거야」 · 「주단위로 뭐했는지도 과거 이력 조회」 · 「파일업로드 기능도」 — 모양은 components/agents/kit)
 * 담당이 올린 메일 초안은 대화의 그 답 밑에 서고 한백이 승인해야 나간다 — 보내는 메일(한백의 다음 메일)은 머리말 밑 한 줄이다(MailAccount).
 * 전기차 정산 담당은 아지트 열린구매 글 초안도 그렇다(AgitCard · 한백 2026-11-08) — 아지트 연결 · 요청 담당은 그 밑 두 줄(AgitAccount).
 *
 * 사업마다의 팀 화면 밑에 선다(/admin/agents/[id] 전기차 · /solar/agents/[id] 태양광 — 2026-11-04). 다른 사업의 주소로 열면 제
 * 사업의 주소로 보낸다(알림 줄 · 옛 링크가 사업을 모르고 열어도 제 틀 · 제 팀으로 간다).
 *
 * ★팀에서의 자리★(한백 2026-11-04 「전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는 실무자들이야」) — 머리말에 팀장 · 실무자.
 * 머리말의 상태 배지 · 지금 하는 일은 현황의 그 줄과 같은 판정이다(components/agents/status · AgentState).
 *
 * ★오른쪽에 할 일 · 목표 · 방향 · 팀 공용 메모를 두지 않는다★(한백 2026-11-11 「에이전트에서 할일, 목표 방향 팀 공용메모, 지워줘.
 * 업무정의는 위로 올려주고」) — 화면에서만 뺐다. 담당은 그대로 할 일을 적고(열린구매 상신 · 양식 메일 — 맨 앞의 것이 머리말
 * 「지금 하는 일」에 선다) 목표 · 방향과 팀 공용 메모를 읽고 적는다. 목표 · 방향은 팀 현황 표 밑에서 고친다(AgentsTeam).
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
  const [side, account, memos] = await Promise.all([
    loadAgentSide(biz, actor), getRepository().getMailAccount(actor, biz), getRepository().agentMemos(actor, agent.id),
  ]);
  /* 아지트 열린구매 글 — 전기차 정산 담당만. 실린 말 밑의 초안과 연결 · 요청 담당 */
  const withAgit = agent.id === OPEN_PURCHASE_AGENT && agent.biz === 'ev';
  const [agitHook, agitPosts] = withAgit
    ? await Promise.all([
      getRepository().getAgitHook(actor),
      getRepository().listAgitPosts(actor, detail.messages.map((m) => m.id)),
    ])
    : [null, []];
  const lead = isLead(agent.kind);
  const headline = side.headline(agent);
  const open = detail.tasks.filter((t) => !t.doneAt);
  const lateTasks = open.filter((t) => t.due !== null && t.due < side.today).length;
  const state = stateOf({ lateTasks, duties: detail.duties.length, pendingMails: detail.pendingMails, headline });
  /* 지금 하는 일의 「최근 대화」 — 지금 대화일 때만(한 주를 골랐으면 그 주의 마지막 말이라 「최근」이 아니다) */
  const lastSaid = detail.week ? null : detail.messages[detail.messages.length - 1] ?? null;

  return (
    <>
      {/* 이 담당의 정기 알림(열린구매 상신)은 여기를 열면 읽힌다 — 알림 줄을 누르면 여기로 온다 */}
      <ReadAgentAlarms agentId={agent.id} />
      {/*
        머리말은 다른 화면의 상세와 같은 꼴이다(계약서 작성 PageChrome) — 되돌아가는 길 · 제목 · 곁글 한 줄. 제목 줄에 팀에서의 자리와
        상태 배지, 곁글 밑에 지금 하는 일 한 줄(현황의 그 줄과 같은 것 — 2026-11-05)
      */}
      <header className="mb-6">
        <Link href={BIZ_AGENTS[biz]} className="mb-3 inline-flex items-center gap-1 text-base text-slate-500 transition hover:text-brand-700">
          ← 팀 현황
        </Link>
        <div className="flex items-start gap-3.5">
          <AgentMark size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="text-h1 font-black text-slate-900">{agent.name}</h1>
              {/* 팀에서의 자리 — 팀장 · 실무자 */}
              <Tag>{lead ? '팀장' : '실무자'}</Tag>
              {/* 갈래 이름은 운영사 · 사업자 담당에만 — 정산 · 전략·기획은 이름이 곧 갈래라 「정산 담당」 옆의 「정산」이 같은 말을 두 번 한다(규칙 5) */}
              {isCounterpart(agent.kind) && <Tag>{AGENT_KIND_LABEL[agent.kind]}</Tag>}
              <StateBadge state={state} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-base text-slate-500">{roleLineOf(agent)}</span>
              {headline.counts.length > 0 && <HeadlineCounts headline={headline} />}
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-2.5">
              <span className={`shrink-0 ${TEXT.label}`}>지금 하는 일</span>
              <div className="min-w-0 flex-1">
                <NowLine
                  task={open[0] ?? null}
                  open={open.length}
                  mails={detail.pendingMails}
                  last={lastSaid ? { at: lastSaid.at, line: lastSaid.body.replace(/\s+/g, ' ').slice(0, 120) } : null}
                  today={side.today}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <MailAccount account={account} biz={biz} />
          {withAgit && agitHook && <AgitAccount hook={agitHook} />}
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/*
          대화는 화면 높이에 맞춘 판이고 오른쪽을 내려 읽는 동안에도 위에 붙어 있다 — 쓰는 칸이 늘 보이게(2026-11-05 채팅 화면의 문법).
          높이는 머리말 밑에서 화면 끝까지(보드 판과 같은 방식 — ProjectBoard 의 100vh − 14rem). 좁은 화면은 판이 제 높이다.
        */}
        <div className="min-w-0 lg:sticky lg:top-[calc(var(--console-top)+1rem)] lg:h-[calc(100vh-18rem)] lg:min-h-[480px]">
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
            agit={withAgit ? {
              posts: agitPosts,
              account: {
                connected: agitHook?.connected ?? false, expired: agitHook?.expired ?? null, feePayee: Boolean(agitHook?.feePayee),
              },
              assignees: agitHook?.assignees ?? [],
            } : undefined}
          />
        </div>
        {/*
          오른쪽은 업무 정의가 맨 위다 → 메모 → 주간 기록(2026-11-11 — 할 일 · 목표 · 방향 · 팀 공용 메모를 뺐다, 머리말 주석).
        */}
        <div className="flex flex-col gap-4">
          <AgentDuties agentId={agent.id} duties={detail.duties} />
          {/* 메모장 — 담당이 대화 중에 적고 한백이 고친다. 담당은 제목만 늘 읽고 내용은 그때그때 꺼내 쓴다 */}
          <AgentMemos agentId={agent.id} memos={memos.mine} />
          <AgentWeeks home={home} weeks={detail.weeks} selected={detail.week?.start ?? null} today={side.today} />
        </div>
      </div>
    </>
  );
}

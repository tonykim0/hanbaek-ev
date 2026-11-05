import Link from 'next/link';
import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { loadAgentSide } from '@/lib/agents/scope';
import { BIZ_AGENTS, type Biz } from '@/lib/biz';
import { AGENT_KIND_LABEL, isCounterpart, isLead, type AgentHeadline, type AgentSummary } from '@/types/agents';
import { GroupHead, PANEL, Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { AgentMark } from '@/components/agents/kit';
import { MailAccount } from '@/components/agents/MailAccount';
import { AgentUsage } from '@/components/agents/AgentUsage';
import { AgentDirections } from '@/components/agents/AgentDirections';
import { roleLineOf, stateOf } from '@/components/agents/status';
import { NowLine, StateBadge, StateLegend } from '@/components/agents/AgentState';

/** 상대 회사를 하나씩 맡는 실무자들의 묶음 이름 */
const DEPT: Record<Biz, string> = { ev: '운영사 담당', solar: '사업자 담당' };

/*
 * 팀 표의 열 — 담당 · 상태 · 지금 하는 일 · 맡은 범위 · 마지막 대화. 층 머리 · 열 이름 · 담당 줄이 같은 칸을 써서 세로로 선다.
 * 좁으면 두 칸(이름 | 상태)에 나머지가 밑으로 접힌다. tailwind 가 클래스를 만들도록 글자 그대로 적는다.
 */
const COLS = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 lg:grid-cols-[minmax(0,13rem)_6.5rem_minmax(0,1fr)_minmax(0,17rem)_5.5rem]';

/**
 * 팀 현황 [한백 관리자] — 사이드바 묶음 「AI에이전트」의 메뉴 하나(2026-11-05 「AI에이전트」에서 이름을 바꿨다 — 묶음과 메뉴가 같은
 * 말을 두 번 했다). ★팀이다, 위에서 아래로★ (한백 2026-11-04 「조직도말고 다른 형식으로 바꿔야겟어. 그떄 몇가지 옵션을
 * 줬었던거같아. 위에서 아래로」 · 「한백은 없어도돼」 · 「결국엔 전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는
 * 실무자들이야 … 상호보완구조여야해. 이건 전기차, 태양광 둘 다 같아」).
 *
 * 층이 차례로 내려간다: ① 팀장 · 전략·기획 → ② 실무자 · 운영사(사업자) 담당 → ③ 실무자 · 정산. 팀장은 실무자들의 대화 · 할 일을
 * 읽고(위로), 실무자 모두는 팀장이 세운 목표 · 방향을 부를 때마다 읽는다(아래로 — lib/agents/team).
 *
 * ★한 판의 표다★(2026-11-05 한백 「UI가 너무 뒤죽박죽 … 전략기획담당 바로 옆에 목표,방향 컴포넌트가 있는게 어색」 · 「각 담당자별로
 * 현재 하고 있는 업무를 한줄로」 · 「초록색, 빨간색, 노란색, 회색 … 이것도 표시해줘야할듯」). 그전에는 층마다 폭이 다른 카드
 * (팀장 한 장 + 그 옆의 목표 · 방향 · 다섯 칸 줄 · 정산 한 장)가 놓여 같은 값이 칸마다 다른 자리에 있었다. 지금은 담당 한 사람이 한
 * 줄이고 열이 같다 — 담당 · 상태(글자가 붙은 배지) · 지금 하는 일(맨 앞의 열린 할 일 — components/agents/AgentState) · 맡은 범위의
 * 셈 · 마지막 대화. 층은 표 안의 머리 줄이고, 색 풀이는 표 위 한 줄이다(화면 제목이 「팀 현황」이라 「팀」 구역 머리는 두지 않는다). 목표 · 방향은 표 밑 제 판이다(팀장 칸 옆이 아니라).
 *
 * 사업마다 따로다 — 전기차 /admin/agents 는 운영사 담당 다섯, 태양광 /solar/agents 는 사업자 담당 셋이고 모양은 같다. 줄을 누르면
 * 그 담당과의 대화(그 사업의 화면 밑 /[id]).
 */
export async function AgentsTeam({ biz }: { biz: Biz }) {
  const home = BIZ_AGENTS[biz];
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=${home}`);
  const actor = actorOf(session);
  const repo = getRepository();
  const [agents, side, account, usage, team] = await Promise.all([
    repo.listAgents(actor, biz), loadAgentSide(biz, actor), repo.getMailAccount(actor, biz), repo.agentUsage(actor, biz),
    repo.agentTeam(actor, biz),
  ]);
  const rows = agents.map((a) => ({ a, h: side.headline(a) }));
  const lead = rows.find((r) => isLead(r.a.kind)) ?? null;
  const counterparts = rows.filter((r) => isCounterpart(r.a.kind));
  /* 운영사 · 사업자 담당 밖의 실무자 — 정산. 갈래마다 한 층 */
  const rest = rows.filter((r) => !isLead(r.a.kind) && !isCounterpart(r.a.kind));
  const open = agents.reduce((n, a) => n + a.openTasks, 0);
  const saidToday = agents.reduce((n, a) => n + (a.activity[a.activity.length - 1]?.n ?? 0), 0);
  const usdToday = agents.reduce((n, a) => n + a.usdToday, 0);
  const dept = side.dept(counterparts.map((r) => r.a));
  /* 층 번호 — 팀장 · 운영사(사업자) 담당 · 정산 순, 없는 층은 건너뛴다 */
  const leadStep = lead ? 1 : 0;
  const deptStep = leadStep + (counterparts.length > 0 ? 1 : 0);
  const row = (r: { a: AgentSummary; h: AgentHeadline }) => <AgentRow key={r.a.id} agent={r.a} headline={r.h} today={side.today} />;

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="text-h1 font-black text-slate-900">팀 현황</h1>
        <p className="mt-1.5 text-base tabular-nums text-slate-500">
          담당 {agents.length} · 열린 할 일 {open} · 오늘 대화 {saidToday} · 오늘 비용 ${usdToday.toFixed(2)}
        </p>
        <div className="mt-3">
          <MailAccount account={account} biz={biz} />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <StateLegend biz={biz} />
        <div className={`${PANEL} overflow-hidden`}>
          <div className={`${COLS} hidden px-4 py-2.5 lg:grid`}>
            <span className={TEXT.label}>담당</span>
            <span className={TEXT.label}>상태</span>
            <span className={TEXT.label}>지금 하는 일</span>
            <span className={TEXT.label}>맡은 범위</span>
            <span className={`${TEXT.label} text-right`}>마지막 대화</span>
          </div>
          {lead && (
            <>
              <TierHead first step={leadStep} title={AGENT_KIND_LABEL[lead.a.kind]} role="팀장" />
              {row(lead)}
            </>
          )}
          {counterparts.length > 0 && (
            <>
              <TierHead first={!lead} step={deptStep} title={DEPT[biz]} role="실무자" meta={`${counterparts.length}곳`} counts={dept} />
              {counterparts.map(row)}
            </>
          )}
          {rest.map((r, i) => (
            <Fragment key={r.a.id}>
              <TierHead step={deptStep + i + 1} title={AGENT_KIND_LABEL[r.a.kind]} role="실무자" />
              {row(r)}
            </Fragment>
          ))}
        </div>
      </section>

      {/* 팀장이 세우고 실무자 모두가 읽는 것 — 팀장 줄 옆이 아니라 팀 밑 제 판이다(2026-11-05) */}
      {lead && <AgentDirections leadId={lead.a.id} directions={team.directions} clamp />}

      {/* 팀 밑 — 이번 달 · 지난달 담당별 답과 비용(어림), 이번 달 토큰 */}
      <AgentUsage usage={usage} />
    </div>
  );
}

/**
 * 층 머리 — 표 안의 옅은 띠. 갈래 전체의 셈(운영사 담당 다섯의 합)은 맡은 범위 열에 선다. 맨 앞 층은 좁은 화면에서 윗줄을 뺀다 —
 * 열 이름 줄이 숨어 판의 테두리와 겹친다.
 */
function TierHead({ first = false, step, title, role, meta, counts }: {
  first?: boolean; step: number; title: string; role: '팀장' | '실무자'; meta?: string; counts?: AgentHeadline;
}) {
  return (
    <div className={`${COLS} items-center gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2 ${first ? 'max-lg:border-t-0' : ''}`}>
      <div className="col-span-2 lg:col-span-3">
        <GroupHead step={step} title={title} meta={meta}><Tag>{role}</Tag></GroupHead>
      </div>
      {counts && counts.counts.length > 0 && (
        <div className="col-span-2 lg:col-span-1"><HeadlineCounts headline={counts} /></div>
      )}
    </div>
  );
}

/**
 * 담당 한 사람의 줄 — 누르면 그 담당과의 대화. 이름 밑에는 맡은 일(운영사 · 사업자 담당은 층 이름이 이미 말해 줄마다 되풀이하지
 * 않는다). 상태의 까닭은 같은 줄에 같은 색으로 보인다(./status 머리말).
 */
function AgentRow({ agent: a, headline, today }: { agent: AgentSummary; headline: AgentHeadline; today: string }) {
  const state = stateOf({ lateTasks: a.lateTasks, duties: a.duties, pendingMails: a.pendingMails, headline });
  return (
    <Link
      href={`${BIZ_AGENTS[a.biz]}/${a.id}`}
      className={`${COLS} items-center gap-y-2 border-t border-slate-100 px-4 py-3 transition hover:bg-brand-50/40 focus:outline-none focus-visible:bg-brand-50/60`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <AgentMark />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{a.name}</p>
          {!isCounterpart(a.kind) && <p className={`truncate ${TEXT.meta}`}>{roleLineOf(a)}</p>}
        </div>
      </div>
      <div className="justify-self-end lg:justify-self-start"><StateBadge state={state} /></div>
      <div className="col-span-2 min-w-0 lg:col-span-1">
        <NowLine task={a.topTask} open={a.openTasks} mails={a.pendingMails} last={a.last} today={today} />
      </div>
      <div className="min-w-0">
        {headline.counts.length > 0 ? <HeadlineCounts headline={headline} /> : <span className={TEXT.meta}>—</span>}
      </div>
      <span className={`${TEXT.meta} text-right tabular-nums`}>{a.last ? a.last.at.slice(5) : '—'}</span>
    </Link>
  );
}

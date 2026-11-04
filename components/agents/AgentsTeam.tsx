import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { loadAgentSide } from '@/lib/agents/scope';
import { BIZ_AGENTS, type Biz } from '@/lib/biz';
import { AGENT_KIND_LABEL, isCounterpart, isLead, type AgentHeadline, type AgentSummary } from '@/types/agents';
import { Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { Activity, AgentMark, DotGrid, TEAM_LINE } from '@/components/agents/kit';
import { MailAccount } from '@/components/agents/MailAccount';
import { AgentUsage } from '@/components/agents/AgentUsage';
import { AgentDirections } from '@/components/agents/AgentDirections';
import { isLive, ledOf, roleLineOf } from '@/components/agents/status';

/** 상대 회사를 하나씩 맡는 실무자들의 묶음 이름 */
const DEPT: Record<Biz, string> = { ev: '운영사 담당', solar: '사업자 담당' };

/*
 * 실무자 줄의 칸 — 넓을수록 한 줄에 다 선다(전기차 운영사 다섯 · 태양광 사업자 셋). 정산 줄도 같은 칸을 써서 카드 폭이 위 줄과
 * 맞는다. tailwind 가 클래스를 만들도록 글자 그대로 적는다.
 */
const GRID: Record<number, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
};

/**
 * AI에이전트 [한백 관리자] — ★팀이다, 위에서 아래로★ (한백 2026-11-04 「조직도말고 다른 형식으로 바꿔야겟어. 그떄 몇가지 옵션을
 * 줬었던거같아. 위에서 아래로」 · 「한백은 없어도돼」 · 「결국엔 전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는
 * 실무자들이야 … 상호보완구조여야해. 이건 전기차, 태양광 둘 다 같아」).
 *
 * 11-02 에 그림 셋 중 하나였던 「우선순위 차례로 위→아래」다 — 줄기 하나가 내려가며 층을 이룬다: ① 팀장 · 전략·기획 → ② 실무자 ·
 * 운영사(사업자) 담당 → ③ 실무자 · 정산. 그때 고른 조직도(한백 → 전략 → 갈래)는 걷었고, 맨 위의 한백 칸도 뺐다. 팀장의 층에는
 * 팀장이 세운 목표 · 방향이 같이 선다 — 실무자 모두가 부를 때마다 읽는 것(아래로)이고, 팀장은 실무자들의 대화 · 할 일을 읽는다
 * (위로 — lib/agents/team). 두 갈래를 팀장 층 밑에 화살표 둘로 적는다.
 *
 * 사업마다 따로다 — 전기차 /admin/agents 는 운영사 담당 다섯, 태양광 /solar/agents 는 사업자 담당 셋이고 모양은 같다. 칸마다 담당
 * 표지의 등이 상태다(components/agents/status) — 맡은 범위의 셈(lib/agents/scope loadAgentSide) · 최근 이레의 활동 칸 · 업무 정의 ·
 * 열린 할 일. 누르면 그 담당과의 대화(그 사업의 화면 밑 /[id]). 모양은 components/agents/kit.
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
  const grid = `grid gap-3 ${GRID[Math.min(Math.max(counterparts.length, 1), 5)]}`;
  /* 층 번호 — 팀장 · 운영사(사업자) 담당 · 정산 순, 없는 층은 건너뛴다 */
  const leadStep = lead ? 1 : 0;
  const deptStep = leadStep + (counterparts.length > 0 ? 1 : 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-small font-bold text-brand-700">AI 담당 팀</p>
          <h1 className="text-h1 font-black text-slate-900">AI에이전트</h1>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Stat label="담당" value={`${agents.length}`} />
          <Stat label="열린 할 일" value={`${open}`} />
          <Stat label="오늘 대화" value={`${saidToday}`} />
          <Stat label="오늘 비용" value={`$${usdToday.toFixed(2)}`} />
        </dl>
      </header>
      <div className="-mt-3 mb-5">
        <MailAccount account={account} biz={biz} />
      </div>

      <DotGrid className="py-2">
        <ol>
          {lead && (
            <Tier n={leadStep} role="팀장" title={AGENT_KIND_LABEL[lead.a.kind]} last={counterparts.length + rest.length === 0}>
              <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                {/* 칸은 제 높이로 — 카드의 h-full 이 목표 · 방향의 높이까지 늘지 않게 한 겹 싼다 */}
                <div><AgentCard agent={lead.a} headline={lead.h} /></div>
                <AgentDirections leadId={lead.a.id} directions={team.directions} clamp />
              </div>
              {/* 팀장과 실무자가 서로 채우는 두 갈래 — 목표 · 방향은 내려가고, 실무자의 대화 · 할 일은 올라간다 */}
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-tiny font-bold text-slate-500">
                <span><span aria-hidden className="text-brand-600">↓ </span>목표 · 방향</span>
                <span><span aria-hidden className="text-brand-600">↑ </span>대화 · 할 일</span>
              </p>
            </Tier>
          )}
          {counterparts.length > 0 && (
            <Tier
              n={deptStep}
              role="실무자"
              title={DEPT[biz]}
              meta={(
                <>
                  <span className={`${TEXT.meta} tabular-nums`}>{counterparts.length}곳</span>
                  {dept.counts.length > 0 && <HeadlineCounts headline={dept} />}
                </>
              )}
              last={rest.length === 0}
            >
              <div className={grid}>
                {counterparts.map((r) => <AgentCard key={r.a.id} agent={r.a} headline={r.h} />)}
              </div>
            </Tier>
          )}
          {rest.map((r, i) => (
            <Tier key={r.a.id} n={deptStep + i + 1} role="실무자" title={AGENT_KIND_LABEL[r.a.kind]} last={i === rest.length - 1}>
              <div className={grid}>
                <AgentCard agent={r.a} headline={r.h} />
              </div>
            </Tier>
          ))}
        </ol>
      </DotGrid>

      {/* 팀 밑 — 이번 달 · 지난달 담당별 답과 비용(어림), 이번 달 토큰 */}
      <AgentUsage usage={usage} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={TEXT.meta}>{label}</dt>
      <dd className="text-h2 font-black tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

/**
 * 층 하나 — 왼쪽 줄기에 번호 마디가 서고(11-02 그림의 ① ② ③), 그 오른쪽에 자리(팀장 · 실무자) · 이름 · 셈, 밑에 칸들.
 * 줄기는 마디 밑에서 다음 층의 마디까지 내려간다 — 마지막 층에서 끝난다.
 */
function Tier({ n, role, title, meta, last, children }: {
  n: number; role: string; title: string; meta?: ReactNode; last: boolean; children: ReactNode;
}) {
  return (
    <li className={`relative pl-11 ${last ? '' : 'pb-8'}`}>
      {!last && <span aria-hidden className={`absolute bottom-0 left-[13.5px] top-7 w-px ${TEAM_LINE}`} />}
      <span
        aria-hidden
        className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-brand-400 bg-white text-small font-black tabular-nums text-brand-700"
      >
        {n}
      </span>
      <div className="mb-3 flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-small font-black text-brand-700">{role}</span>
        <h2 className="text-lead font-black text-slate-900">{title}</h2>
        {meta}
      </div>
      {children}
    </li>
  );
}

/**
 * 담당 한 사람의 칸 — 누르면 그 담당과의 대화. 이름 줄에는 이름만(다섯 칸 폭에서 「현대엔지니어링 …」이 잘리지 않게), 맡은 일은
 * 그 밑 — 운영사 · 사업자 담당은 층 이름이 이미 말해 칸마다 되풀이하지 않는다.
 */
function AgentCard({ agent: a, headline }: { agent: AgentSummary; headline: AgentHeadline }) {
  const led = ledOf({ lateTasks: a.lateTasks, duties: a.duties, headline });
  const live = isLive(a.last?.at);
  return (
    <Link
      href={`${BIZ_AGENTS[a.biz]}/${a.id}`}
      className="block h-full rounded-box border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-[0_12px_28px_-18px_rgb(var(--brand-700)/0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      <div className="flex min-h-[38px] items-center gap-2.5">
        <AgentMark tone={led.tone} live={live} label={`${led.label}${live ? ' · 최근 24시간 대화' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="break-keep text-lead font-black text-slate-900">{a.name}</p>
          {!isCounterpart(a.kind) && <p className={`break-keep ${TEXT.meta}`}>{roleLineOf(a)}</p>}
        </div>
      </div>
      {headline.counts.length > 0 && <div className="mt-2.5"><HeadlineCounts headline={headline} /></div>}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-slate-100 pt-2.5">
        <Activity cells={a.activity} />
        <span className={`${TEXT.meta} tabular-nums`}>업무 {a.duties} · 할 일 {a.openTasks}</span>
        {a.duties === 0 && <Tag tone="warn">업무 정의 미지정</Tag>}
        {a.lateTasks > 0 && <Tag tone="stop">기한 지남 {a.lateTasks}</Tag>}
        {a.pendingMails > 0 && <Tag tone="warn">승인 대기 메일 {a.pendingMails}</Tag>}
        <span className={`ml-auto ${TEXT.meta} tabular-nums`}>{a.last ? a.last.at.slice(5) : '—'}</span>
      </div>
    </Link>
  );
}

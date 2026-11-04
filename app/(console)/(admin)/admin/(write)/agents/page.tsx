import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { headlineOf, siteLinesOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';
import { OVERDUE_DAYS } from '@/lib/todo-types';
import type { AgentHeadline, AgentSummary } from '@/types/agents';
import { Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { Activity, AgentMark, DotGrid, ORG_LINE, OrgNode, Twig } from '@/components/agents/kit';
import { MailAccount } from '@/components/agents/MailAccount';
import { AgentUsage } from '@/components/agents/AgentUsage';
import { isLive, ledOf, roleLineOf } from '@/components/agents/status';

export const metadata = { title: 'AI에이전트' };
export const dynamic = 'force-dynamic';

/**
 * 에이전트 현황 [한백 관리자] — ★조직도★ (한백 지시 2026-11-01 「나의 에이전트 현황을 다 보고싶어」 · 11-02 「futurist 하게」 ·
 * 「워크트리보다 조직도 같은 개념」 · 「검정 배경은 지워줘. 기존 디자인컴포넌트의 틀은 맞추되, AI에이전트의 느낌은 지우지마」 ·
 * 「정산담당이 열린구매까지 같이하는거야. 그리고 전략이 최우선이고 그 이후에 운영사 담당자들이야」).
 *
 * 맨 위가 한백, 그 바로 밑에 전략·기획(최우선), 그 밑에 운영사 담당(다섯이 한 줄로 매달린다)과 정산(기성 · 지급 · 열린구매)이
 * 나란히 선다 — 한백이 그림 셋 중에 고른 모양이다. 칸마다 담당 표지의 등이 상태다(components/agents/status) — 맡은 범위의
 * 셈(콘솔이 지금 셈한 것, lib/agents/brief headlineOf) · 최근 이레의 활동 칸 · 업무 정의 · 열린 할 일. 누르면 그 담당과의
 * 대화(/admin/agents/[id]). 가로로 서려면 넓어야 해서 xl 아래에서는 같은 조직을 세로로 펼친다. 모양은 components/agents/kit.
 */
export default async function AgentsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/admin/agents');
  const actor = actorOf(session);
  const repo = getRepository();
  const [agents, data, account, usage] = await Promise.all([
    repo.listAgents(actor), loadScope(actor), repo.getMailAccount(actor), repo.agentUsage(actor),
  ]);
  const rows = agents.map((a) => ({ a, h: headlineOf(a, data) }));
  const operators = rows.filter((r) => r.a.kind === 'operator');
  const strategy = rows.find((r) => r.a.kind === 'strategy') ?? null;
  const settlement = rows.find((r) => r.a.kind === 'settlement') ?? null;
  const open = agents.reduce((n, a) => n + a.openTasks, 0);
  const saidToday = agents.reduce((n, a) => n + (a.activity[a.activity.length - 1]?.n ?? 0), 0);
  const usdToday = agents.reduce((n, a) => n + a.usdToday, 0);

  /* 운영사 담당 부서의 셈 — 다섯 운영사의 진행 중 현장을 합친다(칸과 같은 판정, lib/agents/brief siteLinesOf) */
  const sites = operators.flatMap((r) => (r.a.cpo ? siteLinesOf(data.projects, r.a.cpo).live : []));
  const mine = sites.filter((s) => s.turn === '한백').length;
  const stuck = sites.filter((s) => s.stalledDays >= OVERDUE_DAYS).length;
  const dept: AgentHeadline = {
    counts: [
      { label: '진행 중', value: `${sites.length}곳` },
      { label: '한백 차례', value: `${mine}`, ...(mine ? { tone: 'warn' as const } : {}) },
      { label: `${OVERDUE_DAYS}일+ 정체`, value: `${stuck}`, ...(stuck ? { tone: 'warn' as const } : {}) },
    ],
  };

  /* 좁은 화면에서 운영사 담당 밑에 매달리는 다섯 */
  const operatorList = (
    <ul className="ml-3">
      {operators.map((r, i) => (
        <Twig key={r.a.id} last={i === operators.length - 1}>
          <div className="pb-2"><AgentCard agent={r.a} headline={r.h} /></div>
        </Twig>
      ))}
    </ul>
  );

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-small font-bold text-brand-700">AI 담당 조직도</p>
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
        <MailAccount account={account} />
      </div>

      {/*
        넓은 화면 — 한백 → 전략·기획 → (운영사 담당 · 정산), 운영사 다섯은 한 줄 아래.
        운영사 다섯을 부서 칸 밑에 세로로 매달면 칸이 좁아 이름이 잘렸다(1280px 에서 「현대엔지니어링 …」) — 그래서 다섯 칸으로
        한 줄을 다 쓴다. 운영사 담당 칸의 가운데(두 칸 중 첫 칸 = 25%)에서 선이 내려와 그 줄의 가로선에 닿는다.
      */}
      <DotGrid className="hidden py-2 xl:block">
        <div className="flex flex-col items-center">
          <Hub agents={agents.length} />
          <span aria-hidden className={`h-8 w-px ${ORG_LINE}`} />
          {strategy && (
            <div className="relative w-full max-w-[360px]">
              <OrgNode className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2" />
              <AgentCard agent={strategy.a} headline={strategy.h} />
            </div>
          )}
        </div>
        <OrgRow>
          {[
            <div key="operators" className="mx-auto flex h-full w-full max-w-[340px] flex-col">
              <Dept title="운영사 담당" count={operators.length} headline={dept} />
              <span aria-hidden className={`mx-auto min-h-0 w-px flex-1 ${ORG_LINE}`} />
            </div>,
            ...(settlement
              ? [<div key="settlement" className="mx-auto w-full max-w-[340px]"><AgentCard agent={settlement.a} headline={settlement.h} /></div>]
              : []),
          ]}
        </OrgRow>
        <div className="relative">
          <span aria-hidden className={`absolute left-1/4 top-0 h-8 w-px ${ORG_LINE}`} />
          <div className="pt-8">
            <OrgRow>{operators.map((r) => <AgentCard key={r.a.id} agent={r.a} headline={r.h} />)}</OrgRow>
          </div>
        </div>
      </DotGrid>

      {/* 좁은 화면 — 같은 조직을 세로로: 한백 밑에 전략·기획, 그 밑에 운영사 담당(다섯)과 정산 */}
      <DotGrid className="xl:hidden">
        <Hub agents={agents.length} compact />
        <ul>
          <Twig last>
            {strategy && <div className="pb-2"><AgentCard agent={strategy.a} headline={strategy.h} /></div>}
            {/* 전략·기획 칸 표지의 가운데(칸 왼쪽 + 28px) 밑으로 레일이 내려간다 */}
            <ul className="-mt-2 ml-4">
              <Twig last={!settlement} node={<span aria-hidden className="block h-3 w-3 rotate-45 border-2 border-brand-400 bg-brand-50" />}>
                <div className="flex min-h-[62px] items-center">
                  <Dept title="운영사 담당" count={operators.length} headline={dept} compact />
                </div>
                {operatorList}
              </Twig>
              {settlement && (
                <Twig last>
                  <div className="pb-2"><AgentCard agent={settlement.a} headline={settlement.h} /></div>
                </Twig>
              )}
            </ul>
          </Twig>
        </ul>
      </DotGrid>

      {/* 조직도 밑 — 이번 달 · 지난달 담당별 답과 비용(어림), 이번 달 토큰 */}
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

/** 맨 위 — 한백. 좁은 화면에서는 세로 레일(12px)이 로고 가운데에서 내려간다 */
function Hub({ agents, compact = false }: { agents: number; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2.5">
        <Image src="/logo.png" alt="" width={24} height={24} className="flex-none" />
        <span className="text-lead font-black text-slate-900">한백</span>
        <span className={TEXT.meta}>관리자 · 에이전트 {agents}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-box border border-brand-300 bg-white px-6 py-3 shadow-[0_14px_34px_-20px_rgba(49,106,64,0.6)]">
      <Image src="/logo.png" alt="" width={36} height={36} className="flex-none" />
      <div>
        <p className="text-h2 font-black text-slate-900">한백</p>
        <p className={TEXT.meta}>관리자 · 에이전트 {agents}</p>
      </div>
    </div>
  );
}

/**
 * 한 줄로 선 부서들 — 위 가로선은 첫 칸 가운데부터 끝 칸 가운데까지, 칸마다 가운데로 세로선이 내려가 마디에서 칸에 닿는다.
 * 칸 폭이 같아서 가로선의 가운데가 곧 한백의 세로선이 닿는 자리다.
 */
function OrgRow({ children }: { children: ReactNode[] }) {
  return (
    <div className="flex">
      {children.map((child, i) => (
        <div key={i} className="relative flex min-w-0 flex-1 flex-col px-2 pt-8">
          {i > 0 && <span aria-hidden className={`absolute left-0 right-1/2 top-0 h-px ${ORG_LINE}`} />}
          {i < children.length - 1 && <span aria-hidden className={`absolute left-1/2 right-0 top-0 h-px ${ORG_LINE}`} />}
          <span aria-hidden className={`absolute left-1/2 top-0 h-8 w-px ${ORG_LINE}`} />
          <OrgNode className="absolute left-1/2 top-8 z-10 -translate-x-1/2 -translate-y-1/2" />
          {child}
        </div>
      ))}
    </div>
  );
}

/** 부서 칸 — 운영사 담당. 누르는 칸이 아니다(사람이 아니라 묶음이다 — 그래서 점선) — 밑에 매달린 다섯이 누르는 칸이다 */
function Dept({ title, count, headline, compact = false }: { title: string; count: number; headline: AgentHeadline; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-lead font-black text-slate-900">{title}</span>
        <span className={TEXT.meta}>{count}곳</span>
        <HeadlineCounts headline={headline} />
      </div>
    );
  }
  return (
    <div className="rounded-box border border-dashed border-brand-300 bg-brand-50/80 px-3 py-2.5 text-center">
      <p className="text-lead font-black text-slate-900">{title}</p>
      <p className={TEXT.meta}>운영사 {count}곳</p>
      <div className="mt-1.5 flex justify-center"><HeadlineCounts headline={headline} /></div>
    </div>
  );
}

/**
 * 담당 한 사람의 칸 — 누르면 그 담당과의 대화. 첫 줄(표지 · 이름 · 맡은 일)은 높이 38px 를 지킨다 — 좁은 화면의 마디(kit Twig)가
 * 그 가운데에 닿는다.
 */
function AgentCard({ agent: a, headline }: { agent: AgentSummary; headline: AgentHeadline }) {
  const led = ledOf({ lateTasks: a.lateTasks, duties: a.duties, headline });
  const live = isLive(a.last?.at);
  return (
    <Link
      href={`/admin/agents/${a.id}`}
      className="block h-full rounded-box border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-[0_12px_28px_-18px_rgba(49,106,64,0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      {/* 이름 줄에는 이름만 — 다섯 칸 폭(1280px)에서 「현대엔지니어링 …」으로 잘렸다. 마지막 대화 시각은 아래 줄 끝 */}
      <div className="flex min-h-[38px] items-center gap-2.5">
        <AgentMark tone={led.tone} live={live} label={`${led.label}${live ? ' · 최근 24시간 대화' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="break-keep text-lead font-black text-slate-900">{a.name}</p>
          {/* 운영사 담당은 부서 칸이 이미 말한다 — 다섯 번 되풀이하지 않는다 */}
          {a.kind !== 'operator' && <p className={TEXT.meta}>{roleLineOf(a)}</p>}
        </div>
      </div>
      <div className="mt-2.5"><HeadlineCounts headline={headline} /></div>
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

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { loadAgentSide } from '@/lib/agents/scope';
import { BIZ_AGENTS, type Biz } from '@/lib/biz';
import { isCounterpart, type AgentHeadline, type AgentSummary } from '@/types/agents';
import { Tag, TEXT } from '@/components/ui';
import { HeadlineCounts } from '@/components/agents/HeadlineCounts';
import { Activity, AgentMark, DotGrid, ORG_LINE, OrgNode, Twig } from '@/components/agents/kit';
import { MailAccount } from '@/components/agents/MailAccount';
import { AgentUsage } from '@/components/agents/AgentUsage';
import { isLive, ledOf, roleLineOf } from '@/components/agents/status';

/** 부서 칸의 이름 — 상대 회사를 하나씩 맡는 담당들의 묶음 */
const DEPT: Record<Biz, { title: string; unit: string }> = {
  ev: { title: '운영사 담당', unit: '운영사' },
  solar: { title: '사업자 담당', unit: '사업자' },
};

/**
 * 에이전트 현황 [한백 관리자] — ★조직도★ (한백 지시 2026-11-01 「나의 에이전트 현황을 다 보고싶어」 · 11-02 「futurist 하게」 ·
 * 「워크트리보다 조직도 같은 개념」 · 「검정 배경은 지워줘. 기존 디자인컴포넌트의 틀은 맞추되, AI에이전트의 느낌은 지우지마」 ·
 * 「정산담당이 열린구매까지 같이하는거야. 그리고 전략이 최우선이고 그 이후에 운영사 담당자들이야」).
 *
 * ★사업마다 따로다★ (2026-11-04 「태양광도 AI 에이전트 붙여줘. 운영사 담당자가 아니라 사업자 담당자 … 나머지는 동일하게」 —
 * migrations/0118). 전기차 /admin/agents 는 운영사 담당 다섯, 태양광 /solar/agents 는 사업자 담당 셋(타이런트아이 · 에이치에너지 ·
 * 루모라)이고 나머지 모양은 같다 — 그래서 한 부품이다.
 *
 * 맨 위가 한백, 그 바로 밑에 전략·기획(최우선), 그 밑에서 갈래가 부서(운영사 · 사업자 담당 — 맡은 회사마다 한 칸이 한 줄로
 * 매달린다)와 정산(기성 · 지급 · 열린구매)으로 나뉜다 — 한백이 그림 셋 중에 고른 모양이다(2026-11-02). 정산은 부서 줄의 오른쪽
 * 끝에 선다(2026-11-04 「선 겹침 바로잡기」 — 가운데 줄에 떠 있으면 부서 칸들을 잇는 선이 그 밑을 지났다). 칸마다 담당 표지의
 * 등이 상태다(components/agents/status) — 맡은 범위의 셈(콘솔이 지금 셈한 것, lib/agents/scope loadAgentSide) · 최근 이레의 활동
 * 칸 · 업무 정의 · 열린 할 일. 누르면 그 담당과의 대화(그 사업의 조직도 밑 /[id]). 가로로 서려면 넓어야 해서 xl 아래에서는 같은
 * 조직을 세로로 펼친다. 모양은 components/agents/kit.
 */
export async function AgentsOrg({ biz }: { biz: Biz }) {
  const home = BIZ_AGENTS[biz];
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=${home}`);
  const actor = actorOf(session);
  const repo = getRepository();
  const [agents, side, account, usage] = await Promise.all([
    repo.listAgents(actor, biz), loadAgentSide(biz, actor), repo.getMailAccount(actor, biz), repo.agentUsage(actor, biz),
  ]);
  const rows = agents.map((a) => ({ a, h: side.headline(a) }));
  const counterparts = rows.filter((r) => isCounterpart(r.a.kind));
  const strategy = rows.find((r) => r.a.kind === 'strategy') ?? null;
  const settlement = rows.find((r) => r.a.kind === 'settlement') ?? null;
  const open = agents.reduce((n, a) => n + a.openTasks, 0);
  const saidToday = agents.reduce((n, a) => n + (a.activity[a.activity.length - 1]?.n ?? 0), 0);
  const usdToday = agents.reduce((n, a) => n + a.usdToday, 0);
  const dept = side.dept(counterparts.map((r) => r.a));
  const { title: deptTitle, unit } = DEPT[biz];

  /*
   * 넓은 화면의 맨 아래 줄 — 부서의 칸(n)과 그 오른쪽 끝의 정산 한 칸. 칸 폭이 같다. 칸 수가 사업마다 달라(전기차 다섯 ·
   * 태양광 셋) 줄 · 칸 폭 · 갈래선의 자리를 수로 잡는다: 부서 칸의 가운데는 (n/2)/(n+1), 정산 칸의 가운데는 끝에서 (1/2)/(n+1).
   */
  const n = Math.max(counterparts.length, 1);
  const cols = n + 1;
  const pct = (v: number) => `${((v / cols) * 100).toFixed(4)}%`;

  /* 좁은 화면에서 부서 밑에 매달리는 칸들 */
  const counterpartList = (
    <ul className="ml-3">
      {counterparts.map((r, i) => (
        <Twig key={r.a.id} last={i === counterparts.length - 1}>
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
        <MailAccount account={account} biz={biz} />
      </div>

      {/*
        넓은 화면 — 한백 → 전략·기획 → 갈래 둘: 부서(밑에 맡은 회사마다 한 칸이 한 줄) · 정산. 맨 아래 줄은 부서의 칸들과
        그 오른쪽 끝의 정산이다(칸 폭이 같다).
        ★정산은 부서 줄의 오른쪽 끝이다★ (한백 2026-11-04 「선 겹침 바로잡기」) — 전에는 정산이 운영사 담당 옆 가운데 줄에
        서 있어, 다섯을 잇는 가로선이 정산 밑을 지나 플러그링크 · 에버온이 정산 밑에 달린 것처럼 보였다. 이제 정산은 갈래선에서
        곧장 제 칸으로 내려가고, 부서 칸들을 잇는 선은 마지막 회사에서 끝난다 — 두 선이 겹치지 않는다.
        부서 칸들을 부서 밑에 세로로 매달면 칸이 좁아 이름이 잘렸다(1280px 에서 「현대엔지니어링 …」) — 그래서 한 줄이다.
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
          <span aria-hidden className={`h-6 w-px ${ORG_LINE}`} />
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {/* 갈래선 — 부서의 가운데부터 정산의 가운데까지. 전략·기획의 세로선(1/2)이 그 사이에 닿는다 */}
          <span
            aria-hidden
            className={`absolute top-0 h-px ${ORG_LINE}`}
            style={{ left: pct(n / 2), right: pct(1 / 2) }}
          />
          <div className="relative flex flex-col items-center px-2 pt-8" style={{ gridColumn: `span ${n} / span ${n}` }}>
            <span aria-hidden className={`absolute left-1/2 top-0 h-8 w-px ${ORG_LINE}`} />
            <OrgNode className="absolute left-1/2 top-8 z-10 -translate-x-1/2 -translate-y-1/2" />
            <div className="w-full max-w-[340px]"><Dept title={deptTitle} unit={unit} count={counterparts.length} headline={dept} /></div>
            {/* 부서 칸들을 잇는 가로선(아래 OrgRow 의 윗변)까지 */}
            <span aria-hidden className={`h-8 w-px ${ORG_LINE}`} />
          </div>
          {/* 정산의 칸 — 정산으로 내려가는 선이 부서 칸 옆을 지난다 */}
          <div className="relative">
            {settlement && <span aria-hidden className={`absolute bottom-0 left-1/2 top-0 w-px ${ORG_LINE}`} />}
          </div>
          {/* flex — 한 줄에 선 정산 칸과 높이를 맞춘다(칸이 줄 높이까지 늘어난다) */}
          <div className="flex" style={{ gridColumn: `span ${n} / span ${n}` }}>
            <OrgRow>{counterparts.map((r) => <AgentCard key={r.a.id} agent={r.a} headline={r.h} />)}</OrgRow>
          </div>
          {settlement && (
            <div className="relative flex min-w-0 flex-col px-2 pt-8">
              <span aria-hidden className={`absolute left-1/2 top-0 h-8 w-px ${ORG_LINE}`} />
              <OrgNode className="absolute left-1/2 top-8 z-10 -translate-x-1/2 -translate-y-1/2" />
              <AgentCard agent={settlement.a} headline={settlement.h} />
            </div>
          )}
        </div>
      </DotGrid>

      {/* 좁은 화면 — 같은 조직을 세로로: 한백 밑에 전략·기획, 그 밑에 부서(맡은 회사들)와 정산 */}
      <DotGrid className="xl:hidden">
        <Hub agents={agents.length} compact />
        <ul>
          <Twig last>
            {strategy && <div className="pb-2"><AgentCard agent={strategy.a} headline={strategy.h} /></div>}
            {/* 전략·기획 칸 표지의 가운데(칸 왼쪽 + 28px) 밑으로 레일이 내려간다 */}
            <ul className="-mt-2 ml-4">
              <Twig last={!settlement} node={<span aria-hidden className="block h-3 w-3 rotate-45 border-2 border-brand-400 bg-brand-50" />}>
                <div className="flex min-h-[62px] items-center">
                  <Dept title={deptTitle} unit={unit} count={counterparts.length} headline={dept} compact />
                </div>
                {counterpartList}
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

/** 맨 위 — 한백. 좁은 화면에서는 세로 레일(12px)이 로고 가운데에서 내려간다. 그림자는 사업 색이다(태양광에서 초록이 비치지 않게) */
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
    <div className="flex items-center gap-3 rounded-box border border-brand-300 bg-white px-6 py-3 shadow-[0_14px_34px_-20px_rgb(var(--brand-700)/0.6)]">
      <Image src="/logo.png" alt="" width={36} height={36} className="flex-none" />
      <div>
        <p className="text-h2 font-black text-slate-900">한백</p>
        <p className={TEXT.meta}>관리자 · 에이전트 {agents}</p>
      </div>
    </div>
  );
}

/**
 * 한 줄로 선 칸들 — 위 가로선은 첫 칸 가운데부터 끝 칸 가운데까지, 칸마다 가운데로 세로선이 내려가 마디에서 칸에 닿는다.
 * 칸 폭이 같아서 가로선의 가운데가 곧 부서의 세로선이 닿는 자리다.
 */
function OrgRow({ children }: { children: ReactNode[] }) {
  return (
    <div className="flex w-full">
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

/**
 * 부서 칸 — 운영사 담당 · 사업자 담당. 누르는 칸이 아니다(사람이 아니라 묶음이다 — 그래서 점선) — 밑에 매달린 칸들이 누르는
 * 칸이다. 셀 것이 없으면(태양광 — 현장에 사업자가 안 적힌다) 셈 줄을 비운다.
 */
function Dept({ title, unit, count, headline, compact = false }: {
  title: string; unit: string; count: number; headline: AgentHeadline; compact?: boolean;
}) {
  const counted = headline.counts.length > 0;
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-lead font-black text-slate-900">{title}</span>
        <span className={TEXT.meta}>{count}곳</span>
        {counted && <HeadlineCounts headline={headline} />}
      </div>
    );
  }
  return (
    <div className="rounded-box border border-dashed border-brand-300 bg-brand-50/80 px-3 py-2.5 text-center">
      <p className="text-lead font-black text-slate-900">{title}</p>
      <p className={TEXT.meta}>{unit} {count}곳</p>
      {counted && <div className="mt-1.5 flex justify-center"><HeadlineCounts headline={headline} /></div>}
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
      href={`${BIZ_AGENTS[a.biz]}/${a.id}`}
      className="block h-full rounded-box border border-slate-200 bg-white p-3 transition hover:border-brand-300 hover:shadow-[0_12px_28px_-18px_rgb(var(--brand-700)/0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      {/* 이름 줄에는 이름만 — 다섯 칸 폭(1280px)에서 「현대엔지니어링 …」으로 잘렸다. 마지막 대화 시각은 아래 줄 끝 */}
      <div className="flex min-h-[38px] items-center gap-2.5">
        <AgentMark tone={led.tone} live={live} label={`${led.label}${live ? ' · 최근 24시간 대화' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="break-keep text-lead font-black text-slate-900">{a.name}</p>
          {/* 운영사 · 사업자 담당은 부서 칸이 이미 말한다 — 칸마다 되풀이하지 않는다 */}
          {!isCounterpart(a.kind) && <p className={TEXT.meta}>{roleLineOf(a)}</p>}
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

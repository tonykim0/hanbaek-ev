/**
 * 에이전트가 읽을 재료를 모은다 (서버 전용) — 할 일 조립(lib/todos)과 같은 읽기를 한 번 하고, 담당마다 나눠 읽는다.
 *
 * ★저장하지 않는다★ — 부를 때마다 콘솔의 정본을 읽는다. 에이전트가 보는 것과 보드·명세서가 보여주는 것이 늘 같다
 * (dual-write 금지). 현황 화면은 일곱 카드의 한 줄을 이 한 번의 읽기로 같이 만든다.
 */
import { getRepository } from '@/lib/data';
import { solarSiteStore } from '@/lib/data/solar-sites';
import { loadPartnerLines } from '@/lib/partner-lines';
import { batchesOf, batchKey } from '@/lib/payout-board';
import { receivableTodos } from '@/lib/todo-receivables';
import { today } from '@/lib/date';
import { OVERDUE_DAYS } from '@/lib/todo-types';
import type { Biz } from '@/lib/biz';
import type { Actor } from '@/lib/auth/types';
import type { Agent, AgentHeadline } from '@/types/agents';
import { agitFromOf, briefOf, headlineOf, siteLinesOf, type BatchLine, type ScopeData } from './brief';
import { solarBriefOf, solarHeadlineOf, type SolarScopeData } from './solar-brief';

/** 조직도 · 담당 화면이 읽는 셈 — 사업마다 재료가 달라(전기차 현장 · 지급 · 기성 / 태양광 상담 현장) 한 모양으로 감싼다 */
export interface AgentSide {
  today: string;
  /** 카드 · 머리말의 한 줄 */
  headline(agent: Agent): AgentHeadline;
  /** 조직도의 부서 칸(운영사 담당 · 사업자 담당)의 한 줄 */
  dept(counterparts: Agent[]): AgentHeadline;
}

export async function loadAgentSide(biz: Biz, actor: Actor): Promise<AgentSide> {
  if (biz === 'solar') {
    const data = await loadSolarScope(actor);
    /* 사업자 담당 부서는 셀 것이 없다 — 현장이 어느 사업자의 것인지 콘솔이 모른다(lib/agents/solar-brief) */
    return { today: data.today, headline: (a) => solarHeadlineOf(a, data), dept: () => ({ counts: [] }) };
  }
  const data = await loadScope(actor);
  return {
    today: data.today,
    headline: (a) => headlineOf(a, data),
    /* 운영사 담당 부서의 셈 — 다섯 운영사의 진행 중 현장을 합친다(칸과 같은 판정, lib/agents/brief siteLinesOf) */
    dept: (counterparts) => {
      const sites = counterparts.flatMap((a) => (a.kind === 'operator' && a.cpo ? siteLinesOf(data.projects, a.cpo).live : []));
      const mine = sites.filter((s) => s.turn === '한백').length;
      const stuck = sites.filter((s) => s.stalledDays >= OVERDUE_DAYS).length;
      return {
        counts: [
          { label: '진행 중', value: `${sites.length}곳` },
          { label: '한백 차례', value: `${mine}`, ...(mine ? { tone: 'warn' as const } : {}) },
          { label: `${OVERDUE_DAYS}일+ 정체`, value: `${stuck}`, ...(stuck ? { tone: 'warn' as const } : {}) },
        ],
      };
    },
  };
}

/**
 * 담당 하나가 답할 때 읽는 것 — 오늘 · 자료 한 덩이 · 에이전트가 짚은 관리번호 → 현장 id(전기차만 — 할 일의 현장 칸은 전기차
 * 현장이다). 정산 담당(전기차)은 열린구매 글에 쓸 지급처 사업자 · 계좌까지 읽는다.
 */
export async function loadAgentBrief(agent: Agent, actor: Actor): Promise<{ today: string; brief: string; siteOf(ref: string): string | null }> {
  if (agent.biz === 'solar') {
    const data = await loadSolarScope(actor);
    return { today: data.today, brief: solarBriefOf(agent, data), siteOf: () => null };
  }
  const data = await loadScope(actor, agent.kind === 'settlement');
  const sites = new Map<string, string>();
  for (const p of data.projects) {
    sites.set(p.id.toUpperCase(), p.id);
    if (p.mgmtNo) sites.set(p.mgmtNo.toUpperCase(), p.id);
  }
  return { today: data.today, brief: briefOf(agent, data), siteOf: (ref) => sites.get(ref.trim().toUpperCase()) ?? null };
}

/**
 * 태양광 담당이 읽을 재료 — 상담 접수한 현장(현장관리와 같은 정본, 한백 관리자는 전부). 태양광에는 아직 운영사 · 단가 · 기성 ·
 * 지급이 없어 이것뿐이다(lib/agents/solar-brief).
 */
export async function loadSolarScope(actor: Actor): Promise<SolarScopeData> {
  return { today: today(), sites: await solarSiteStore.list(actor) };
}

/**
 * @param withPayees 정산 담당이 열린구매 글에 쓸 지급처 사업자·계좌 · 붙일 자료가 있는지 · 배치의 현장 몫까지 — 그 담당을
 *                   부를 때만 읽는다
 */
export async function loadScope(actor: Actor, withPayees = false): Promise<ScopeData> {
  const repo = getRepository();
  const [{ projects, history, settlements }, finals, invoices] = await Promise.all([
    repo.listTodoSources({ role: actor.role, org: actor.org }),
    repo.listBatchFinals(actor),
    repo.listTaxInvoices(actor),
  ]);
  /* 멈춘 현장의 기성은 누구 차례도 아니다 — 할 일 조립(lib/todos)과 같은 판정 */
  const held = new Set(projects.filter((p) => p.holdState).map((p) => p.id));
  const data: ScopeData = {
    today: today(),
    projects,
    batches: batchesOf(history, finals, invoices),
    receivables: receivableTodos(settlements.filter((s) => !held.has(s.id))),
  };
  if (!withPayees) return data;

  /* 지급처의 사업자 · 계좌 — 아지트 열린구매 글(lib/agit)과 같은 읽기 */
  const partners = await loadPartnerLines();
  const noOf = new Map(projects.map((p) => [p.id, p.mgmtNo ?? p.id]));
  const lines = new Map<string, BatchLine[]>();
  for (const r of history) {
    const key = batchKey(r.paidAt, r.org, r.kind);
    const line = { no: noOf.get(r.projectId) ?? r.projectId, projectName: r.projectName, label: r.label, amount: r.amount };
    lines.set(key, [...(lines.get(key) ?? []), line]);
  }
  /* 아지트 계정 · 글 — 올렸는지 · 금액을 지난 대화가 아니라 지금 콘솔로 말하게(lib/agents/brief agitLines) */
  const from = agitFromOf(data.today);
  const agit = { account: await repo.getAgitHook(actor), posts: await repo.recentAgitPosts(actor, from), from };
  return { ...data, partners, batchLines: lines, agit };
}

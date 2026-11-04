/**
 * 태양광 담당이 읽을 자료 (순수) — 전기차의 lib/agents/brief 와 같은 자리다(한백 지시 2026-11-04 「태양광도 AI 에이전트 붙여줘」).
 *
 * 태양광 콘솔에 있는 것은 아직 상담 접수한 현장뿐이다(lib/data/solar-sites) — 운영사 · 단가 · 기성 · 지급이 없다. 그래서
 *   전략·기획   상담 접수 흐름(달마다 · 지붕형/지상형 · 담당 협력사)
 *   사업자 담당  현장 목록 — ★현장에 사업자가 아직 안 적힌다★: 어느 현장이 그 사업자의 것인지 콘솔은 모른다. 전체 목록을 주고
 *               그렇다고 밝힌다(대화 · 업무 정의 · 넘긴 파일로 안다 — 모르면 묻는다)
 *   정산        「태양광의 기성 · 지급 기록이 콘솔에 없다」 — 한백이 대화로 주는 것과 넘긴 파일로 일한다
 * 저장하지 않는다 — 부를 때마다 현장관리와 같은 정본을 읽는다(lib/agents/scope loadSolarScope).
 */
import { dayOf } from '@/lib/date';
import { SITE_KIND_LABEL, type SolarSite } from '@/lib/solar/sites';
import type { Agent, AgentHeadline } from '@/types/agents';

export interface SolarScopeData {
  today: string;
  /** 상담 접수한 태양광 현장 — 최근 접수부터(저장소의 순서) */
  sites: SolarSite[];
}

/** 한 번에 싣는 현장 — 넘으면 최근 것부터 이만큼과 남은 수 */
export const SOLAR_SITE_LIMIT = 120;
/** 상담 메모는 앞부분만 — 긴 메모가 자료를 덮지 않게 */
const MEMO_CHARS = 80;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function siteLine(s: SolarSite): string {
  const memo = s.memo ? oneLine(s.memo) : '';
  return [
    `- ${s.id} ${s.name}`,
    s.address,
    SITE_KIND_LABEL[s.kind] ?? s.kind,
    `담당 협력사 ${s.org ?? '미지정'}`,
    `접수 ${dayOf(new Date(s.createdAt))}`,
    `파일 ${s.files.length}`,
    ...(memo ? [`메모 ${memo.length > MEMO_CHARS ? `${memo.slice(0, MEMO_CHARS)}…` : memo}`] : []),
  ].join(' | ');
}

/** 상담 접수 흐름 — 달마다 · 형태 · 담당 협력사 */
function flowOf(sites: SolarSite[]) {
  const months = new Map<string, number>();
  const kinds = new Map<string, number>();
  const orgs = new Map<string, number>();
  for (const s of sites) {
    const m = dayOf(new Date(s.createdAt)).slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + 1);
    const k = SITE_KIND_LABEL[s.kind] ?? s.kind;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    const o = s.org ?? '미지정';
    orgs.set(o, (orgs.get(o) ?? 0) + 1);
  }
  return { months, kinds, orgs };
}

const counted = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
  .map(([k, n]) => `${k} ${n}곳`).join(' · ') || '없음';

function sitesBrief(data: SolarScopeData, company: string | null): string {
  const shown = data.sites.slice(0, SOLAR_SITE_LIMIT);
  const rest = data.sites.length - shown.length;
  return [
    `[태양광 현장 — ${data.today} 콘솔 기준 · 상담 접수한 현장 전체 ${data.sites.length}곳]`,
    `현장에는 아직 사업자가 적히지 않는다 — 이 목록은 전체 현장이다. 그중 ${company ?? '이 사업자'}의 현장은 대화 · 업무 정의 · `
      + '넘긴 파일로 안다. 모르면 어느 현장인지 묻는다.',
    '번호 | 현장 | 주소 | 형태 | 담당 협력사 | 접수일 | 파일 수 | 상담 메모',
    ...(shown.length ? shown.map(siteLine) : ['- 없음']),
    ...(rest > 0 ? [`… 그 밖에 ${rest}곳(오래된 접수)`] : []),
  ].join('\n');
}

function strategyBrief(data: SolarScopeData): string {
  const { months, kinds, orgs } = flowOf(data.sites);
  const recent = [...months.keys()].sort().slice(-12);
  return [
    `[한백 태양광 수주 흐름 — ${data.today} 콘솔 기준 (상담 접수일)]`,
    `월별 상담 접수 (최근 12개월): ${recent.map((m) => `${m} ${months.get(m)}곳`).join(' · ') || '없음'}`,
    `누적 ${data.sites.length}곳 — 형태: ${counted(kinds)} · 담당 협력사: ${counted(orgs)}`,
    '태양광 현장은 콘솔에 아직 상담 접수까지만 있다 — 그 뒤 단계(계약 · 시공 · 정산)는 콘솔에 기록이 없다.',
  ].join('\n');
}

const SETTLEMENT_BRIEF = '[태양광 정산 — 콘솔에는 아직 태양광의 기성 · 지급 기록이 없다. 한백이 대화로 주는 내용과 넘긴 파일로 일한다]';

/** 그 담당이 읽을 자료 한 덩이 — 태양광 */
export function solarBriefOf(agent: Agent, data: SolarScopeData): string {
  switch (agent.kind) {
    case 'strategy': return strategyBrief(data);
    case 'settlement': return SETTLEMENT_BRIEF;
    case 'owner':
    case 'operator': return sitesBrief(data, agent.company);
  }
}

/**
 * 카드와 머리말의 한 줄 — 태양광. 전략·기획만 센다(이번 달 · 누적 상담 접수). 사업자 담당은 셀 것이 없다 — 현장이 어느
 * 사업자의 것인지 모르니 전체 수를 사업자마다 적으면 그 사업자의 현장으로 읽힌다. 정산도 기록이 없다.
 */
export function solarHeadlineOf(agent: Agent, data: SolarScopeData): AgentHeadline {
  if (agent.kind !== 'strategy') return { counts: [] };
  const month = data.today.slice(0, 7);
  const now = data.sites.filter((s) => dayOf(new Date(s.createdAt)).startsWith(month)).length;
  return {
    counts: [
      { label: '이번 달 상담', value: `${now}곳` },
      { label: '누적', value: `${data.sites.length}곳` },
    ],
  };
}

/**
 * 에이전트가 읽는 자료 — 콘솔이 지금 셈한 것을 담당마다 글로 옮긴다 (순수 함수 — 저장소·세션을 안 끌어온다).
 *
 * ★베끼지 않고 옮긴다★ — 현장의 칸·차례·정체는 보드(lib/board)가, 배치의 상태는 명세서(lib/payout-board)가, 받을 기성은
 * 할 일(lib/todo-receivables)이 정본이다. 여기는 그 답을 에이전트가 읽을 글로 펼 뿐이고, 같은 판정을 다시 하지 않는다 —
 * 두 벌이면 에이전트가 보드와 다른 말을 한다.
 *
 * 화면 카드의 한 줄(headlineOf)도 여기서 같이 만든다 — 카드와 에이전트가 다른 수를 세지 않게.
 */
import { BOARD_COLUMNS, bandOfColumn, boardColumnOf, courtOfColumn, type BoardColumn } from '@/lib/board';
import { batchKey, batchStateOf, type Batch, type BatchState } from '@/lib/payout-board';
import { OVERDUE_DAYS, whatOf, type TodoItem } from '@/lib/todo-types';
import { won } from '@/lib/format';
import { normalizeOrg } from '@/lib/roles';
import type { CpoName, ProjectSummary } from '@/types/project';
import { CPO_NAMES } from '@/types/project';
import type { Agent, AgentHeadline } from '@/types/agents';

/** 지급처 한 곳 — 아지트 지출 글에 들어갈 것(열린구매만 받는다) */
export interface PartnerLine {
  bizRegNo: string | null;
  ceo: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankHolder: string | null;
}

/** 배치 하나의 현장 몫 — 지출 글에 현장별로 적는다(열린구매만 받는다) */
export interface BatchLine {
  /** 관리번호 — 없으면 현장 id */
  no: string;
  projectName: string;
  label: string;
  amount: number;
}

/** 담당 여덟이 나눠 읽는 재료 — scope.ts 가 한 번 모은다 */
export interface ScopeData {
  today: string;
  projects: ProjectSummary[];
  batches: Batch[];
  receivables: TodoItem[];
  /** 지급처(소속 이름) → 사업자·계좌. 열린구매를 부를 때만 채운다 */
  partners?: Map<string, PartnerLine>;
  /** 배치 열쇠(lib/payout-board batchKey) → 현장 몫. 열린구매를 부를 때만 채운다 */
  batchLines?: Map<string, BatchLine[]>;
}

/** 운영사 현장 한 줄 — 보드가 세운 칸과 차례를 그대로 쓴다 */
export interface SiteLine {
  id: string;
  no: string;
  name: string;
  column: BoardColumn;
  /** 지금 차례 — 「한백」 또는 「영업사(에코일렉)」 */
  turn: string;
  stalledDays: number;
  what: string;
  units: number;
  queueNo: string | null;
  envApproval: string | null;
}

const qtyOf = (p: ProjectSummary) => p.lines.reduce((n, l) => n + l.qty, 0);

/** 보드 칸의 순서 — 셈을 칸 순서로 적는다 */
const COLUMN_ORDER = BOARD_COLUMNS.map((c) => c.key);

/** 운영사 하나의 현장 — 진행 중인 것만, 정체가 긴 순 */
export function siteLinesOf(projects: ProjectSummary[], cpo: CpoName): { live: SiteLine[]; counts: Map<BoardColumn, number> } {
  const counts = new Map<BoardColumn, number>();
  const live: SiteLine[] = [];
  for (const p of projects) {
    if (p.cpo !== cpo) continue;
    const column = boardColumnOf(p);
    counts.set(column, (counts.get(column) ?? 0) + 1);
    if (column === '준공완료' || column === '계약중단') continue;
    const court = courtOfColumn(column);
    const org = court === '영업사' ? p.salesOrg : court === '시공사' ? p.gcOrg : null;
    live.push({
      id: p.id,
      no: p.mgmtNo ?? p.id,
      name: p.name,
      column,
      turn: org ? `${court}(${org})` : court,
      stalledDays: p.stalledDays,
      what: whatOf(column, p),
      units: qtyOf(p),
      queueNo: p.envQueueNo,
      envApproval: p.milestones.envApprovalDate,
    });
  }
  live.sort((a, b) => b.stalledDays - a.stalledDays || a.no.localeCompare(b.no));
  return { live, counts };
}

/** 에이전트에게 보내는 현장 줄의 상한 — 넘으면 「외 N곳」. 정체가 긴 것부터라 잘리는 쪽은 막 움직인 현장이다 */
export const SITE_LIMIT = 120;

function operatorBrief(data: ScopeData, cpo: CpoName): string {
  const { live, counts } = siteLinesOf(data.projects, cpo);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const byColumn = COLUMN_ORDER.filter((c) => counts.get(c)).map((c) => `${c} ${counts.get(c)}`).join(' · ');
  const lines = live.slice(0, SITE_LIMIT).map((s) => [
    s.no, s.name, s.column, `차례 ${s.turn}`,
    s.stalledDays > 0 ? `${s.stalledDays}일 정체` : '오늘 움직임',
    s.what !== s.column ? s.what : null,
    `${s.units}대`,
    s.queueNo ? `대기번호 ${s.queueNo}` : null,
    s.envApproval ? `환경부 승인 ${s.envApproval}` : null,
  ].filter(Boolean).join(' | '));
  return [
    `[${cpo} 현장 — ${data.today} 콘솔 기준]`,
    `전체 ${total}곳 · 진행 중 ${live.length}곳 · 준공완료 ${counts.get('준공완료') ?? 0} · 계약중단 ${counts.get('계약중단') ?? 0}`,
    `칸별: ${byColumn || '없음'}`,
    '',
    `진행 중인 현장 (정체가 긴 순${live.length > SITE_LIMIT ? `, 앞 ${SITE_LIMIT}곳 — 외 ${live.length - SITE_LIMIT}곳` : ''}):`,
    `관리번호 | 현장 | 칸 | 차례 | 정체 | 지금 할 일 | 대수 | 대기번호 | 환경부 승인`,
    ...(lines.length ? lines.map((l) => `- ${l}`) : ['- 없음']),
  ].join('\n');
}

const STATE_ORDER: BatchState[] = ['확정 누락', '가확정', '확정', '지급완료'];

function batchLine(b: Batch): string {
  return [
    b.paidAt, b.org ?? '지급처 미정', b.kind, `${b.count}건`, `공급가액 ${won(b.total)}원`,
    b.invoice ? '세금계산서 첨부됨' : '세금계산서 없음',
  ].join(' · ');
}

/** 지난 지급완료는 이만큼만 — 오래된 배치는 할 일이 없다 */
const PAID_LOOKBACK_DAYS = 31;

function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function settlementBrief(data: ScopeData): string {
  const since = daysBefore(data.today, PAID_LOOKBACK_DAYS);
  const groups = new Map<BatchState, Batch[]>();
  for (const b of data.batches) {
    const state = batchStateOf(b);
    if (state === '지급완료' && b.paidAt < since) continue;
    groups.set(state, [...(groups.get(state) ?? []), b]);
  }
  const out = [`[협력사 지급 — 배치(지급처 × 구분 × 지급일), ${data.today} 콘솔 기준]`];
  for (const state of STATE_ORDER) {
    const rows = (groups.get(state) ?? []).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
    const title = state === '지급완료' ? `지급완료 (최근 ${PAID_LOOKBACK_DAYS}일)` : state;
    out.push(`${title} ${rows.length}건${rows.length ? ':' : ''}`);
    for (const b of rows) out.push(`- ${batchLine(b)}`);
  }
  out.push('', `[받을 기성 — 한백이 운영사에게서 받을 돈의 할 일 ${data.receivables.length}건]`);
  for (const r of data.receivables) {
    out.push(`- ${[r.name, r.kind, r.what, r.urgencyLabel].filter(Boolean).join(' · ')}`);
  }
  return out.join('\n');
}

function purchaseBrief(data: ScopeData): string {
  /* 아직 나가지 않은 것 — 가확정 · 확정(지급일 전) · 확정 누락(지급일이 지났는데 확정을 건너뜀) */
  const due = data.batches
    .filter((b) => batchStateOf(b) !== '지급완료')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt) || (a.org ?? '').localeCompare(b.org ?? '', 'ko'));
  const out = [`[나갈 지급 — 아지트 지출 글의 재료, ${data.today} 콘솔 기준 · 금액은 콘솔의 공급가액]`];
  if (due.length === 0) out.push('- 없음');
  for (const b of due) {
    out.push(`- ${batchLine(b)} · 상태 ${batchStateOf(b)}`);
    const org = normalizeOrg(b.org);
    const partner = org ? data.partners?.get(org) : undefined;
    if (partner) {
      const bank = [partner.bankName, partner.bankAccountNo, partner.bankHolder && `예금주 ${partner.bankHolder}`].filter(Boolean).join(' ');
      out.push(`  지급처: ${[
        partner.bizRegNo && `사업자등록번호 ${partner.bizRegNo}`,
        partner.ceo && `대표 ${partner.ceo}`,
        bank || '계좌 미등록',
      ].filter(Boolean).join(' · ')}`);
    } else if (b.org) {
      out.push('  지급처: 협력사 정보 미등록');
    }
    const lines = data.batchLines?.get(batchKey(b.paidAt, b.org, b.kind)) ?? [];
    for (const l of lines) out.push(`  · ${l.no} ${l.projectName} — ${l.label} ${won(l.amount)}원`);
  }
  return out.join('\n');
}

function strategyBrief(data: ScopeData): string {
  const months = new Map<string, { sites: number; units: number }>();
  const byCpo = new Map<CpoName, { sites: number; units: number; live: number }>();
  const bands = { 계약: 0, 시공: 0, 준공완료: 0, 계약중단: 0 };
  for (const p of data.projects) {
    const m = p.createdAt.slice(0, 7);
    const units = qtyOf(p);
    const mm = months.get(m) ?? { sites: 0, units: 0 };
    months.set(m, { sites: mm.sites + 1, units: mm.units + units });
    const column = boardColumnOf(p);
    const c = byCpo.get(p.cpo) ?? { sites: 0, units: 0, live: 0 };
    byCpo.set(p.cpo, {
      sites: c.sites + 1, units: c.units + units,
      live: c.live + (column === '준공완료' || column === '계약중단' ? 0 : 1),
    });
    if (column === '준공완료') bands.준공완료 += 1;
    else if (column === '계약중단') bands.계약중단 += 1;
    else if (bandOfColumn(column) === '시공') bands.시공 += 1;
    else bands.계약 += 1;
  }
  const recent = [...months.keys()].sort().slice(-12);
  return [
    `[한백 수주 흐름 — ${data.today} 콘솔 기준 (접수일 = 계약서 수령일)]`,
    `월별 접수 (최근 12개월): ${recent.map((m) => `${m} ${months.get(m)!.sites}곳 ${months.get(m)!.units}대`).join(' · ') || '없음'}`,
    `운영사별 누적: ${CPO_NAMES.filter((c) => byCpo.get(c)).map((c) => {
      const v = byCpo.get(c)!;
      return `${c} ${v.sites}곳 ${v.units}대 (진행 중 ${v.live})`;
    }).join(' · ') || '없음'}`,
    `지금 단계: 계약 ${bands.계약} · 시공 ${bands.시공} · 준공완료 ${bands.준공완료} · 계약중단 ${bands.계약중단}`,
  ].join('\n');
}

/** 그 담당이 읽을 자료 한 덩이 */
export function briefOf(agent: Agent, data: ScopeData): string {
  switch (agent.kind) {
    case 'operator': return agent.cpo ? operatorBrief(data, agent.cpo) : '[운영사가 지정되지 않은 담당]';
    case 'settlement': return settlementBrief(data);
    case 'purchase': return purchaseBrief(data);
    case 'strategy': return strategyBrief(data);
  }
}

/** 카드와 머리말의 한 줄 — briefOf 와 같은 재료로 센다 */
export function headlineOf(agent: Agent, data: ScopeData): AgentHeadline {
  if (agent.kind === 'operator') {
    if (!agent.cpo) return { counts: [] };
    const { live } = siteLinesOf(data.projects, agent.cpo);
    const mine = live.filter((s) => s.turn === '한백').length;
    const stuck = live.filter((s) => s.stalledDays >= OVERDUE_DAYS).length;
    return {
      counts: [
        { label: '진행 중', value: `${live.length}곳` },
        { label: '한백 차례', value: `${mine}`, ...(mine ? { tone: 'warn' as const } : {}) },
        { label: `${OVERDUE_DAYS}일+ 정체`, value: `${stuck}`, ...(stuck ? { tone: 'warn' as const } : {}) },
      ],
    };
  }
  if (agent.kind === 'settlement') {
    const states = data.batches.map(batchStateOf);
    const missed = states.filter((s) => s === '확정 누락').length;
    const pending = states.filter((s) => s === '가확정').length;
    return {
      counts: [
        { label: '확정 누락', value: `${missed}`, ...(missed ? { tone: 'stop' as const } : {}) },
        { label: '가확정', value: `${pending}` },
        { label: '받을 기성', value: `${data.receivables.length}건` },
      ],
    };
  }
  if (agent.kind === 'purchase') {
    const due = data.batches.filter((b) => batchStateOf(b) !== '지급완료');
    const total = due.reduce((n, b) => n + b.total, 0);
    return {
      counts: [
        { label: '나갈 지급', value: `${due.length}건` },
        { label: '공급가액', value: `${won(total)}원` },
      ],
    };
  }
  const month = data.today.slice(0, 7);
  const now = data.projects.filter((p) => p.createdAt.startsWith(month));
  return {
    counts: [
      { label: '이번 달 접수', value: `${now.length}곳` },
      { label: '대수', value: `${now.reduce((n, p) => n + qtyOf(p), 0)}대` },
    ],
  };
}

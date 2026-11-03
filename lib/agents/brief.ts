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
import { CONSOLE_URL } from '@/lib/portal-intake';
import type { CpoName, ProjectSummary } from '@/types/project';
import { CPO_NAMES } from '@/types/project';
import type { Agent, AgentHeadline } from '@/types/agents';

/** 지급처 한 곳 — 아지트 지출 글에 들어갈 것(정산 담당만 받는다) */
export interface PartnerLine {
  bizRegNo: string | null;
  ceo: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankHolder: string | null;
  /** 협력사 정보에 사업자등록증 · 통장사본 파일이 올라와 있나 — 지출 글에 붙일 자료 */
  hasBizCert: boolean;
  hasBankbook: boolean;
}

/** 배치 하나의 현장 몫 — 지출 글에 현장별로 적는다(정산 담당만 받는다) */
export interface BatchLine {
  /** 관리번호 — 없으면 현장 id */
  no: string;
  projectName: string;
  label: string;
  amount: number;
}

/** 담당 일곱이 나눠 읽는 재료 — scope.ts 가 한 번 모은다 */
export interface ScopeData {
  today: string;
  projects: ProjectSummary[];
  batches: Batch[];
  receivables: TodoItem[];
  /** 지급처(소속 이름) → 사업자·계좌. 정산 담당을 부를 때만 채운다 */
  partners?: Map<string, PartnerLine>;
  /** 배치 열쇠(lib/payout-board batchKey) → 현장 몫. 정산 담당을 부를 때만 채운다 */
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

/** 배치 하나의 거래명세서 — 콘솔 주소(로그인한 한백이 연다). 지출 글에 붙일 자료의 첫째다 */
export function statementUrl(b: Pick<Batch, 'org' | 'paidAt' | 'kind'>): string {
  return `${CONSOLE_URL}/payments/statement?org=${encodeURIComponent(b.org ?? '')}&date=${b.paidAt}&kind=${encodeURIComponent(b.kind)}`;
}

/**
 * 정산 담당의 자료 — 셋이다(한백 2026-11-02 「정산의 경우에는 기성관리(운영사로부터 수금)과 지급관리(협력사에게 영업비 및
 * 시공비 지급). 그리고 지급을 위해 열린구매 글 작성 및 관련 자료 준비까지」).
 *   기성관리  한백이 운영사에게서 받을 돈의 할 일(lib/todo-receivables — 청구 · 수금)
 *   지급관리  협력사 배치의 상태(lib/payout-board — 확정 누락 · 가확정 · 확정 · 최근 지급완료)
 *   열린구매  아직 나가지 않은 배치마다 지출 글의 재료 — 지급처 사업자·계좌, 현장 몫, 붙일 자료(거래명세서 주소 · 세금계산서 ·
 *             사업자등록증 · 통장사본이 콘솔에 있는지). 협력사 정보는 부를 때만 읽는다(scope withPayees)
 */
function settlementBrief(data: ScopeData): string {
  const out = [`[기성관리 — 한백이 운영사에게서 받을 돈의 할 일 ${data.receivables.length}건, ${data.today} 콘솔 기준]`];
  /*
   * 줄마다 관리번호와 운영사를 단다 — 청구 메일은 운영사에게 가는데, 할 일 줄에는 현장 이름뿐이라 에이전트가 「어느 운영사 건인지
   * 자료에 없다」고 했다(2026-11-03 메일 초안 첫 시험). 할 일의 id 는 「갈래|현장 id」다(lib/todo-receivables).
   */
  const siteOf = new Map(data.projects.map((p) => [p.id, p]));
  for (const r of data.receivables) {
    const p = siteOf.get(r.id.slice(r.id.indexOf('|') + 1));
    out.push(`- ${[p?.mgmtNo, r.name, p && `운영사 ${p.cpo}`, r.kind, r.what, r.urgencyLabel].filter(Boolean).join(' · ')}`);
  }
  if (data.receivables.length === 0) out.push('- 없음');

  const since = daysBefore(data.today, PAID_LOOKBACK_DAYS);
  const groups = new Map<BatchState, Batch[]>();
  for (const b of data.batches) {
    const state = batchStateOf(b);
    if (state === '지급완료' && b.paidAt < since) continue;
    groups.set(state, [...(groups.get(state) ?? []), b]);
  }
  out.push('', '[지급관리 — 협력사 영업비·시공비 배치(지급처 × 구분 × 지급일)]');
  for (const state of STATE_ORDER) {
    const rows = (groups.get(state) ?? []).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
    const title = state === '지급완료' ? `지급완료 (최근 ${PAID_LOOKBACK_DAYS}일)` : state;
    out.push(`${title} ${rows.length}건${rows.length ? ':' : ''}`);
    for (const b of rows) out.push(`- ${batchLine(b)}`);
  }

  /* 아직 나가지 않은 것 — 가확정 · 확정(지급일 전) · 확정 누락(지급일이 지났는데 확정을 건너뜀) */
  const due = data.batches
    .filter((b) => batchStateOf(b) !== '지급완료')
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt) || (a.org ?? '').localeCompare(b.org ?? '', 'ko'));
  out.push('', '[열린구매 — 나갈 지급마다 아지트 지출 글의 재료 · 금액은 콘솔의 공급가액]');
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
    out.push(`  자료: ${[
      `거래명세서 ${statementUrl(b)}`,
      b.invoice ? '세금계산서 첨부됨' : '세금계산서 없음(협력사 발행 대기)',
      partner ? (partner.hasBizCert ? '사업자등록증 있음' : '사업자등록증 없음') : null,
      partner ? (partner.hasBankbook ? '통장사본 있음' : '통장사본 없음') : null,
    ].filter(Boolean).join(' · ')}`);
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
    /* 받을 돈 · 줄 돈 · 막힌 것 — 나갈 지급은 아직 지급완료가 아닌 배치(열린구매 글을 쓸 것)다 */
    const states = data.batches.map(batchStateOf);
    const missed = states.filter((s) => s === '확정 누락').length;
    const due = states.filter((s) => s !== '지급완료').length;
    return {
      counts: [
        { label: '받을 기성', value: `${data.receivables.length}건` },
        { label: '나갈 지급', value: `${due}건` },
        { label: '확정 누락', value: `${missed}`, ...(missed ? { tone: 'stop' as const } : {}) },
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

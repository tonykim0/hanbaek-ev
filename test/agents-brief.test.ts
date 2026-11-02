/**
 * 에이전트가 읽는 자료 — lib/agents/brief (한백 지시 2026-11-01·02).
 *
 * 에이전트는 콘솔이 셈한 것을 읽는다 — 보드의 칸·차례, 명세서의 배치 상태, 할 일의 기성. 여기서 다시 판정하면 에이전트가
 * 보드와 다른 말을 하므로, 이 시험은 「같은 정본을 같은 말로 옮기는가」를 본다. 카드의 셈(headlineOf)도 같은 재료다.
 */
import { describe, expect, it } from 'vitest';
import { briefOf, headlineOf, siteLinesOf, SITE_LIMIT, type ScopeData } from '@/lib/agents/brief';
import { toMessages } from '@/lib/agents/brain';
import type { Batch } from '@/lib/payout-board';
import { today } from '@/lib/date';
import type { ProjectSummary } from '@/types/project';
import type { Agent, AgentMessage } from '@/types/agents';

/* 배치 상태(batchStateOf)는 실제 오늘을 본다 — 날짜를 오늘에서 민다 */
const TODAY = today();
function shift(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function site(id: string, over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id, mgmtNo: id, name: `현장 ${id}`, addr: null, cpo: 'SK일렉링크', salesOrg: '에코일렉', gcOrg: '대상전력',
    bldgType: null, bizType: null, powerType: null, envQueueNo: null, createdAt: TODAY,
    lines: [{ termYears: 7, qty: 2 }], stage: 'construction', status: '착공', holdState: null, court: '시공사',
    stalledDays: 0, rejectedAt: null, submittedAt: null, priced: true, rejectedDocs: 0, rejectedEmptyDocs: 0,
    docsFilled: true, submitted: true, fixAsked: false, entryOk: [], nextStep: null,
    milestones: {
      envApprovalDate: null, cpoApprovalDate: null, notifyDate: null, notifyDone: false, notifySkipped: false,
      chargerOrderDate: null, chargerRecvDate: null, chargerDone: false, startDate: null, installDoneDate: null,
      installConfirmed: false, openDate: null, openDone: false, completionSubmitAt: null,
    },
    ...over,
  } as ProjectSummary;
}

const SK: Agent = { id: 'op-sk', kind: 'operator', cpo: 'SK일렉링크', name: 'SK일렉링크 담당' };
const SETTLE: Agent = { id: 'settlement', kind: 'settlement', cpo: null, name: '정산 담당' };
const BUY: Agent = { id: 'purchase', kind: 'purchase', cpo: null, name: '열린구매 담당' };
const PLAN: Agent = { id: 'strategy', kind: 'strategy', cpo: null, name: '전략·기획 담당' };

const data = (over: Partial<ScopeData> = {}): ScopeData => ({ today: TODAY, projects: [], batches: [], receivables: [], ...over });

function batch(over: Partial<Batch>): Batch {
  return { paidAt: shift(10), org: '에코일렉', kind: '시공비', count: 1, total: 1_000_000, finalized: false, invoice: null, ...over };
}

describe('운영사 담당이 읽는 현장', () => {
  const projects = [
    site('HB-1', { stage: 'intake', rejectedDocs: 2, stalledDays: 12 }),                       // 계약보완 — 영업사 차례
    site('HB-2', { stage: 'intake', submitted: true, stalledDays: 3 }),                         // 계약검토 — 한백 차례
    site('HB-3', { status: '착공', stalledDays: 8 }),                                           // 착공 — 시공사 차례
    site('HB-4', { status: '준공완료' }),                                                        // 끝난 현장
    site('HB-5', { holdState: '계약중단' }),                                                     // 멈춘 현장
    site('HB-6', { cpo: '플러그링크', stalledDays: 99 }),                                        // 남의 운영사
  ];

  it('그 운영사의 현장만, 진행 중인 것만 줄로 — 끝난 것·멈춘 것은 셈에만 든다', () => {
    const { live, counts } = siteLinesOf(projects, 'SK일렉링크');
    expect(live.map((s) => s.no)).toEqual(['HB-1', 'HB-3', 'HB-2']); // 정체가 긴 순
    expect(counts.get('준공완료')).toBe(1);
    expect(counts.get('계약중단')).toBe(1);
    expect(live.some((s) => s.no === 'HB-6')).toBe(false);
  });

  it('차례는 보드의 칸이 정한다 — 영업사·시공사는 그 현장의 회사 이름을 단다', () => {
    const { live } = siteLinesOf(projects, 'SK일렉링크');
    const turn = Object.fromEntries(live.map((s) => [s.no, s.turn]));
    expect(turn).toEqual({ 'HB-1': '영업사(에코일렉)', 'HB-2': '한백', 'HB-3': '시공사(대상전력)' });
    expect(live.find((s) => s.no === 'HB-1')?.what).toBe('반려 2건 보완');
  });

  it('자료 글에 셈과 줄이 같이 선다', () => {
    const text = briefOf(SK, data({ projects }));
    expect(text).toContain('전체 5곳 · 진행 중 3곳 · 준공완료 1 · 계약중단 1');
    expect(text).toContain('HB-1 | 현장 HB-1 | 계약보완 | 차례 영업사(에코일렉) | 12일 정체 | 반려 2건 보완 | 2대');
    expect(text).not.toContain('HB-6');
  });

  it(`현장이 ${SITE_LIMIT}곳을 넘으면 정체가 긴 쪽만 싣고 나머지는 「외 N곳」`, () => {
    const many = Array.from({ length: SITE_LIMIT + 5 }, (_, i) => site(`HB-${1000 + i}`, { stalledDays: i }));
    const text = briefOf(SK, data({ projects: many }));
    expect(text).toContain(`외 5곳`);
    expect(text).toContain(`HB-${1000 + SITE_LIMIT + 4}`); // 가장 오래 멈춘 것은 실린다
    expect(text).not.toContain('HB-1000 |');               // 막 움직인 것이 잘린다
  });

  it('카드 셈 — 한백 차례와 7일 넘게 멈춘 곳은 꼬리표로', () => {
    expect(headlineOf(SK, data({ projects })).counts).toEqual([
      { label: '진행 중', value: '3곳' },
      { label: '한백 차례', value: '1', tone: 'warn' },
      { label: '7일+ 정체', value: '2', tone: 'warn' },
    ]);
  });
});

describe('정산 · 열린구매가 읽는 배치', () => {
  const batches = [
    batch({ paidAt: shift(-3), org: '에코일렉', kind: '시공비', total: 3_000_000 }),               // 확정 누락
    batch({ paidAt: shift(7), org: '대상전력', kind: '영업비', total: 1_200_000 }),                 // 가확정
    batch({ paidAt: shift(7), org: '네이비인프라', kind: '시공비', finalized: true, total: 500_000 }), // 확정
    batch({ paidAt: shift(-5), org: '푸름', kind: '시공비', finalized: true, total: 700_000 }),     // 지급완료(최근)
    batch({ paidAt: shift(-400), org: '옛업체', kind: '시공비', finalized: true }),                 // 오래된 지급완료
  ];

  it('정산 — 상태별로 묶고, 오래된 지급완료는 뺀다', () => {
    const text = briefOf(SETTLE, data({ batches }));
    expect(text).toContain('확정 누락 1건:');
    expect(text).toContain(`- ${shift(-3)} · 에코일렉 · 시공비 · 1건 · 공급가액 3,000,000원 · 세금계산서 없음`);
    expect(text).toContain('가확정 1건:');
    expect(text).toContain('지급완료 (최근 31일) 1건:');
    expect(text).not.toContain('옛업체');
  });

  it('정산 카드 — 확정 누락은 빨강', () => {
    expect(headlineOf(SETTLE, data({ batches })).counts[0]).toEqual({ label: '확정 누락', value: '1', tone: 'stop' });
  });

  it('열린구매 — 아직 안 나간 것만, 지급처 사업자·계좌와 현장 몫을 붙인다', () => {
    const partners = new Map([
      ['대상전력', { bizRegNo: '1234567890', ceo: '박대상', bankName: '국민은행', bankAccountNo: '12345', bankHolder: '대상전력' }],
      ['네이비인프라', { bizRegNo: null, ceo: null, bankName: null, bankAccountNo: null, bankHolder: null }],
    ]);
    const batchLines = new Map([[`${shift(7)}|대상전력|영업비`, [{ no: 'HB-2026-077', projectName: '반달마을', label: '영업비 1차', amount: 1_200_000 }]]]);
    const text = briefOf(BUY, data({ batches, partners, batchLines }));
    expect(text).not.toContain('푸름');   // 이미 나갔다
    expect(text).toContain('상태 확정 누락');
    expect(text).toContain('지급처: 사업자등록번호 1234567890 · 대표 박대상 · 국민은행 12345 예금주 대상전력');
    expect(text).toContain('· HB-2026-077 반달마을 — 영업비 1차 1,200,000원');
    expect(text).toContain('지급처: 계좌 미등록');         // 네이비인프라 — 정보는 있는데 계좌가 비었다
    expect(text).toContain('지급처: 협력사 정보 미등록');   // 에코일렉 — 정보가 아예 없다
    expect(headlineOf(BUY, data({ batches })).counts).toEqual([
      { label: '나갈 지급', value: '3건' },
      { label: '공급가액', value: '4,700,000원' },
    ]);
  });
});

describe('전략·기획이 읽는 수주 흐름', () => {
  it('이번 달 접수와 운영사별 누적', () => {
    const projects = [
      site('HB-1', { lines: [{ termYears: 7, qty: 3 }] }),
      site('HB-2', { cpo: '플러그링크', lines: [{ termYears: 5, qty: 4 }] }),
      site('HB-3', { createdAt: '2025-01-15', status: '준공완료' }),
    ];
    const text = briefOf(PLAN, data({ projects }));
    expect(text).toContain(`${TODAY.slice(0, 7)} 2곳 7대`);
    expect(text).toContain('SK일렉링크 2곳 5대 (진행 중 1)');
    expect(headlineOf(PLAN, data({ projects })).counts).toEqual([
      { label: '이번 달 접수', value: '2곳' },
      { label: '대수', value: '7대' },
    ]);
  });
});

describe('지난 대화를 에이전트에게 넘기는 모양', () => {
  const said = (role: AgentMessage['role'], body: string): AgentMessage => ({
    id: body, role, author: role === 'agent' ? 'SK일렉링크 담당' : '김한백', body, at: '2026-11-02 10:00', meta: null,
  });

  it('맨 앞의 에이전트 말은 버린다 — 대화는 사람의 말로 시작해야 한다', () => {
    const m = toMessages([said('agent', '안녕하세요'), said('user', '현황 알려줘')]);
    expect(m).toEqual([{ role: 'user', content: '[김한백 · 2026-11-02 10:00] 현황 알려줘' }]);
  });

  it('기록은 표지를 달고 사람의 말로 간다', () => {
    const m = toMessages([said('note', 'SK 김과장 통화 — 견적 회신 금요일'), said('user', '정리해줘')]);
    expect(m[0]).toEqual({ role: 'user', content: '[기록 — 김한백 · 2026-11-02 10:00] SK 김과장 통화 — 견적 회신 금요일' });
    expect(m[1].role).toBe('user');
  });
});

/**
 * 에이전트가 읽는 자료 — lib/agents/brief (한백 지시 2026-11-01·02).
 *
 * 에이전트는 콘솔이 셈한 것을 읽는다 — 보드의 칸·차례, 명세서의 배치 상태, 할 일의 기성. 여기서 다시 판정하면 에이전트가
 * 보드와 다른 말을 하므로, 이 시험은 「같은 정본을 같은 말로 옮기는가」를 본다. 카드의 셈(headlineOf)도 같은 재료다.
 */
import { describe, expect, it } from 'vitest';
import { briefOf, headlineOf, siteLinesOf, SITE_LIMIT, type ScopeData } from '@/lib/agents/brief';
import { toMessages, withContext } from '@/lib/agents/brain';
import type { Batch } from '@/lib/payout-board';
import type { AgitPostRecord } from '@/lib/agit/post';
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

const SK: Agent = { id: 'op-sk', kind: 'operator', biz: 'ev', company: null, cpo: 'SK일렉링크', name: 'SK일렉링크 담당' };
const SETTLE: Agent = { id: 'settlement', kind: 'settlement', biz: 'ev', company: null, cpo: null, name: '정산 담당' };
const PLAN: Agent = { id: 'strategy', kind: 'strategy', biz: 'ev', company: null, cpo: null, name: '전략·기획 담당' };

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

describe('정산 담당이 읽는 것 — 기성관리 · 지급관리 · 열린구매', () => {
  const batches = [
    batch({ paidAt: shift(-3), org: '에코일렉', kind: '시공비', total: 3_000_000 }),               // 확정 누락
    batch({ paidAt: shift(7), org: '대상전력', kind: '영업비', total: 1_200_000 }),                 // 가확정
    batch({ paidAt: shift(7), org: '네이비인프라', kind: '시공비', finalized: true, total: 500_000 }), // 확정
    batch({ paidAt: shift(-5), org: '푸름', kind: '시공비', finalized: true, total: 700_000 }),     // 지급완료(최근)
    batch({ paidAt: shift(-400), org: '옛업체', kind: '시공비', finalized: true }),                 // 오래된 지급완료
  ];

  it('기성관리 — 줄마다 관리번호와 운영사가 선다(청구 메일은 운영사에게 간다)', () => {
    const text = briefOf(SETTLE, data({
      projects: [site('HB-2026-201', { name: '청주 리버파크자이', cpo: '나이스인프라' })],
      receivables: [{
        id: 'claim|HB-2026-201', href: '/projects/HB-2026-201?tab=receivable', name: '청주 리버파크자이',
        what: '1차 6,600,000원 · 착공 충족', group: '기성', kind: '기성 청구', stalledDays: 0, urgency: 155,
        urgencyLabel: '청구 가능 155일', overdue: true,
      }],
    }));
    expect(text).toContain('- HB-2026-201 · 청주 리버파크자이 · 운영사 나이스인프라 · 기성 청구 · 1차 6,600,000원 · 착공 충족 · 청구 가능 155일');
  });

  it('지급관리 — 상태별로 묶고, 오래된 지급완료는 뺀다', () => {
    const text = briefOf(SETTLE, data({ batches }));
    expect(text).toContain('[기성관리 — 한백이 운영사에게서 받을 돈의 할 일 0건');
    expect(text).toContain('확정 누락 1건:');
    expect(text).toContain(`- ${shift(-3)} · 에코일렉 · 시공비 · 1건 · 공급가액 3,000,000원 · 세금계산서 없음`);
    expect(text).toContain('가확정 1건:');
    expect(text).toContain('지급완료 (최근 31일) 1건:');
    expect(text).not.toContain('옛업체');
  });

  it('카드 — 받을 기성 · 나갈 지급(아직 지급완료가 아닌 배치) · 확정 누락은 빨강', () => {
    expect(headlineOf(SETTLE, data({ batches })).counts).toEqual([
      { label: '받을 기성', value: '0건' },
      { label: '나갈 지급', value: '3건' },
      { label: '확정 누락', value: '1', tone: 'stop' },
    ]);
  });

  it('열린구매 — 아직 안 나간 것만, 지급처 사업자·계좌 · 현장 몫 · 붙일 자료를 붙인다', () => {
    const partners = new Map([
      ['대상전력', {
        bizRegNo: '1234567890', ceo: '박대상', bankName: '국민은행', bankAccountNo: '12345', bankHolder: '대상전력',
        hasBizCert: true, hasBankbook: false,
      }],
      ['네이비인프라', {
        bizRegNo: null, ceo: null, bankName: null, bankAccountNo: null, bankHolder: null, hasBizCert: false, hasBankbook: false,
      }],
    ]);
    const batchLines = new Map([[`${shift(7)}|대상전력|영업비`, [{ no: 'HB-2026-077', projectName: '반달마을', label: '영업비 1차', amount: 1_200_000 }]]]);
    const text = briefOf(SETTLE, data({ batches, partners, batchLines }));
    const buy = text.slice(text.indexOf('[열린구매'));
    expect(buy).not.toContain('푸름');   // 이미 나갔다
    expect(buy).toContain('상태 확정 누락');
    expect(buy).toContain('지급처: 사업자등록번호 1234567890 · 대표 박대상 · 국민은행 12345 예금주 대상전력');
    expect(buy).toContain('· HB-2026-077 반달마을 — 영업비 1차 1,200,000원');
    expect(buy).toContain('지급처: 계좌 미등록');         // 네이비인프라 — 정보는 있는데 계좌가 비었다
    expect(buy).toContain('지급처: 협력사 정보 미등록');   // 에코일렉 — 정보가 아예 없다
    expect(buy).toContain(`/payments/statement?org=${encodeURIComponent('대상전력')}&date=${shift(7)}&kind=${encodeURIComponent('영업비')}`);
    expect(buy).toContain('세금계산서 없음(협력사 발행 대기) · 사업자등록증 있음 · 통장사본 없음');
    expect(text).not.toContain('[아지트 열린구매 글');   // 정산 담당을 부를 때만 읽는다(scope withPayees)
  });

  it('아지트 글 — 지금 콘솔의 초안 · 올린 글 · 계정(지난 대화의 금액으로 말하지 않게)', () => {
    const post = (over: Partial<AgitPostRecord>): AgitPostRecord => ({
      id: 'p', payDate: '2026-11-10', kind: '영업비', fee: null, status: 'draft', title: '공사명', body: '', total: 1_200_000, batches: 1,
      error: null, postedBy: '정산 담당', assignees: [], messageId: null, again: false, urgent: null, agitUrl: null, createdAt: '2026-11-07 08:00',
      at: '2026-11-07 08:00', stalled: false, ...over,
    });
    const account = {
      connected: true, login: 'x', connectedBy: '한백 관리자', connectedAt: '2026-11-10 16:57', until: '2027-02-10', expired: null,
      assignees: ['a', 'b'], feePayee: null,
    };
    /* 위탁운영수수료 글 — 금액은 지어낸 것(실제 세금계산서 값은 공개 저장소에 적지 않는다) */
    const file = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/a.pdf', name: 'a.pdf' };
    const feePost = post({
      id: 't', payDate: '2026-11-30', kind: '위탁운영수수료', total: 1_000_000, urgent: '매월 말 진행되는 플러그링크 Mother EPC 거래의 일부',
      fee: {
        month: '2026-10', round: 6, fee: { supply: 1_000_000, vat: 100_000, total: 1_100_000, file },
        sales: { supply: 400_000, vat: 40_000, total: 440_000, inDate: null, file },
      },
    });
    const text = briefOf(SETTLE, data({
      agit: {
        from: '2026-10-27',
        account,
        posts: [
          post({}),
          post({ id: 'q', kind: '시공비', status: 'posted', at: '2026-11-10 17:01', agitUrl: 'https://team-hanbaek.agit.io/g/1/wall/2', total: 9_545_000, batches: 2 }),
          post({ id: 'r', payDate: '2026-11-12', kind: '시공비', status: 'failed', error: '아지트 로그인이 풀렸습니다', urgent: '세금계산서 발행 지연' }),
          post({ id: 's', payDate: '2026-11-25', status: 'sending', stalled: true }),
          feePost,
        ],
      },
    }));
    const agit = text.slice(text.indexOf('[아지트 열린구매 글'));
    expect(agit).toContain('결제일 2026-10-27 이후');
    expect(agit).toContain('아지트 계정 연결됨(로그인 2027-02-10까지) · 요청 담당 2명 · 플러그링크 계좌(위탁운영수수료 글 · 고정값) 미지정 — 위탁운영수수료 글을 올릴 수 없음');
    /* 위탁운영수수료 글은 차 · 몇 월분 · 두 계산서의 금액(지급 건수 · 긴급사유는 말하지 않는다 — 늘 같은 한 줄이다) */
    expect(agit).toContain('- 2026-11-30 11월 30일 위탁운영수수료 · 초안(승인 전) · 6차(26년 10월분) · 위탁운영수수료 공급가액 1,000,000원 · 합계 1,100,000원'
      + ' · 충전매출 합계 440,000원(입금 예정 날짜 없음)');
    expect(agit).not.toContain('지급 1건 · 공급가액 1,000,000원');
    expect(agit).toContain('- 2026-11-10 11월 10일 정기결제 영업비 · 초안(승인 전) · 지급 1건 · 공급가액 1,200,000원');
    expect(agit).toContain('- 2026-11-10 11월 10일 정기결제 시공비 · 올림 2026-11-10 17:01 https://team-hanbaek.agit.io/g/1/wall/2 · 지급 2건 · 공급가액 9,545,000원');
    expect(agit).toContain('못 올림 — 아지트 로그인이 풀렸습니다 · 지급 1건 · 공급가액 1,200,000원 · 긴급(사유: 세금계산서 발행 지연)');
    expect(agit).toContain('올리는 중에 멈춤 — 다시 올리기 전에 아지트에 올라갔는지 한백에게 먼저 확인');

    const off = briefOf(SETTLE, data({ agit: { from: '2026-10-27', account: { ...account, connected: false, until: null, assignees: [] }, posts: [] } }));
    expect(off).toContain('아지트 계정 연결 전 — 한백이 정산 담당 화면의 「아지트 계정」에서 연결해야 올린다 · 요청 담당 미지정 — 올릴 수 없음');
    expect(off).toContain('- 없음');
    const gone = briefOf(SETTLE, data({ agit: { from: '2026-10-27', account: { ...account, connected: false, expired: '아지트 로그인이 풀렸습니다' }, posts: [] } }));
    expect(gone).toContain('아지트 계정 로그인 풀림 — 한백이 정산 담당 화면의 「아지트 계정」에서 다시 연결해야 올린다');
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
  const said = (role: AgentMessage['role'], body: string, files: AgentMessage['files'] = []): AgentMessage => ({
    id: body, role, author: role === 'agent' ? 'SK일렉링크 담당' : '김한백', body, at: '2026-11-02 10:00', meta: null, files,
  });
  const file = (id: string, name: string) => ({ id, name, url: `https://blob.example/${id}`, size: 10, contentType: null });

  it('넘긴 파일 — PDF · 그림은 주소로, 글자를 뽑은 것은 글로, 못 여는 것은 이름만 · 머리에 id(메일에 붙일 때 쓴다)', () => {
    const m = toMessages(
      [said('user', '이 자료 보고 정리해줘', [
        file('a', '견적서.pdf'), file('b', '현장.jpg'), file('c', '단가표.xlsx'), file('d', '공문.hwp'),
      ])],
      new Map([['c', '## 시트 「단가」 (1줄)\n완속\t1200000']]),
    );
    expect(m[0].content).toEqual([
      { type: 'text', text: '[김한백 · 2026-11-02 10:00] 이 자료 보고 정리해줘' },
      { type: 'text', text: '[넘긴 파일 견적서.pdf · id=a]' },
      { type: 'document', source: { type: 'url', url: 'https://blob.example/a' }, title: '견적서.pdf' },
      { type: 'text', text: '[넘긴 파일 현장.jpg · id=b]' },
      { type: 'image', source: { type: 'url', url: 'https://blob.example/b' } },
      { type: 'text', text: '[넘긴 파일 단가표.xlsx · id=c] — 글자만 뽑음\n## 시트 「단가」 (1줄)\n완속\t1200000' },
      { type: 'text', text: '[넘긴 파일 공문.hwp · id=d] — 이 형식은 열지 못한다. 이름만 안다' },
    ]);
  });

  it('지금의 콘솔 자료는 마지막 지시 뒤에, 캐시 표지는 그 바로 앞에 — 앞의 대화는 그대로(다음 지시에서 캐시가 맞는다)', () => {
    const m = withContext(toMessages([said('user', '첫 지시'), said('agent', '답'), said('user', '둘째 지시')]), '[지금 — 자료]');
    expect(m[0]).toEqual({ role: 'user', content: '[김한백 · 2026-11-02 10:00] 첫 지시' });
    expect(m[2]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '[김한백 · 2026-11-02 10:00] 둘째 지시', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: '[지금 — 자료]' },
      ],
    });
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

  it('자동의 말(콘솔이 담당의 이름으로 한 일)은 모델의 말이 아니라 표지를 단 기록으로 간다 — 맨 앞이어도 남는다', () => {
    const auto: AgentMessage = { ...said('auto', 'HB-1 현장 — 계약서가 접수됐습니다.'), author: '나이스인프라 담당' };
    const m = toMessages([auto, said('user', '받는 사람 누구야')]);
    expect(m[0]).toEqual({ role: 'user', content: '[자동 — 나이스인프라 담당 · 2026-11-02 10:00] HB-1 현장 — 계약서가 접수됐습니다.' });
    expect(m).toHaveLength(2);
  });
});

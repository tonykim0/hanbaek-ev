/**
 * 아지트 열린구매 글(lib/agit/post · send) — 한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게」.
 * 글의 모양은 한백이 고른 미리보기(결제일마다 한 글)다. 금액은 11-10 실제 결제일의 것을 본떴다(에코일렉 · 이브이솔루션).
 * ★웹훅 주소는 지어낸 것이다★ — 진짜 주소는 그 그룹에 글을 쓰는 열쇠라 공개 저장소에 적지 않는다.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  agitAssigneesOf, agitDraftsOf, agitPayloadOf, agitPostOf, agitPostedSay, agitWebhookOf, assigneesLabel, badAgitIds, detailOf,
  upcomingPayDates, vatOf, type AgitBatch, type AgitPayee,
} from '@/lib/agit/post';
import { agitPostUrlOf, sendToAgit } from '@/lib/agit/send';
import type { PayoutRow } from '@/types/project';

const URL_ = 'https://hanbaek-re.vercel.app';
const TOKEN = '00000000-0000-4000-8000-000000000000';
const ECO: AgitPayee = { bankName: '국민은행', bankAccountNo: '123-45-6789', bankHolder: '에코일렉' };
const payees: Record<string, AgitPayee> = { 에코일렉: ECO };
const payeeOf = (org: string | null) => (org ? payees[org] : undefined);

const lines = (n: number, qty: number, amount: number, label = '1차') =>
  Array.from({ length: n }, (_, i) => ({ projectId: `P${label}${i}`, label, amount, qty }));

const nov10: AgitBatch[] = [
  { org: '이브이솔루션 (영업)', kind: '영업비', total: 4_900_000, invoice: false, lines: lines(1, 7, 4_900_000) },
  {
    org: '에코일렉', kind: '영업비', total: 96_460_000, invoice: false,
    lines: [...lines(19, 5, 4_550_000), { projectId: 'P-big', label: '1차', amount: 19_110_000, qty: 11 }],
  },
];

describe('결제일마다 한 글', () => {
  it('한백이 고른 미리보기 모양 — 지급처 가나다 · 영업비 · 금액 · 회차 · 계좌 · 합계 · 부가세 · 거래명세서', () => {
    const post = agitPostOf('2026-11-10', nov10, payeeOf, URL_);
    expect(post.text).toBe([
      '[열린구매] 11/10 정기결제 — 협력사 지급 2건',
      '',
      '1) 에코일렉 · 영업비 · 96,460,000원',
      '   영업비 1차 · 20개 현장 106기',
      '   계좌 국민은행 123-45-6789 (예금주 에코일렉) · 세금계산서 없음',
      '2) 이브이솔루션 (영업) · 영업비 · 4,900,000원',
      '   영업비 1차 · 1개 현장 7기',
      '   계좌 미등록 · 세금계산서 없음',
      '',
      '공급가액 합계 101,360,000원',
      '부가세 10,136,000원 · 합계 111,496,000원',
      '거래명세서 https://hanbaek-re.vercel.app/statements',
    ].join('\n'));
    expect(post).toMatchObject({ total: 101_360_000, batches: 2, blocked: null, title: '[열린구매] 11/10 정기결제 — 협력사 지급 2건' });
  });

  it('정기결제가 아닌 날은 「지급」 · 계산서가 붙었으면 「있음」', () => {
    const post = agitPostOf('2026-11-12', [{ ...nov10[1], invoice: true }], payeeOf, URL_);
    expect(post.title).toBe('[열린구매] 11/12 지급 — 협력사 지급 1건');
    expect(post.text).toContain('세금계산서 있음');
  });

  it('회차가 섞이면 「 / 」로 잇고, 회수는 건수 · 금액 · 한 현장은 한 번 센다', () => {
    expect(detailOf('시공비', [
      ...lines(2, 3, 100, '2차'), ...lines(3, 4, 100, '1차'), { projectId: 'Pa', label: '회수', amount: -2_800_000, qty: 9 },
      { projectId: 'P1차0', label: '1차', amount: 50, qty: 4 },
    ])).toBe('시공비 1차 · 3개 현장 12기 / 2차 · 2개 현장 6기 / 회수 · 1건 -2,800,000원');
  });

  it('부가세는 배치마다 10% 절사의 합 — 세금계산서 합과 맞는다', () => {
    expect(vatOf(1_234_567)).toBe(123_456);
    const post = agitPostOf('2026-11-10', [
      { org: 'A', kind: '영업비', total: 15, invoice: false, lines: [] },
      { org: 'B', kind: '영업비', total: 15, invoice: false, lines: [] },
    ], payeeOf, URL_);
    expect(post.text).toContain('부가세 2원 · 합계 32원'); // 1 + 1 (총액 30 의 10% = 3 이 아니다)
  });

  it('올릴 수 없는 결제일 — 지급 0건 · 지급처 미정', () => {
    expect(agitPostOf('2026-11-10', [], payeeOf, URL_).blocked).toBe('지급 0건 — 올릴 것 없음');
    expect(agitPostOf('2026-11-10', [{ ...nov10[0], org: null }], payeeOf, URL_).blocked).toBe('지급처 미정 배치 — 올릴 수 없음');
  });

  it('앞으로 올 결제일만 · 이른 것이 위', () => {
    expect(upcomingPayDates('2026-11-07', ['2026-11-25', '2026-10-25', '2026-11-10', '2026-11-10', '2026-11-07']))
      .toEqual(['2026-11-07', '2026-11-10', '2026-11-25']);
  });

  it('원장 줄의 차례가 달라도 같은 글이다 — 미리 본 글과 올릴 때 지은 글을 견주는 문이 이것에 기댄다', () => {
    const row = (projectId: string, org: string, amount: number, qty: number): PayoutRow => ({
      entryId: projectId, projectId, projectName: projectId, cpo: '나이스인프라', org, kind: '영업비', label: '1차',
      amount, paidAt: '2026-11-10', note: null, site: { bizTypes: [], termYears: [], powerTypes: [], qty },
    });
    const rows = [row('a', '에코일렉', 910_000, 1), row('b', '에코일렉', 1_820_000, 2), row('c', '갑', 100, 1), row('d', '에코일렉', 1, 0)];
    const one = agitDraftsOf('2026-11-07', rows, [], [], payeeOf, URL_);
    const two = agitDraftsOf('2026-11-07', [...rows].reverse(), [], [], payeeOf, URL_);
    expect(one.map((d) => d.text)).toEqual(two.map((d) => d.text));
    expect(one[0].text).toContain('영업비 1차 · 3개 현장 3기');
    expect(agitDraftsOf('2026-11-11', rows, [], [], payeeOf, URL_)).toEqual([]); // 지난 결제일은 없다
    expect(agitDraftsOf('2026-11-11', rows, [], [], payeeOf, URL_, '2026-11-10')).toHaveLength(1); // 고르면 지난 날도
  });

  it('올린 뒤 정산 담당 대화의 한 줄', () => {
    expect(agitPostedSay({ payDate: '2026-11-10', title: 'T', total: 101_360_000, batches: 2 }, '김정우'))
      .toBe('11월 10일 정기결제 열린구매 글을 아지트에 올렸습니다 — 지급 2건 · 공급가액 101,360,000원 (승인 김정우).\nT');
  });
});

describe('웹훅 주소', () => {
  it('https://agit.io/webhook/<토큰> 하나만', () => {
    expect(agitWebhookOf(` https://agit.io/webhook/${TOKEN} `)).toBe(`https://agit.io/webhook/${TOKEN}`);
    for (const bad of [
      `http://agit.io/webhook/${TOKEN}`,
      `https://agit.io.evil.com/webhook/${TOKEN}`,
      `https://evil.com/webhook/${TOKEN}`,
      `https://team-hanbaek.agit.io/webhook/${TOKEN}`,
      `https://agit.io/webhook/${TOKEN}?x=1`,
      `https://agit.io/webhook/${TOKEN}#a`,
      'https://agit.io/webhook/../admin',
      'https://agit.io/webhook/abc',
      `https://u:p@agit.io/webhook/${TOKEN}`,
      `https://agit.io:8443/webhook/${TOKEN}`,
      `agit.io/webhook/${TOKEN}`,
      '',
    ]) expect(agitWebhookOf(bad), bad).toBeNull();
  });
});

describe('요청 담당자 (한백 2026-11-08 「아지트 글에서 담당자 설정도 필요해」)', () => {
  it('아지트 ID 를 쉼표 · 띄어쓰기로 여럿 — 앞의 @ 는 떼고 같은 ID 는 한 번', () => {
    expect(agitAssigneesOf('kiko.x, ella.a')).toEqual(['kiko.x', 'ella.a']);
    expect(agitAssigneesOf(' @kiko.x  @ella.a,kiko.x ')).toEqual(['kiko.x', 'ella.a']);
    expect(agitAssigneesOf('Kiko.X kiko.x')).toEqual(['Kiko.X']);
    expect(agitAssigneesOf('')).toEqual([]);
    expect(agitAssigneesOf(' , ')).toEqual([]);
  });

  it('아지트 ID 가 아니면(영문 · 숫자 · 점 20자 밖) null — 틀린 것을 짚는다', () => {
    expect(agitAssigneesOf('kiko.x, 김정우')).toBeNull();
    expect(badAgitIds('kiko.x, 김정우, a_b')).toEqual(['김정우', 'a_b']);
    expect(agitAssigneesOf('a'.repeat(21))).toBeNull();
    expect(agitAssigneesOf('a@b.com')).toBeNull();
  });

  it('여섯 명부터는 받지 않는다', () => {
    expect(agitAssigneesOf('a b c d e')).toHaveLength(5);
    expect(agitAssigneesOf('a b c d e f')).toBeNull();
  });

  it('담당자가 있으면 요청 글(task.assignees) — 가이드의 몸 그대로', () => {
    expect(agitPayloadOf('글', ['kiko.x', 'ella.a'])).toEqual({ text: '글', task: { assignees: ['kiko.x', 'ella.a'] } });
    expect(agitPayloadOf('글', [])).toEqual({ text: '글' });
    expect(assigneesLabel(['kiko.x', 'ella.a'])).toBe('@kiko.x · @ella.a');
  });
});

describe('올리기', () => {
  const HOOK = `https://agit.io/webhook/${TOKEN}`;
  const body = (text: string) => agitPayloadOf(text, ['kiko.x']);

  it('{"text", "task": {"assignees"}} 를 POST 한다 · 200 이면 올림', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await sendToAgit(HOOK, body('안녕\n둘째 줄'), fetcher as unknown as typeof fetch)).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ text: '안녕\n둘째 줄', task: { assignees: ['kiko.x'] } });
  });

  it('404 · 그 밖의 거절 · 닿지 못함 · 시간 넘김은 사람 말로', async () => {
    const as = (f: () => Promise<Response>) => f as unknown as typeof fetch;
    expect(await sendToAgit(HOOK, body('x'), as(async () => new Response('', { status: 404 }))))
      .toEqual({ ok: false, error: expect.stringContaining('웹훅을 모릅니다(404)') });
    expect(await sendToAgit(HOOK, body('x'), as(async () => new Response('', { status: 500 }))))
      .toEqual({ ok: false, error: '아지트가 받지 않았습니다(500).' });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await sendToAgit(HOOK, body('x'), as(async () => { throw new TypeError('fetch failed'); })))
      .toEqual({ ok: false, error: expect.stringContaining('닿지 못했습니다') });
    const timeout = new Error('t');
    timeout.name = 'TimeoutError';
    expect(await sendToAgit(HOOK, body('x'), as(async () => { throw timeout; })))
      .toEqual({ ok: false, error: expect.stringContaining('올라갔을 수 있으니') });
    quiet.mockRestore();
  });

  it('아지트가 돌려준 글 id · 주소를 받는다 — 주소는 https 의 *.agit.io 만 (2026-11-08 실측 모양)', async () => {
    const as = (f: () => Promise<Response>) => f as unknown as typeof fetch;
    const answer = '{"status":"ok","id":365222313,"url":"https://team-hanbaek.agit.io/g/300450579/wall/365222313"}';
    expect(await sendToAgit(HOOK, body('x'), as(async () => new Response(answer, { status: 200 }))))
      .toEqual({ ok: true, agitId: '365222313', agitUrl: 'https://team-hanbaek.agit.io/g/300450579/wall/365222313' });
    for (const bad of ['http://team-hanbaek.agit.io/x', 'https://evilagit.io/x', 'https://agit.io.evil.com/x', 'javascript:alert(1)', 3]) {
      expect(agitPostUrlOf(bad), String(bad)).toBeUndefined();
    }
    expect(agitPostUrlOf('https://agit.io/g/1/wall/2')).toBe('https://agit.io/g/1/wall/2');
  });

  it('거절의 까닭이 짧은 글이면 붙인다 — HTML 은 안 붙인다', async () => {
    const as = (f: () => Promise<Response>) => f as unknown as typeof fetch;
    expect(await sendToAgit(HOOK, body('x'), as(async () => new Response('{"error":"invalid assignee"}', { status: 422 }))))
      .toEqual({ ok: false, error: '아지트가 받지 않았습니다(422) — {"error":"invalid assignee"}' });
    expect(await sendToAgit(HOOK, body('x'), as(async () => new Response('<!DOCTYPE html><p>x</p>', { status: 400 }))))
      .toEqual({ ok: false, error: '아지트가 받지 않았습니다(400).' });
  });

  it('웹훅 주소가 아니면 부르지 않는다', async () => {
    const fetcher = vi.fn();
    expect((await sendToAgit(`https://evil.com/webhook/${TOKEN}`, body('x'), fetcher as unknown as typeof fetch)).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

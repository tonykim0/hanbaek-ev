/**
 * 아지트 열린구매 글(lib/agit/post · send) — 한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게」.
 * 글의 모양은 한백이 고른 미리보기(결제일마다 한 글)다. 금액은 11-10 실제 결제일의 것을 본떴다(에코일렉 · 이브이솔루션).
 * ★웹훅 주소는 지어낸 것이다★ — 진짜 주소는 그 그룹에 글을 쓰는 열쇠라 공개 저장소에 적지 않는다.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  AGIT_CC, AGIT_URGENT_MAX, AGIT_URGENT_TAG,
  agitAssigneesOf, agitBatchesOf, agitDraftsOf, agitFolderOf, agitKindOf, agitKindsOn, agitPostOf, agitPostedSay, agitTemplateOf, agitTitleOf,
  agitWebhookOf, assigneesLabel, badAgitIds, itemNameOf,
  requestNameOf, upcomingPayDates, urgentReasonOf, vatOf, type AgitBatch, type AgitPayee,
} from '@/lib/agit/post';
import { agitBundleOf, safeName } from '@/lib/agit/bundle';
import { agitZipOf } from '@/lib/agit/bundle-zip';
import { purchaseXlsx } from '@/lib/agit/purchase-xlsx';
import { cookiePairs } from '@/lib/agit/statement-pdf';
import { formatNumber, purchaseHtml } from '@/lib/agit/purchase-image';
import type { PayoutRow } from '@/types/project';

const URL_ = 'https://hanbaek-re.vercel.app';
const TOKEN = '00000000-0000-4000-8000-000000000000';
const ECO: AgitPayee = { bankName: '국민은행', bankAccountNo: '123-45-6789', bankHolder: '에코일렉' };
const payees: Record<string, AgitPayee> = { 에코일렉: ECO };
const payeeOf = (org: string | null) => (org ? payees[org] : undefined);

/** 한백이 쓰던 구매요청간소화 엑셀에서 값을 걷은 틀(scripts/agit-purchase-template.ts) */
const TEMPLATE = new Uint8Array(readFileSync('lib/agit/purchase-template.xlsx'));
/** 시트 XML 에서 칸 하나 */
const cellOf = (xml: string) => (ref: string) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(xml)?.[0] ?? '';

const lines = (n: number, qty: number, amount: number, label = '1차') =>
  Array.from({ length: n }, (_, i) => ({ projectId: `P${label}${i}`, label, amount, qty }));

const nov10: AgitBatch[] = [
  { org: '이브이솔루션 (영업)', kind: '영업비', total: 4_900_000, invoice: false, lines: lines(1, 7, 4_900_000) },
  {
    org: '에코일렉', kind: '영업비', total: 96_460_000, invoice: false,
    lines: [...lines(19, 5, 4_550_000), { projectId: 'P-big', label: '1차', amount: 19_110_000, qty: 11 }],
  },
];

describe('결제일마다 한 글 — 한백이 올려 온 양식 (2026-11-08 지난 「영업위탁 수수료」 글)', () => {
  const ECO_LINK = `${URL_}/payments/statement?org=${encodeURIComponent('에코일렉')}&date=2026-11-10&kind=${encodeURIComponent('영업비')}`;

  it('한백의 구매요청간소화 글 그대로(마크다운) — 배경 · 구매 내역 · 기한 · 청구 금액 · 참고자료 · cc · 계좌는 본문에 없다', () => {
    const post = agitPostOf('2026-11-10', nov10, URL_);
    expect(post.text).toBe([
      '#구매요청간소화',
      '# 배경',
      '> *- 공사명 :* 26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차',
      '> *- 상황설명 :* 26년 10월 동안 진행된 전기차 충전기 설치 영업에 대한 영업위탁 수수료 1차',
      '# 구매 내역',
      '![구매요청간소화 엑셀](올릴 때 붙는 엑셀 캡처)',
      '# 기한',
      '> 정기결제일 11월 10일',
      '# *청구 금액*',
      '> 부가세 전 101,360,000',
      '> 부가세 포함 111,496,000',
      '# 참고자료',
      '> 거래명세서 내역',
      `> [에코일렉](${ECO_LINK})`,
      `> [이브이솔루션 (영업)](${URL_}/payments/statement?org=${encodeURIComponent('이브이솔루션 ')}%28${encodeURIComponent('영업')}%29&date=2026-11-10&kind=${encodeURIComponent('영업비')})`,
    ].join('\n'));
    expect(post.text).not.toContain('123-45-6789');
    expect(post.text).not.toContain('team.finance'); // cc 는 긴급 글에만(한백 11-08)
    expect(post.text).not.toContain('**'); // 굵게는 별 하나 — ** 는 아지트가 글자 그대로 보인다(11-08 · 11-09 시험 글)
    expect(post).toMatchObject({
      total: 101_360_000, batches: 2, blocked: null, title: '26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차',
    });
    expect(agitTitleOf(post.text)).toBe(post.title); // 굵은 「- 공사명 :」을 걷고 공사명
  });

  it('엑셀 캡처 자리 하나 · 첨부 zip 은 글에 없다(진짜 첨부 파일로 붙는다 — 한백 11-09 「첨부파일은 링크가 아니라 첨부파일로」)', () => {
    const post = agitPostOf('2026-11-10', nov10, URL_);
    expect(post.text.split('](올릴 때 붙는 엑셀 캡처)')).toHaveLength(2);
    expect(post.text).not.toMatch(/첨부 파일|\.zip/);
    /* 붙는 zip 의 이름 = 첨부 zip 의 이름 */
    expect(`${agitFolderOf('2026-11-10', ['영업비'])}.zip`).toBe(agitBundleOf('2026-11-10', nov10, payeeOf).zipName);
    expect(agitFolderOf('2026-11-17', ['영업비', '시공비'])).toBe('26년 10월 영업위탁 수수료 및 시공비 11월 17일 지급');
  });

  it('정기결제가 아닌 날은 「지급일」 · 저장한 글의 제목은 공사명(옛 모양의 글도)', () => {
    expect(agitPostOf('2026-11-17', nov10, URL_).text).toContain('# 기한\n> 지급일 11월 17일\n');
    const post = agitPostOf('2026-11-10', nov10, URL_);
    expect(agitTitleOf(post.text)).toBe('26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차');
    expect(agitTitleOf('26년 10월 … 1차 #구매요청간소화\n지급 요청일: …\n1. 구매사유\n- 공사명 : 26년 10월 옛 글\n')).toBe('26년 10월 옛 글');
    expect(agitTitleOf('제목만\n둘째 줄')).toBe('제목만');
  });

  it('이름 짓기 — 25일은 2차 · 1월은 지난해 12월 · 시공비가 섞이면 「및 시공비」 · 정기결제가 아닌 날은 그날', () => {
    expect(requestNameOf('2026-11-25', ['영업비']).subject).toBe('26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 2차');
    expect(requestNameOf('2027-01-10', ['영업비']).subject).toBe('26년 12월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차');
    const both = requestNameOf('2026-11-10', ['영업비', '시공비']);
    expect(both.subject).toBe('26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 및 시공비 1차');
    expect(both.situation).toBe('26년 10월 동안 진행된 전기차 충전기 설치 영업 · 시공에 대한 영업위탁 수수료 및 시공비 1차');
    expect(requestNameOf('2026-11-25', ['시공비']).subject).toBe('26년 10월 전기차 충전 인프라 구축사업 시공비 2차');
    const odd = requestNameOf('2026-11-17', ['영업비']);
    expect(odd).toMatchObject({ round: null, subject: '26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 (11월 17일 지급)' });
    expect(odd.requestDay).toBe('2026. 11. 17 (화요일)');
  });

  it('품목 줄은 글에 없다 — 구매 내역은 엑셀 캡처 그림만(거래처 · 품목명 · 금액은 엑셀에)', () => {
    const post = agitPostOf('2026-11-10', [{ ...nov10[1], invoice: true }], URL_);
    /* 품목 줄 · 현장 수 · 계산서 없음은 글에 없다(한백 11-08 · 11-09, 엑셀에 있다) */
    expect(post.text).not.toMatch(/> - 에코일렉|개 현장|\d기 ·|세금계산서 없음/);
    expect(post.text).toContain('> [에코일렉](');
  });

  it('품목명 — 회차가 섞이면 「 / 」로 잇는다 · 현장 수 · 대수 · 건수는 적지 않는다', () => {
    expect(itemNameOf('시공비', [
      ...lines(2, 3, 100, '2차'), ...lines(3, 4, 100, '1차'), { projectId: 'Pa', label: '회수', amount: -2_800_000, qty: 9 },
      { projectId: 'P1차0', label: '1차', amount: 50, qty: 4 },
    ])).toBe('시공비 1차 / 2차 / 회수');
    expect(itemNameOf('영업비', [])).toBe('영업비');
  });

  it('부가세는 배치마다 10% 절사의 합 — 세금계산서 합과 맞는다', () => {
    expect(vatOf(1_234_567)).toBe(123_456);
    const post = agitPostOf('2026-11-10', [
      { org: 'A', kind: '영업비', total: 15, invoice: false, lines: [] },
      { org: 'B', kind: '영업비', total: 15, invoice: false, lines: [] },
    ], URL_);
    expect(post.text).toContain('> 부가세 전 30\n> 부가세 포함 32\n'); // 1 + 1 (총액 30 의 10% = 3 이 아니다)
  });

  it('올릴 수 없는 결제일 — 지급 0건 · 지급처 미정', () => {
    expect(agitPostOf('2026-11-10', [], URL_).blocked).toBe('지급 0건 — 올릴 것 없음');
    expect(agitPostOf('2026-11-10', [{ ...nov10[0], org: null }], URL_).blocked).toBe('지급처 미정 배치 — 올릴 수 없음');
  });

  it('앞으로 올 결제일만 · 이른 것이 위', () => {
    expect(upcomingPayDates('2026-11-07', ['2026-11-25', '2026-10-25', '2026-11-10', '2026-11-10', '2026-11-07']))
      .toEqual(['2026-11-07', '2026-11-10', '2026-11-25']);
  });

  it('원장 줄의 차례가 달라도 같은 글이다 — 초안과 승인 때 지은 글을 견주는 문이 이것에 기댄다', () => {
    const row = (projectId: string, org: string, amount: number, qty: number): PayoutRow => ({
      entryId: projectId, projectId, projectName: projectId, cpo: '나이스인프라', org, kind: '영업비', label: '1차',
      amount, paidAt: '2026-11-10', note: null, site: { bizTypes: [], termYears: [], powerTypes: [], qty },
    });
    const rows = [row('a', '에코일렉', 910_000, 1), row('b', '에코일렉', 1_820_000, 2), row('c', '갑', 100, 1), row('d', '에코일렉', 1, 0)];
    const one = agitDraftsOf('2026-11-07', rows, [], [], URL_);
    const two = agitDraftsOf('2026-11-07', [...rows].reverse(), [], [], URL_);
    expect(one.map((d) => d.text)).toEqual(two.map((d) => d.text));
    expect(one[0].text).toContain('> 부가세 전 2,730,101\n');
    expect(agitDraftsOf('2026-11-11', rows, [], [], URL_)).toEqual([]); // 지난 결제일은 없다
    expect(agitDraftsOf('2026-11-11', rows, [], [], URL_, '2026-11-10')).toHaveLength(1); // 고르면 지난 날도
  });

  it('올린 뒤 정산 담당 대화의 한 줄 — 구분을 말한다', () => {
    expect(agitPostedSay({ payDate: '2026-11-10', kind: '영업비', title: 'T', total: 101_360_000, batches: 2 }, '김정우'))
      .toBe('11월 10일 정기결제 영업비 열린구매 글을 아지트에 올렸습니다 — 지급 2건 · 공급가액 101,360,000원 (승인 김정우).\nT');
    expect(agitPostedSay({ payDate: '2026-11-10', kind: '시공비', title: 'T', total: 1, batches: 1, urgent: '사유' }, '김정우'))
      .toMatch(/^11월 10일 정기결제 시공비 열린구매 긴급 글을 아지트에 올렸습니다 — /);
  });
});

describe('시공비는 따로 올린다 — 같은 모양 · 말만 시공비 (한백 2026-11-09 「seperate post … 영업위탁수수료 -> 시공비」)', () => {
  const cons: AgitBatch[] = [
    { org: '대상전력', kind: '시공비', total: 9_545_000, invoice: true, lines: lines(1, 4, 9_545_000) },
    { org: '에코일렉', kind: '시공비', total: 12_000_000, invoice: false, lines: [...lines(2, 3, 5_000_000), ...lines(1, 2, 2_000_000, '2차')] },
  ];

  it('시공비 글 — 영업비 글과 같은 줄 · 말만 「시공비」 · 거래명세서 고리는 kind=시공비', () => {
    const post = agitPostOf('2026-11-10', cons, URL_);
    expect(post.kind).toBe('시공비');
    expect(post.title).toBe('26년 10월 전기차 충전 인프라 구축사업 시공비 1차');
    const sales = agitPostOf('2026-11-10', nov10, URL_).text.split('\n');
    const text = post.text.split('\n');
    /* 줄의 모양이 같다 — 머리 · 상자 · 그림 자리가 같은 차례 */
    const shape = (ls: string[]) => ls.map((l) => l.replace(/^(#+ |> |!\[)?.*$/, '$1')).slice(0, 11);
    expect(shape(text)).toEqual(shape(sales));
    expect(text.slice(0, 11)).toEqual([
      '#구매요청간소화',
      '# 배경',
      '> *- 공사명 :* 26년 10월 전기차 충전 인프라 구축사업 시공비 1차',
      '> *- 상황설명 :* 26년 10월 동안 진행된 전기차 충전기 설치 시공에 대한 시공비 1차',
      '# 구매 내역',
      '![구매요청간소화 엑셀](올릴 때 붙는 엑셀 캡처)',
      '# 기한',
      '> 정기결제일 11월 10일',
      '# *청구 금액*',
      '> 부가세 전 21,545,000',
      '> 부가세 포함 23,699,500',
    ]);
    expect(post.text).not.toContain('영업위탁');
    expect(post.text).toContain(`> [대상전력](${URL_}/payments/statement?org=${encodeURIComponent('대상전력')}&date=2026-11-10&kind=${encodeURIComponent('시공비')})`);
  });

  it('긴급 시공비 글도 말만 시공비', () => {
    const post = agitPostOf('2026-11-25', cons, URL_, '세금계산서 늦음');
    expect(post.text.split('\n')[0]).toBe(`# [긴급] 26년 10월 전기차 충전 인프라 구축사업 시공비 2차 ${AGIT_URGENT_TAG}`);
    expect(post.text).not.toContain('영업위탁');
  });

  it('한 글에 두 구분이 섞이면 짓지 않는다 · 배치가 없으면 준 구분의 「지급 0건」 글', () => {
    expect(() => agitPostOf('2026-11-10', [...nov10, ...cons], URL_)).toThrow('다른 구분의 배치가 섞였습니다');
    const none = agitPostOf('2026-11-10', [], URL_, null, '시공비');
    expect(none).toMatchObject({ kind: '시공비', blocked: '지급 0건 — 올릴 것 없음', title: '26년 10월 전기차 충전 인프라 구축사업 시공비 1차' });
  });

  it('결제일마다 구분마다 한 글 — 영업비 먼저 · 첨부 zip 도 구분마다', () => {
    const row = (projectId: string, org: string, kind: '영업비' | '시공비', amount: number, paidAt = '2026-11-10'): PayoutRow => ({
      entryId: projectId, projectId, projectName: projectId, cpo: '나이스인프라', org, kind, label: '1차',
      amount, paidAt, note: null, site: { bizTypes: [], termYears: [], powerTypes: [], qty: 1 },
    });
    const rows = [
      row('c1', '대상전력', '시공비', 9_545_000), row('s1', '에코일렉', '영업비', 2_800_000), row('c2', '에코일렉', '시공비', 1_000),
      row('s2', '에코일렉', '영업비', 1_000, '2026-11-25'),
    ];
    const drafts = agitDraftsOf('2026-11-07', rows, [], [], URL_);
    expect(drafts.map((d) => [d.payDate, d.kind, d.total])).toEqual([
      ['2026-11-10', '영업비', 2_800_000], ['2026-11-10', '시공비', 9_546_000], ['2026-11-25', '영업비', 1_000],
    ]);
    expect(agitDraftsOf('2026-11-07', rows, [], [], URL_, '2026-11-10', '시공비').map((d) => d.kind)).toEqual(['시공비']);
    /* 배치가 하나도 없는 날은 영업비 「지급 0건」 글 하나 */
    expect(agitDraftsOf('2026-11-07', rows, [], [], URL_, '2026-12-10').map((d) => [d.kind, d.blocked]))
      .toEqual([['영업비', '지급 0건 — 올릴 것 없음']]);
    expect(agitKindsOn([])).toEqual(['영업비']);
    expect(agitKindsOn([{ kind: '시공비' }, { kind: '영업비' }])).toEqual(['영업비', '시공비']);
    expect(agitBatchesOf(rows, [], [], '2026-11-10', '시공비').map((b) => b.org)).toEqual(['대상전력', '에코일렉']);
    /* zip — 시공비 글의 zip 은 시공비 이름 · 시공비 거래명세서만 */
    const plan = agitBundleOf('2026-11-10', cons, payeeOf);
    expect(plan.zipName).toBe('26년 10월 시공비 1차.zip');
    expect(plan.statements.map((x) => x.path).every((x) => x.includes(`kind=${encodeURIComponent('시공비')}`))).toBe(true);
    expect(agitKindOf('시공비')).toBe('시공비');
    expect(agitKindOf('무엇')).toBe('영업비');
  });

  it('시공비 엑셀 — 같은 틀 · 공사명 · 내용 · 머리의 「영업위탁수수료」 자리가 「시공비」', async () => {
    const plan = agitBundleOf('2026-11-10', cons, payeeOf, '2026-11-08');
    expect(plan.xlsxName).toBe('구매요청간소화_전기차충전기 시공비(26년 10월 1차 내역).xlsx');
    expect(plan.sheet.rows.map((r) => r.content)).toEqual([
      '26년 10월 전기차 충전 인프라 구축사업 (시공비 1차)', '26년 10월 전기차 충전 인프라 구축사업 (시공비 1차 / 2차)',
    ]);
    const xml = await (await JSZip.loadAsync(await purchaseXlsx(plan.sheet, TEMPLATE))).file('xl/worksheets/sheet1.xml')!.async('string');
    const cell = cellOf(xml);
    expect(cell('D6')).toContain('26년 10월 전기차 충전 인프라 구축사업 시공비 1차');
    expect(cell('I5')).toContain(' 전기차 충전 인프라 구축사업 시공비');
    expect(xml).not.toContain('영업위탁');
  });
});

describe('긴급 글 — 한백의 긴급구매요청 글 그대로 (2026-11-09 「긴급에 대한 템플릿도 따로 만들어줘」 · 26년 9월 1차 · 2차)', () => {
  const ECO_LINK = `${URL_}/payments/statement?org=${encodeURIComponent('에코일렉')}&date=2026-11-10&kind=${encodeURIComponent('영업비')}`;
  const REASON = '세금계산서 발행 지연으로 늦은 상신';
  /* 제목 끝의 해시태그는 찾기 고리 — 한백의 긴급 글이 그랬다(그냥 #… 은 아지트가 작은 초록 해시태그로 그렸다, 11-09 시험 글) */
  const TAG = '[#긴급구매요청](https://team-hanbaek.agit.io/search?q=%23%EA%B8%B4%EA%B8%89%EA%B5%AC%EB%A7%A4%EC%9A%94%EC%B2%AD)';

  it('줄마다 한백의 긴급 글과 같은 꼴 — 굵게는 별 하나(*) · 엑셀 캡처는 지급요청 품목 상자 안 · 끝에 cc 재무팀', () => {
    const post = agitPostOf('2026-11-10', nov10, URL_, REASON);
    expect(post.text).toBe([
      `# [긴급] 26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차 ${TAG}`,
      '> *지급 요청일: [긴급] 2026. 11. 10 (화요일)*',
      '*1. 구매사유*',
      '> *- 공사명 :* 26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차',
      '> *- 상황설명 :* 26년 10월 동안 진행된 전기차 충전기 설치 영업에 대한 영업위탁 수수료 1차',
      '*2. 지급요청 품목*',
      '> *부가세 전* 101,360,000 / *부가세 포함* 111,496,000',
      '> ![구매요청간소화 엑셀](올릴 때 붙는 엑셀 캡처)',
      '*3. 긴급사유 기재*',
      `> ${REASON}`,
      '# 참고자료',
      '> 거래명세서 내역',
      `> [에코일렉](${ECO_LINK})`,
      `> [이브이솔루션 (영업)](${URL_}/payments/statement?org=${encodeURIComponent('이브이솔루션 ')}%28${encodeURIComponent('영업')}%29&date=2026-11-10&kind=${encodeURIComponent('영업비')})`,
      `cc ${AGIT_CC}`,
    ].join('\n'));
    expect(AGIT_CC).toBe('[@@team.finance](https://team-hanbaek.agit.io/parties/13215)'); // 쓰는 칸의 멘션 고르기가 넣은 지금 팀 주소(11-09)
    expect(AGIT_URGENT_TAG).toBe(TAG); // 한백의 긴급 글이 건 찾기 주소 그대로
    expect(post.text).not.toContain('**'); // 아지트는 ** 를 글자 그대로 보인다(11-09 시험 글)
    expect(post.text).not.toContain('123-45-6789');
    expect(post).toMatchObject({
      urgent: REASON, total: 101_360_000, batches: 2, blocked: null, title: '26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차',
    });
    expect(agitTitleOf(post.text)).toBe(post.title); // 굵게(*)를 걷고 공사명
  });

  it('사유를 다듬는다 — 앞의 > · # · 빈칸을 걷고 빈 줄은 빼고 다섯 줄 · 300자까지 · 비면 보통 글', () => {
    expect(urgentReasonOf(null)).toBeNull();
    expect(urgentReasonOf('  \n \n')).toBeNull();
    expect(urgentReasonOf('> # 세금계산서   지연\n\n  - 협력사 업무 지연 ')).toBe('세금계산서 지연\n- 협력사 업무 지연');
    expect(urgentReasonOf('1\n2\n3\n4\n5\n6')?.split('\n')).toHaveLength(5);
    expect(urgentReasonOf('가'.repeat(400))).toHaveLength(AGIT_URGENT_MAX);
    const two = agitPostOf('2026-11-10', nov10, URL_, '첫 줄\n둘째 줄');
    expect(two.text).toContain('*3. 긴급사유 기재*\n> 첫 줄\n> 둘째 줄\n# 참고자료');
    /* 빈 사유는 보통 글 — 모양이 하나도 섞이지 않는다 */
    expect(agitPostOf('2026-11-10', nov10, URL_, '  ')).toEqual(agitPostOf('2026-11-10', nov10, URL_));
    expect(agitPostOf('2026-11-10', nov10, URL_).urgent).toBeNull();
  });

  it('정기결제가 아닌 날 · 2차 — 제목 · 지급 요청일이 그날이다', () => {
    const odd = agitPostOf('2026-11-17', nov10, URL_, REASON).text;
    expect(odd.split('\n')[0]).toBe(`# [긴급] 26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 (11월 17일 지급) ${TAG}`);
    expect(odd).toContain('> *지급 요청일: [긴급] 2026. 11. 17 (화요일)*');
    expect(agitPostOf('2026-11-25', nov10, URL_, REASON).text.split('\n')[0]).toBe(`# [긴급] 26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 2차 ${TAG}`);
  });

  it('엑셀 캡처 자리는 지급요청 품목 상자 안 · 글양식은 긴급구매요청', () => {
    const text = agitPostOf('2026-11-10', nov10, URL_, REASON).text;
    expect(text).toContain('> *부가세 전* 101,360,000 / *부가세 포함* 111,496,000\n> ![구매요청간소화 엑셀](올릴 때 붙는 엑셀 캡처)\n*3. 긴급사유 기재*');
    expect(text).not.toMatch(/첨부 파일|\.zip/);
    expect(agitTemplateOf(REASON)).toBe('긴급구매요청');
    expect(agitTemplateOf(null)).toBe('구매요청간소화');
  });
});

describe('첨부 zip — 한백이 올려 온 zip 모양 (26년 9월 2차)', () => {
  it('이름 · 폴더 · 엑셀 줄 · 거래명세서 경로 · 계산서 — 계좌는 엑셀에', () => {
    const plan = agitBundleOf('2026-11-10', [
      { ...nov10[1], invoice: true, invoiceFile: { url: 'https://x.public.blob.vercel-storage.com/inv/a.PDF', name: '계산서.PDF' } },
      nov10[0],
    ], payeeOf);
    expect(plan.zipName).toBe('26년 10월 영업위탁 수수료 1차.zip');
    expect(plan.folder).toBe('26년 10월 영업위탁 수수료 1차');
    expect(plan.xlsxName).toBe('구매요청간소화_전기차충전기 영업위탁수수료(26년 10월 1차 내역).xlsx');
    expect(plan.sheet.subject).toBe('26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차');
    expect(plan.sheet.rows[0]).toEqual({
      content: '26년 10월 전기차 충전 인프라 구축사업 (영업비 1차)', org: '에코일렉',
      supply: 96_460_000, vat: 9_646_000, bank: '국민은행', account: '123-45-6789', holder: '에코일렉', note: '',
    });
    expect(plan.sheet.rows[1]).toMatchObject({ org: '이브이솔루션 (영업)', bank: '', note: '세금계산서 없음' });
    expect(plan.statements).toEqual([
      { name: '에코일렉_거래명세서.pdf', path: `/payments/statement?org=${encodeURIComponent('에코일렉')}&date=2026-11-10&kind=${encodeURIComponent('영업비')}` },
      { name: '이브이솔루션 (영업)_거래명세서.pdf', path: expect.stringContaining('/payments/statement?org=') },
    ]);
    expect(plan.invoices).toEqual([{ name: '에코일렉_세금계산서.pdf', url: 'https://x.public.blob.vercel-storage.com/inv/a.PDF' }]);
  });

  it('같은 지급처가 둘이면 이름에 구분 · 파일 이름에 못 쓰는 글자는 걷는다', () => {
    const plan = agitBundleOf('2026-11-25', [
      { org: 'A/B', kind: '영업비', total: 1, invoice: false, lines: [] },
      { org: 'A/B', kind: '시공비', total: 1, invoice: false, lines: [] },
    ], payeeOf);
    expect(plan.zipName).toBe('26년 10월 영업위탁 수수료 및 시공비 2차.zip');
    expect(plan.statements.map((s) => s.name)).toEqual(['A B_영업비_거래명세서.pdf', 'A B_시공비_거래명세서.pdf']);
    expect(safeName('a:b*c?"d<e>f|g')).toBe('a b c d e f g');
  });

  it('구매요청간소화 엑셀 — 한백이 쓰던 엑셀(틀)에 값만 채운다 · 소계 · 특기 사항이 지급 줄 바로 밑으로 온다', async () => {
    const plan = agitBundleOf('2026-11-10', nov10, payeeOf, '2026-11-08');
    const zip = await JSZip.loadAsync(await purchaseXlsx(plan.sheet, TEMPLATE));
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    expect(wb).toContain('name="구매(일반)"');
    expect(wb).toContain('name="거래처정보"');
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    const cell = cellOf(xml);
    /* 머리 — 틀의 칸 모양(s)은 그대로 · 공사명 · 해 · 구매번호 수식의 값 · =NOW() 의 값 */
    expect(cell('D6')).toContain('26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차');
    expect(cell('I5')).toContain(' 전기차 충전 인프라 구축사업 영업위탁수수료');
    expect(cell('E4')).toBe('<c r="E4" s="9"><v>2026</v></c>');
    expect(cell('F5')).toContain('<f>D5&amp;E4&amp;"-"&amp;F4&amp;"-"&amp;G4</f><v>요청간2026--</v>');
    expect(cell('M6')).toBe('<c r="M6" s="89"><f ca="1">NOW()</f><v>46334</v></c>');
    /* 지급 줄 — 지급처 가나다(에코일렉 → 이브이솔루션), 8행의 칸 모양 그대로 · 세액 · 입금액은 틀의 수식 */
    expect(cell('C8')).toBe('<c r="C8" s="35"><v>1</v></c>');
    expect(cell('E8')).toContain('에코일렉');
    expect(cell('F8')).toBe('<c r="F8" s="59"><v>96460000</v></c>');
    expect(cell('G8')).toBe('<c r="G8" s="60"><f>F8*0.1</f><v>9646000</v></c>');
    expect(cell('H8')).toBe('<c r="H8" s="61"><f>SUM(F8:G8)</f><v>106106000</v></c>');
    expect(cell('I8')).toContain('국민은행');
    expect(cell('J8')).toContain('123-45-6789');
    expect(cell('M8')).toContain('㈜한백');
    expect(cell('N8')).toContain('세금계산서 없음');
    expect(cell('E9')).toContain('이브이솔루션 (영업)');
    expect(cell('I9')).toContain('<t xml:space="preserve">-</t>'); // 협력사 정보에 계좌가 없으면 「-」(틀의 IFERROR 와 같은 말)
    /* 소계 — 두 줄이면 10행 · 수식은 지급 줄까지 */
    expect(cell('C10')).toContain('소 계');
    expect(cell('F10')).toBe('<c r="F10" s="42"><f>SUM(F8:F9)</f><v>101360000</v></c>');
    expect(cell('G10')).toBe('<c r="G10" s="42"><f>SUM(G8:G9)</f><v>10136000</v></c>');
    expect(cell('H10')).toBe('<c r="H10" s="43"><f>SUM(F10:G10)</f><v>111496000</v></c>');
    expect(xml).toContain('<mergeCell ref="C10:E10"/>');
    expect(xml).toContain('<mergeCell ref="C11:E12"/>'); // 특기 사항
    expect(xml).toContain('<mergeCell ref="D6:G6"/>'); // 머리의 합친 칸은 그대로
    expect(xml).toContain('<conditionalFormatting sqref="M8:M9">'); // 입금처 색
    expect(xml).toContain('<dimension ref="A1:Z12"/>');
    expect([...xml.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    /* 거래처정보 — 그 결제일의 지급처 */
    const partners = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect(cellOf(partners)('B3')).toContain('에코일렉');
    expect(cellOf(partners)('D3')).toContain('123-45-6789');
    expect(cellOf(partners)('B4')).toContain('이브이솔루션 (영업)');
    expect(partners).toContain('<dimension ref="A2:F4"/>');
  });

  it('틀의 지급 줄(6)보다 많으면 줄을 넣는다 — 소계 · 특기 사항 · 합친 칸 · 조건부 서식이 밀린다', async () => {
    const many = Array.from({ length: 8 }, (_, i): AgitBatch => ({
      org: `협력사${String.fromCharCode(65 + i)}`, kind: '영업비', total: 1_000 * (i + 1), invoice: true, lines: lines(1, 1, 1_000 * (i + 1)),
    }));
    const plan = agitBundleOf('2026-11-25', many, payeeOf, '2026-11-20');
    const xml = await (await JSZip.loadAsync(await purchaseXlsx(plan.sheet, TEMPLATE))).file('xl/worksheets/sheet1.xml')!.async('string');
    const cell = cellOf(xml);
    expect(cell('C15')).toBe('<c r="C15" s="35"><v>8</v></c>');
    expect(cell('C16')).toContain('소 계');
    expect(cell('F16')).toBe('<c r="F16" s="42"><f>SUM(F8:F15)</f><v>36000</v></c>');
    expect(cell('H16')).toContain('<f>SUM(F16:G16)</f>');
    expect(cell('C17')).toContain('특기 사항');
    for (const m of ['C16:E16', 'I16:J16', 'L16:N16', 'C17:E18', 'F17:N17', 'F18:N18', 'E3:G3']) expect(xml).toContain(`<mergeCell ref="${m}"/>`);
    expect(xml).toContain('<conditionalFormatting sqref="M8:M15">');
    expect(xml).toContain('<dimension ref="A1:Z18"/>');
    expect(cell('N8')).toBe('<c r="N8" s="41"/>'); // 계산서가 붙었으면 비고는 빈칸
  });

  it('엑셀 틀은 값이 걷힌 것이다 — 저장소가 공개라 지난 계좌 · 이름 · 경로 · 바깥 연결이 없다', async () => {
    const zip = await JSZip.loadAsync(TEMPLATE);
    const parts = Object.keys(zip.files);
    expect(parts.filter((p) => /sharedStrings|externalLink|calcChain/.test(p))).toEqual([]);
    const all = (await Promise.all(parts.filter((p) => !zip.files[p].dir).map((p) => zip.file(p)!.async('string')))).join('\n');
    const scan = all.replace(/\{[0-9A-Fa-f-]{36}\}/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '');
    expect(scan).not.toMatch(/\d{2,6}-\d{2,6}-\d{2,8}|01[016789]-?\d{3,4}-?\d{4}|file:\/\/|Users\/|Downloads|[A-Z]:\//);
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    expect(wb).not.toMatch(/definedName|externalReference|absPath/);
    expect(wb).toContain('fullCalcOnLoad="1"');
    expect(await zip.file('docProps/core.xml')!.async('string')).toContain('<dc:creator>한백</dc:creator>');
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect([...sheet.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16]);
    expect(/<row r="8"[^>]*>([\s\S]*?)<\/row>/.exec(sheet)![1]).not.toMatch(/<v>|<is>|<f>/); // 지급 줄의 본은 모양만
    const partners = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect([...partners.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]))).toEqual([2, 3]);
  });

  it('zip 안 — 한 폴더에 엑셀 · 거래명세서 · 계산서 · 우리 Blob 이 아닌 계산서 주소는 거절', async () => {
    const plan = agitBundleOf('2026-11-10', [
      { ...nov10[1], invoice: true, invoiceFile: { url: 'https://x.public.blob.vercel-storage.com/inv/a.pdf', name: 'a.pdf' } },
    ], payeeOf);
    const render = vi.fn(async ({ paths }: { paths: string[]; html: string }) => ({
      pdfs: paths.map(() => new Uint8Array([37, 80, 68, 70])), image: new Uint8Array([137, 80, 78, 71]),
    }));
    const file = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const zip = await JSZip.loadAsync(await agitZipOf(plan, { render, file }));
    expect(Object.keys(zip.files).sort()).toEqual([
      '26년 10월 영업위탁 수수료 1차/',
      '26년 10월 영업위탁 수수료 1차/구매요청간소화_전기차충전기 영업위탁수수료(26년 10월 1차 내역).png',
      '26년 10월 영업위탁 수수료 1차/구매요청간소화_전기차충전기 영업위탁수수료(26년 10월 1차 내역).xlsx',
      '26년 10월 영업위탁 수수료 1차/에코일렉_거래명세서.pdf',
      '26년 10월 영업위탁 수수료 1차/에코일렉_세금계산서.pdf',
    ]);
    expect(render.mock.calls[0][0].paths).toEqual([plan.statements[0].path]);
    expect(render.mock.calls[0][0].html).toContain('26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차');
    const evil = { ...plan, invoices: [{ name: 'x.pdf', url: 'https://evil.com/x.pdf' }] };
    await expect(agitZipOf(evil, { render, file })).rejects.toThrow(/콘솔 저장소가 아닙니다/);
  });

  it('엑셀 캡처 — 채운 엑셀 그대로(5행 구분부터 소계까지 · 합친 칸 · 숫자 꼴 · 모양) · 글자는 HTML 로 막는다', async () => {
    const plan = agitBundleOf('2026-11-10', nov10, payeeOf, '2026-11-08');
    const html = await purchaseHtml(await purchaseXlsx({ ...plan.sheet, subject: '공사 <b>' }, TEMPLATE));
    expect(html).toContain('id="sheet"');
    expect(html).toContain('공사 &lt;b&gt;');
    for (const t of ['구분', '요청간', '구매번호', '요청간2026--', '96,460,000', '106,106,000', '111,496,000', '㈜한백', '소 계', '필수사항', '2026-11-08', '4月']) {
      expect(html, t).toContain(t);
    }
    expect(html).not.toContain('특기 사항'); // 지난 캡처처럼 소계 줄까지
    expect(html).not.toContain('해당셀 클릭후'); // 위 안내 줄(2~4행)도 빠진다
    expect(html).toContain('colspan="3"'); // 소 계(C:E)
    expect(html).toContain('background:#fef2cb'); // 요청간 · 입금처의 노란 칸
    expect(html).toContain('border-left:1px solid #000000'); // 바깥 테두리(thin)
    expect(html).toContain('1px dotted #000000'); // 안쪽 테두리(hair)
    expect(html).toContain("'Noto Sans KR'"); // 한자(4月)를 받칠 글꼴 — 서버에는 없다
  });

  it('숫자 꼴 — 회계 꼴(쉼표 · 0 은 -) · 「General"月"」 · 날짜', () => {
    const acct = '_-* #,##0_-;\\-* #,##0_-;_-* \\-_-;_-@';
    expect(formatNumber(96_460_000, acct)).toEqual({ text: ' 96,460,000 ', fill: true });
    expect(formatNumber(-2_800_000, acct)).toEqual({ text: '-2,800,000 ', fill: true });
    expect(formatNumber(0, acct)).toEqual({ text: ' - ', fill: true });
    expect(formatNumber(47_820.5, '#,##0').text).toBe('47,821');
    expect(formatNumber(4, 'General"月"').text).toBe('4月');
    expect(formatNumber(46334, 'yyyy\\-mm\\-dd').text).toBe('2026-11-08');
    expect(formatNumber(12.5, 'General').text).toBe('12.5');
  });

  it('쿠키 머리 — 이름 · 값 쌍만', () => {
    expect(cookiePairs('a=1; hb_session=x.y=z ; =bad; b=')).toEqual([
      { name: 'a', value: '1' }, { name: 'hb_session', value: 'x.y=z' }, { name: 'b', value: '' },
    ]);
    expect(cookiePairs(null)).toEqual([]);
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

  it('담당자를 보이는 글', () => {
    expect(assigneesLabel(['kiko.x', 'ella.a'])).toBe('@kiko.x · @ella.a');
  });
});

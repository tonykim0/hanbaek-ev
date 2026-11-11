/**
 * 플러그링크 위탁운영수수료 글(lib/agit/fee · fee-read · editor-doc · purchase-xlsx) — 한백 2026-11-10 「이것도 글도 매월말에 반복되는 상신인데
 * 자동화시키고싶어」 → 「내가 에이전트한테 세금계산서를 올려주고 너가 나머지를 처리해주는 방식으로」.
 * 모양은 한백의 26년 10월 29일 글(5차)의 뼈대다. ★금액 · 계좌는 지어낸 것이다★ — 실제 세금계산서 값 · 플러그링크 계좌는 공개 저장소에 적지
 * 않는다(그 글과의 대조는 스크래치에서만 했다).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  agitFeeBundleOf, agitFeePayeeOf, agitFeePostOf, feeInDateOf, feeInvoicesOf, feeMonthName, feePayDateOf, feePayeeLabel, feeRemindDue,
  feeRemindKey, feeRemindPlan, feeRoundOf, FEE_URGENT_REASON, type AgitFeeInput, type TaxInvoiceRead,
} from '@/lib/agit/fee';
import { agitBundleOf } from '@/lib/agit/bundle';
import type { AgitBatch } from '@/lib/agit/post';
import { taxInvoiceReadOf } from '@/lib/agit/fee-read';
import { AGIT_CC, AGIT_FEE_KIND, AGIT_URGENT_TAG, agitKindOf, agitPostedSay, agitPostName, agitTemplateOf, agitTitleOf } from '@/lib/agit/post';
import { agitEditorDocOf, CC_MARK, gapMarkOf, IMG_MARK } from '@/lib/agit/editor-doc';
import { purchaseXlsx } from '@/lib/agit/purchase-xlsx';

const TEMPLATE = new Uint8Array(readFileSync('lib/agit/purchase-template.xlsx'));
const FILE = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/f.pdf', name: '플링비즈_26년 9월분.pdf' };
const SALES_FILE = { url: 'https://x.public.blob.vercel-storage.com/agent-files/settlement/s.pdf', name: '충전매출 (26년 9월).pdf' };

/** 지어낸 9월분 — 세액이 10% 절사와 1원 다른 충전매출(실제로 있었던 꼴) */
const SEPT: AgitFeeInput = {
  month: '2026-09',
  round: 5,
  fee: { supply: 12_345_678, vat: 1_234_567, total: 13_580_245, file: FILE },
  sales: { supply: 5_432_105, vat: 543_211, total: 5_975_316, inDate: '2026-10-29', file: SALES_FILE },
};

const read = (over: Partial<TaxInvoiceRead>): TaxInvoiceRead => ({
  supplier: '주식회사 플러그링크', receiver: '(주)한백', issued: '2026-10-01', supply: 12_345_678, vat: 1_234_567, total: 13_580_245,
  item: '전기요금, 플링비즈 위탁운영 비용, 법정정기검사 수수료 9월분', month: '2026-09', ...over,
});
const salesRead = (over: Partial<TaxInvoiceRead> = {}): TaxInvoiceRead => read({
  supplier: '(주)한백', receiver: '주식회사 플러그링크', supply: 5_432_105, vat: 543_211, total: 5_975_316, item: '충전매출 9월분', ...over,
});

describe('차 · 지급 요청일', () => {
  it('1차가 26년 1~5월분이고 그 뒤로 달마다 — 지급은 다음 달 말일(쉬는 날이면 앞 영업일)', () => {
    expect(feeRoundOf('2026-06')).toBe(2);
    expect(feeRoundOf('2026-09')).toBe(5);
    expect(feeRoundOf('2026-10')).toBe(6);
    expect(feeRoundOf('2027-01')).toBe(9);
    expect(feePayDateOf('2026-06')).toBe('2026-07-31');
    expect(feePayDateOf('2026-09')).toBe('2026-10-30');   // 10-31 토요일
    expect(feePayDateOf('2026-10')).toBe('2026-11-30');
    expect(feePayDateOf('2026-12')).toBe('2027-01-29');   // 1-31 일요일
    expect(feeMonthName('2026-09')).toBe('26년 9월분');
  });
});

describe('글 — 한백의 5차 글의 뼈대', () => {
  const post = agitFeePostOf('2026-10-30', SEPT);

  it('긴급구매요청 · 제목 · 지급 요청일 · 두 표 · 구매 내역 · 긴급사유 · cc 재무팀', () => {
    expect(post.kind).toBe(AGIT_FEE_KIND);
    expect(post.urgent).toBe(FEE_URGENT_REASON);
    expect(agitTemplateOf(post.urgent)).toBe('긴급구매요청');
    expect(post.title).toBe('플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 5차');
    expect(post.total).toBe(12_345_678);
    expect(post.blocked).toBeNull();
    expect(post.text.split('\n')).toEqual([
      `# [긴급] 플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 5차 ${AGIT_URGENT_TAG}`,
      '> *지급 요청일: [긴급]2026. 10. 30 (금)*',
      '## 지급요청 항목',
      '> *배경 :*',
      '> - [플러그링크 자산양수도 및 CSMS 라이센스 취득 계약](https://team-hanbaek.agit.io/g/300450579/wall/358905929)을 진행',
      '> - 플러그링크의 충전기 자산을 인수하며 충전기 운영을 플러그링크측에 대행',
      '> - 그러나 인수한 충전기의 이용률이 낮아 충전기에서 발생되는 매출보다 비용이 높음',
      '> - 이 적자를 플러그링크에 수수료 명목으로 보전, 한백이 보유하는 플러그링크 잉여금의 일부를 계속 처분 할 예정',
      '>',
      '> 플러그링크 > 한백: 충전매출',
      '> 공급가액    부가세    합계',
      '> 5,432,105    543,211    5,975,316 > 10월 29일 입금 예정',
      '>',
      '> 한백 > 플러그링크: 위탁운영수수료',
      '> 공급가액    부가세    합계',
      '> 12,345,678    1,234,567    13,580,245 > 10월 30일 지급 필요',
      '## 구매 내역',
      '## *부가세 전* 12,345,678*원 / 부가세 포함* 13,580,245*원*',
      '![구매요청간소화 엑셀](올릴 때 붙는 엑셀 캡처)',
      '## *긴급사유 기재*',
      '> 매월 말 진행되는 플러그링크 Mother EPC 거래의 일부',
      `cc ${AGIT_CC}`,
    ]);
  });

  it('입금 예정일을 모르면 「입금 예정」만 · 충전매출이 없는 달이면 그 표째 빠진다', () => {
    const noDate = agitFeePostOf('2026-10-30', { ...SEPT, sales: { ...SEPT.sales!, inDate: null } }).text;
    expect(noDate).toContain('> 5,432,105    543,211    5,975,316 > 입금 예정\n');
    const none = agitFeePostOf('2026-10-30', { ...SEPT, sales: null }).text;
    expect(none).not.toContain('충전매출');
    expect(none).toContain('계속 처분 할 예정\n>\n> 한백 > 플러그링크: 위탁운영수수료');
  });

  it('제목 · 이름 · 올렸다는 말 — 공사명 줄이 없어도 제목을 쓴다 · 건수를 말하지 않는다', () => {
    expect(agitTitleOf(post.text)).toBe('플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 5차');
    expect(agitPostName({ payDate: '2026-10-30', kind: AGIT_FEE_KIND })).toBe('10월 30일 위탁운영수수료');
    expect(agitKindOf('위탁운영수수료')).toBe(AGIT_FEE_KIND);
    const said = agitPostedSay({ ...post, urgent: post.urgent }, '한백 관리자');
    expect(said).toBe('10월 30일 위탁운영수수료 열린구매 긴급 글을 아지트에 올렸습니다 — 공급가액 12,345,678원 (승인 한백 관리자).\n'
      + '플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 5차');
  });

  it('쓰는 칸 HTML — h1 하나 · h2 넷 · 상자 셋 · 상자 안 빈 줄 · 표의 빈칸은 자리 표(붙인 뒤 쳐 넣는다) · 그림 자리 · cc 멘션 자리', () => {
    const doc = agitEditorDocOf(post.text);
    expect(doc.image).toBe(true);
    expect(doc.cc).toBe('team.finance');
    expect(doc.html.match(/<h1>/g)).toHaveLength(1);
    expect(doc.html.match(/<h2>/g)).toHaveLength(4);
    expect(doc.html.match(/<blockquote>/g)).toHaveLength(3);
    expect(doc.html).toContain('<h2><strong>부가세 전</strong> 12,345,678<strong>원 / 부가세 포함</strong> 13,580,245<strong>원</strong></h2>');
    expect(doc.html).toContain('<h2><strong>긴급사유 기재</strong></h2>');
    expect(doc.html).toContain('<p></p><p>플러그링크 &gt; 한백: 충전매출</p>');
    /* 아지트 쓰는 칸은 붙여 넣은 빈칸을 다 하나로 접는다(11-10 쓰는 칸에서 견줌) — 자리 표로 붙이고 빈칸은 쳐 넣는다(compose putGaps) */
    expect(doc.html).toContain(`<p>공급가액${gapMarkOf(4)}부가세${gapMarkOf(4)}합계</p>`);
    expect(doc.html).toContain(`<p>12,345,678${gapMarkOf(4)}1,234,567${gapMarkOf(4)}13,580,245 &gt; 10월 30일 지급 필요</p>`);
    expect(doc.html).not.toContain('  ');
    expect(doc.html).toContain('<a href="https://team-hanbaek.agit.io/g/300450579/wall/358905929">플러그링크 자산양수도 및 CSMS 라이센스 취득 계약</a>을 진행');
    expect(doc.html).toContain(`<p>${IMG_MARK}</p><h2><strong>긴급사유 기재</strong></h2>`);
    expect(doc.html.endsWith(`<p>cc ${CC_MARK}</p>`)).toBe(true);
  });
});

describe('세금계산서 두 장 가르기', () => {
  it('플러그링크 → 한백이 위탁운영수수료 · 한백 → 플러그링크가 충전매출 — 달 · 금액을 준다', () => {
    expect(feeInvoicesOf(read({}), salesRead())).toEqual({
      month: '2026-09',
      fee: { supply: 12_345_678, vat: 1_234_567, total: 13_580_245 },
      sales: { supply: 5_432_105, vat: 543_211, total: 5_975_316 },
    });
    expect(feeInvoicesOf(read({}), null).sales).toBeNull();
  });

  it('바뀌어 왔으면 · 다른 회사면 · 금액 셈이 틀리면 · 세액이 10% 와 멀면 짓지 않는다', () => {
    expect(() => feeInvoicesOf(salesRead(), read({}))).toThrow('두 파일을 바꿔 주세요');
    expect(() => feeInvoicesOf(read({ supplier: '에코일렉' }), null)).toThrow('위탁운영수수료 세금계산서가 아닙니다(에코일렉 → (주)한백)');
    expect(() => feeInvoicesOf(read({}), read({}))).toThrow('충전매출 세금계산서가 아닙니다');
    expect(() => feeInvoicesOf(read({ total: 13_580_246 }), null)).toThrow('금액이 맞지 않습니다');
    expect(() => feeInvoicesOf(read({ vat: 1_234_500, total: 13_580_178 }), null)).toThrow('10%와 다릅니다');
    expect(() => feeInvoicesOf(read({ supply: null }), null)).toThrow('다 읽지 못했습니다');
  });

  it('달 — 세금계산서의 달 · 못 읽었으면 준 달 · 둘이 다르거나 두 장의 달이 다르면 멈춘다 · 6월분부터', () => {
    expect(() => feeInvoicesOf(read({ month: null }), null)).toThrow('몇 월분인지 읽지 못했습니다');
    expect(feeInvoicesOf(read({ month: null }), null, '2026-09').month).toBe('2026-09');
    expect(() => feeInvoicesOf(read({}), null, '2026-08')).toThrow('26년 9월분인데 26년 8월분로');
    expect(() => feeInvoicesOf(read({}), salesRead({ month: '2026-08' }))).toThrow('두 세금계산서의 달이 다릅니다');
    expect(feeInvoicesOf(read({}), salesRead({ month: null })).month).toBe('2026-09');
    expect(() => feeInvoicesOf(read({ month: '2026-05' }), null)).toThrow('26년 6월분부터');
    expect(() => feeInvoicesOf(read({}), null, '2026-9')).toThrow('YYYY-MM');
  });

  it('판독의 답 — 쉼표 · 원이 붙은 숫자도 받고 · 꼴이 틀린 날 · 달은 비운다', () => {
    expect(taxInvoiceReadOf({
      supplier: ' 주식회사 플러그링크 ', receiver: '(주)한백', issued: '2026/10/01', supply: '12,345,678', vat: 1234567, total: '13,580,245원',
      item: '9월분', month: '2026-9',
    })).toEqual({
      supplier: '주식회사 플러그링크', receiver: '(주)한백', issued: null, supply: 12_345_678, vat: 1_234_567, total: 13_580_245, item: '9월분', month: null,
    });
    expect(taxInvoiceReadOf(null).supply).toBeNull();
    expect(taxInvoiceReadOf({ supply: 12.5 }).supply).toBeNull();
  });

  it('입금 예정일 — YYYY-MM-DD 만', () => {
    expect(feeInDateOf('2026-10-29')).toBe('2026-10-29');
    expect(feeInDateOf('')).toBeNull();
    expect(feeInDateOf(undefined)).toBeNull();
    expect(() => feeInDateOf('10월 29일')).toThrow('YYYY-MM-DD');
  });
});

describe('말일 상신 알림 (한백 2026-11-11 「yes」)', () => {
  it('이번 달 말일 지급(지난달분)의 3영업일 전부터 지급일 전까지 · 6월분(2차)부터', () => {
    expect(feeRemindDue('2026-11-24')).toBeNull();
    expect(feeRemindDue('2026-11-25')).toEqual({ payDate: '2026-11-30', month: '2026-10', round: 6, deadline: '2026-11-25' });
    expect(feeRemindDue('2026-11-27')?.payDate).toBe('2026-11-30');     // 늦었어도 지급일 전까지
    expect(feeRemindDue('2026-11-30')).toBeNull();                        // 지급일에는 말하지 않는다
    expect(feeRemindDue('2026-12-28')).toMatchObject({ payDate: '2026-12-31', month: '2026-11', round: 7 });
    expect(feeRemindDue('2027-01-26')).toMatchObject({ payDate: '2027-01-29', month: '2026-12', round: 8 });   // 1-31 일요일
    expect(feeRemindDue('2026-06-26')).toBeNull();                        // 5월분은 1차 묶음이었다
  });

  it('할 일 · 대화 · 알림 — 기한 날과 늦은 날', () => {
    const due = feeRemindDue('2026-11-25')!;
    const plan = feeRemindPlan(due, '2026-11-25');
    expect(plan.key).toBe(feeRemindKey('2026-11-30'));
    expect(plan.task).toEqual({
      title: '위탁운영수수료 상신 — 11월 30일 (26년 10월분 · 6차)', note: '세금계산서 두 장(위탁운영수수료 · 충전매출)을 정산 담당 대화에',
      due: '2026-11-25',
    });
    expect(plan.say.split('\n')[0]).toBe('11월 30일(월) 플러그링크 위탁운영수수료 6차(26년 10월분) 지급 — 오늘이 상신 기한입니다(3영업일 전).');
    expect(plan.say).toContain('세금계산서를 이 대화에 넘겨 주세요');
    expect(plan.alarm).toEqual({ title: plan.task.title, body: '오늘 11월 25일(수)까지 — 세금계산서 두 장을 정산 담당에게' });
    const late = feeRemindPlan(due, '2026-11-27');
    expect(late.say).toContain('상신 기한(11월 25일(수))이 지났습니다');
    expect(late.alarm.body).toBe('기한 11월 25일(수) 지남 — 세금계산서가 왔으면 정산 담당에게');
  });
});

describe('엑셀의 해당 청구 月 (한백 2026-11-11 「actual month」)', () => {
  it('열린구매 글은 일한 달 — 11/10 결제는 10 · 1/10 결제는 12', () => {
    const batch: AgitBatch = {
      org: '에코일렉', kind: '영업비', total: 1_000_000, invoice: false, lines: [{ projectId: 'p', label: '1차', amount: 1_000_000, qty: 1 }],
    };
    expect(agitBundleOf('2026-11-10', [batch], () => undefined).sheet.month).toBe(10);
    expect(agitBundleOf('2027-01-10', [batch], () => undefined).sheet.month).toBe(12);
  });
});

describe('플러그링크 계좌 · 첨부', () => {
  const payee = agitFeePayeeOf({ bank: '우리', account: '1002-123-456789', holder: ' 주식회사  플러그링크 ' });

  it('받는 곳 — 은행은 목록의 이름 · 계좌는 숫자만 · 감사기록에는 끝 넉 자리', () => {
    expect(payee).toEqual({ bank: '우리은행', account: '1002123456789', holder: '주식회사 플러그링크' });
    expect(feePayeeLabel(payee)).toBe('우리은행 ****6789 · 주식회사 플러그링크');
    expect(() => agitFeePayeeOf({ bank: '없는은행', account: '1002123456789', holder: 'x' })).toThrow('은행 이름을 모릅니다');
    expect(() => agitFeePayeeOf({ bank: '우리은행', account: '12-34', holder: 'x' })).toThrow('8~16자리');
    expect(() => agitFeePayeeOf({ bank: '우리은행', account: '1002123456789', holder: ' ' })).toThrow('예금주');
  });

  it('zip · 엑셀 이름은 5차 그대로 · 엑셀은 한 줄 — 세액은 세금계산서 값(수식이 아니다)', async () => {
    const plan = agitFeeBundleOf('2026-10-30', SEPT, payee, '2026-10-29');
    expect(plan.zipName).toBe('플러그링크 잉여금 처분_위탁운영수수료 5차_261030.zip');
    expect(plan.xlsxName).toBe('플러그링크 Mother EPC 잉여금처분_위탁운영수수료 5차.xlsx');
    expect(plan.invoice).toEqual({ name: '플링비즈_26년 9월분.pdf', url: FILE.url });
    expect(plan.sheet.subject).toBe('플러그링크 위탁운영수수료 26년 9월분');
    expect(plan.sheet.content).toBe('위탁운영수수료');
    expect(plan.sheet.rows).toEqual([expect.objectContaining({
      content: '26년 9월분 위탁운영수수료', org: '플러그링크', supply: 12_345_678, vat: 1_234_567, fixedVat: true, bank: '우리은행',
      account: '1002-123-456789', holder: '주식회사 플러그링크',
    })]);

    const xlsx = await JSZip.loadAsync(await purchaseXlsx(plan.sheet, TEMPLATE));
    const sheet = await xlsx.file('xl/worksheets/sheet1.xml')!.async('string');
    const cell = (ref: string) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(sheet)?.[0] ?? '';
    /* 해당 청구 月 — 9월분이면 9(틀에 남았던 4 가 아니다) */
    expect(plan.sheet.month).toBe(9);
    expect(cell('M5')).toContain('<v>9</v>');
    expect(cell('G8')).not.toContain('<f>');
    expect(cell('G8')).toContain('<v>1234567</v>');
    expect(cell('H8')).toContain('<v>13580245</v>');
    /* 소계 — 지급 줄 바로 밑(9행)으로 당겨진다 · 세액 합도 세금계산서 값 */
    expect(cell('G9')).toContain('<f>SUM(G8:G8)</f><v>1234567</v>');
    expect(cell('D6')).toContain('플러그링크 위탁운영수수료 26년 9월분');
  });
});

/**
 * 영업일(lib/business-days)과 열린구매 상신 알림(lib/agents/open-purchase) — 한백 2026-11-04 「정산담당자는 정기결제일인 매월 10일 25일
 * 3영업일 전에 열린구매 상신해야한다고 나한테 알림 줘야함」. 날짜는 실제 달력으로 손으로 센 것이다.
 */
import { describe, expect, it } from 'vitest';
import {
  KR_HOLIDAYS, addDays, businessDayOnOrBefore, businessDaysBefore, dayLabel, holidaysKnown, isBusinessDay, weekdayOf,
} from '@/lib/business-days';
import { openPurchaseDue, openPurchaseOf, openPurchasePlan } from '@/lib/agents/open-purchase';
import type { Batch } from '@/lib/payout-board';

describe('영업일', () => {
  it('공휴일 표 — 날짜가 바르고, 대체공휴일은 모두 평일이다', () => {
    for (const [day, name] of Object.entries(KR_HOLIDAYS)) {
      expect(addDays(day, 0), day).toBe(day);
      if (name.endsWith('대체공휴일')) expect([0, 6], `${day} ${name}`).not.toContain(weekdayOf(day));
    }
    expect(weekdayOf('2026-01-01')).toBe(4); // 목
    expect(weekdayOf('2027-01-01')).toBe(5); // 금
  });

  it('주말 · 공휴일 · 대체공휴일은 영업일이 아니다', () => {
    expect(isBusinessDay('2026-11-05')).toBe(true);
    expect(isBusinessDay('2026-11-07')).toBe(false); // 토
    expect(isBusinessDay('2026-10-05')).toBe(false); // 개천절 대체공휴일
    expect(isBusinessDay('2026-07-17')).toBe(false); // 제헌절 — 2026 부터 다시 공휴일
    expect(isBusinessDay('2026-05-01')).toBe(false); // 노동절 — 2026 부터 관공서 공휴일
  });

  it('3영업일 전 · 그날이 쉬면 앞 영업일', () => {
    expect(businessDaysBefore('2026-11-10', 3)).toBe('2026-11-05');
    expect(businessDaysBefore('2026-11-25', 3)).toBe('2026-11-20'); // 주말을 건넌다
    expect(businessDayOnOrBefore('2026-11-10')).toBe('2026-11-10');
    expect(businessDayOnOrBefore('2026-12-25')).toBe('2026-12-24'); // 성탄절
    expect(businessDayOnOrBefore('2026-10-10')).toBe('2026-10-08'); // 토 → 한글날(금) → 목
  });

  it('표에 없는 해를 안다', () => {
    expect(holidaysKnown('2027-12-31')).toBe(true);
    expect(holidaysKnown('2028-01-03')).toBe(false);
  });

  it('날짜 이름', () => {
    expect(dayLabel('2026-11-05')).toBe('11월 5일(목)');
  });
});

describe('열린구매 상신 — 언제', () => {
  it('정기결제 3영업일 전이 기한이다', () => {
    expect(openPurchaseOf('2026-11-10')).toEqual({ payDate: '2026-11-10', payDay: '2026-11-10', deadline: '2026-11-05' });
    expect(openPurchaseOf('2026-11-25').deadline).toBe('2026-11-20');
    expect(openPurchaseOf('2027-02-10').deadline).toBe('2027-02-03'); // 설 연휴(2/8 · 대체 2/9)를 건너뛴다
  });

  it('결제일이 쉬는 날이면 앞 영업일에 나간다고 보고 거기서 센다 — 일찍 알리는 쪽', () => {
    expect(openPurchaseOf('2026-12-25')).toEqual({ payDate: '2026-12-25', payDay: '2026-12-24', deadline: '2026-12-21' });
    expect(openPurchaseOf('2027-01-10')).toEqual({ payDate: '2027-01-10', payDay: '2027-01-08', deadline: '2027-01-05' });
    // 토요일 → 한글날(금) → 목요일에 나감, 거꾸로 세면 개천절 대체공휴일(10/5 월)도 건너뛴다
    expect(openPurchaseOf('2026-10-10')).toEqual({ payDate: '2026-10-10', payDay: '2026-10-08', deadline: '2026-10-02' });
    // 추석 당일 → 추석 연휴 → 수요일에 나감
    expect(openPurchaseOf('2026-09-25')).toEqual({ payDate: '2026-09-25', payDay: '2026-09-23', deadline: '2026-09-18' });
  });

  it('기한 날부터 나가는 날 전까지 알릴 것이 있다 — 그 밖에는 없다', () => {
    const due = (day: string) => openPurchaseDue(day).map((d) => d.payDate);
    expect(due('2026-11-04')).toEqual([]);
    expect(due('2026-11-05')).toEqual(['2026-11-10']);
    expect(due('2026-11-09')).toEqual(['2026-11-10']); // 크론이 놓쳤으면 늦게라도
    expect(due('2026-11-10')).toEqual([]); // 나가는 날에는 말하지 않는다
    expect(due('2026-11-20')).toEqual(['2026-11-25']);
    expect(due('2026-12-31')).toEqual([]);
    expect(due('2027-01-05')).toEqual(['2027-01-10']); // 다음 달 결제일도 본다
    expect(due('2026-12-21')).toEqual(['2026-12-25']);
  });
});

const batch = (over: Partial<Batch>): Batch => ({
  paidAt: '2026-11-10', org: '에코일렉', kind: '영업비', count: 1, total: 1_000_000, finalized: false, invoice: null, ...over,
});
const INVOICE = { id: 'inv', url: 'https://blob.example/inv.pdf', name: 'inv.pdf' } as unknown as Batch['invoice'];

describe('열린구매 상신 — 무엇을', () => {
  const NOV10 = openPurchaseOf('2026-11-10');

  it('기한 날 — 할 일 · 대화 · 알림에 그날 지급과 합계', () => {
    const plan = openPurchasePlan(NOV10, '2026-11-05', [
      batch({ org: '대상전력', kind: '시공비', count: 1, total: 9_545_000, finalized: true, invoice: INVOICE }),
      batch({ org: '에코일렉', kind: '영업비', count: 2, total: 2_800_000 }),
    ]);
    expect(plan.key).toBe('open-purchase:2026-11-10');
    expect(plan.task).toEqual({
      title: '열린구매 상신 — 11월 10일 정기결제', note: '지급 2건 · 공급가액 12,345,000원', due: '2026-11-05',
    });
    expect(plan.say.split('\n')).toEqual([
      '11월 10일(화) 정기결제 — 오늘이 열린구매 상신 기한입니다(3영업일 전).',
      '그날 지급 2건 · 공급가액 12,345,000원',
      '- 대상전력 · 시공비 1건 · 9,545,000원 · 확정',
      '- 에코일렉 · 영업비 2건 · 2,800,000원 · 가확정 · 세금계산서 없음',
      '아지트 열린구매 글은 거래명세서 화면 맨 아래에서 보고 올립니다 — 올리면 이 할 일이 저절로 끝납니다.',
    ]);
    expect(plan.alarm).toEqual({
      title: '열린구매 상신 — 11월 10일 정기결제', body: '오늘 11월 5일(목)까지 상신 · 지급 2건 · 공급가액 12,345,000원',
    });
  });

  it('기한이 지났으면 지났다고', () => {
    const plan = openPurchasePlan(NOV10, '2026-11-09', []);
    expect(plan.say).toContain('열린구매 상신 기한(11월 5일(목))이 지났습니다. 아직이면 오늘 상신해 주세요.');
    expect(plan.say).toContain('그날 지급할 배치가 0건입니다');
    expect(plan.alarm.body).toBe('기한 11월 5일(목) 지남 — 아직이면 오늘 상신 · 지급 0건');
  });

  it('결제일이 쉬는 날이면 왜 앞당겨 셌는지 말한다', () => {
    const xmas = openPurchasePlan(openPurchaseOf('2026-12-25'), '2026-12-21', []);
    expect(xmas.say).toContain('12월 25일은 성탄절이라 앞 영업일 12월 24일(목)에 나간다고 보고 셌습니다.');
    expect(xmas.task.note).toBe('12월 24일(목) 나감 · 지급 0건');
    const sun = openPurchasePlan(openPurchaseOf('2027-01-10'), '2027-01-05', []);
    expect(sun.say).toContain('1월 10일은 일요일이라 앞 영업일 1월 8일(금)에 나간다고 보고 셌습니다.');
  });

  it('공휴일 표가 없는 해는 주말만 뺐다고 말한다', () => {
    const plan = openPurchasePlan(openPurchaseOf('2028-03-10'), '2028-03-07', []);
    expect(plan.say).toContain('2028년 공휴일 표가 없어 주말만 빼고 셌습니다.');
  });
});

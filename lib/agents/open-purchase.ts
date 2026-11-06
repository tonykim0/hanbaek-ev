/**
 * 열린구매 상신 알림 — 정산 담당이 정기결제(매월 10일 · 25일)의 3영업일 전 아침에 한백에게 「열린구매를 상신해야 한다」고 알린다. [순수]
 * (한백 지시 2026-11-04 「정산담당자는 정기결제일인 매월 10일 25일 3영업일 전에 열린구매 상신해야한다고 나한테 알림 줘야함」)
 *
 * 무엇을 · 언제 말하는지는 여기다. 남기는 일은 store/agents agentRemind(할 일 · 대화 한 줄 · 한백 관리자 알림을 한 번에),
 * 매일 아침 묻는 곳은 lib/agents/remind-run(크론 app/api/cron/agents · vercel.json).
 *
 * ★결제일이 주말 · 공휴일이면 그 앞 영업일에 나간다고 본다★ — 거기서 3영업일을 거꾸로 센다(공휴일 표는 lib/business-days).
 *   뒤 영업일로 미는 회사도 있지만, 그렇게 세면 앞으로 당겨 낼 때 알림이 기한보다 늦다 — 일찍 알리는 쪽을 골랐다.
 *   한백의 규칙이 다르면 payDayOf 한 곳을 고친다. 예: 2026-12-25(성탄절) → 12-24(목)에 나감 → 12-21(월)까지 상신.
 * ★기한 날 아침에 한 번★ — 그날을 놓쳤으면(크론이 못 돌았으면) 나가는 날 전까지는 늦게라도 한 번, 「기한이 지났습니다」로.
 *   나가는 날이 되면 말하지 않는다 — 그때의 상신 알림은 소음이다.
 * 그날 나갈 배치(지급처 × 구분)와 합계를 같이 적는다 — 상신할 것이 그것이다. 아지트 열린구매 글은 거래명세서 화면이 결제일마다 짓고
 * 한백이 눌러 올린다(lib/agit · 2026-11-07) — 올리면 이 할 일이 저절로 끝난다(store/agit finishAgitPost 가 이 열쇠로 찾는다).
 */
import { REGULAR_PAY_DAYS, type Batch } from '@/lib/payout-board';
import {
  WEEKDAYS, businessDayOnOrBefore, businessDaysBefore, dayLabel, holidayOf, holidaysKnown, weekdayOf,
} from '@/lib/business-days';
import { monthShift } from '@/lib/date';
import { won } from '@/lib/format';
import { josa } from '@/lib/site-mail';

/** 알리는 담당 — migrations/0109 가 심은 정산 담당(0110 이 열린구매를 합쳤다) */
export const OPEN_PURCHASE_AGENT = 'settlement';
/** 정기결제 며칠(영업일) 전까지 상신하는가 — 한백 「3영업일 전」 */
export const OPEN_PURCHASE_LEAD = 3;

export interface OpenPurchaseDue {
  /** 정기결제일 — 배치의 지급일(10일 · 25일, lib/payout-board REGULAR_PAY_DAYS) */
  payDate: string;
  /** 실제로 나가는 날 — 결제일이 쉬는 날이면 그 앞 영업일 */
  payDay: string;
  /** 상신 기한 — 나가는 날의 3영업일 전 */
  deadline: string;
}

/** 실제로 나가는 날 — 결제일이 영업일이면 그날, 아니면 그 앞 영업일 */
export const payDayOf = (payDate: string): string => businessDayOnOrBefore(payDate);

export function openPurchaseOf(payDate: string): OpenPurchaseDue {
  const payDay = payDayOf(payDate);
  return { payDate, payDay, deadline: businessDaysBefore(payDay, OPEN_PURCHASE_LEAD) };
}

/**
 * 오늘 알릴 정기결제 — 기한이 왔고(기한 ≤ 오늘) 아직 나가지 않은 것(오늘 < 나가는 날). 이번 달 · 다음 달의 10일 · 25일에서 찾는다
 * (다음 달 10일의 기한이 이번 달 끝에 올 수 있다). 두 결제일의 창은 겹치지 않는다 — 그래도 목록으로 준다.
 */
export function openPurchaseDue(today: string): OpenPurchaseDue[] {
  const month = today.slice(0, 7);
  return [month, monthShift(month, 1)]
    .flatMap((m) => REGULAR_PAY_DAYS.map((d) => openPurchaseOf(`${m}-${d}`)))
    .filter((o) => o.deadline <= today && today < o.payDay);
}

/** 알림 하나의 열쇠 — 같은 결제일은 한 번만 남긴다(store/agents agentRemind 가 대화의 그 줄로 가른다) */
export const openPurchaseKey = (payDate: string): string => `open-purchase:${payDate}`;

/** 「11월 10일」 */
const monthDay = (day: string): string => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일`;
};

/** 왜 쉬는 날인가 — 공휴일 이름, 아니면 「토요일」 · 「일요일」 */
const offReason = (day: string): string => holidayOf(day) ?? `${WEEKDAYS[weekdayOf(day)]}요일`;

/** 표에 없는 해 — 그 해는 주말만 뺐다 */
export function unknownYears(due: OpenPurchaseDue): string[] {
  return [...new Set([due.deadline, due.payDate].filter((d) => !holidaysKnown(d)).map((d) => d.slice(0, 4)))];
}

export interface RemindPlan {
  key: string;
  task: { title: string; note: string; due: string };
  /** 대화에 남는 말(자동) */
  say: string;
  /** 한백 관리자에게 가는 알림 — 꼬리표와 본문 */
  alarm: { title: string; body: string };
}

/**
 * 그날 남길 것 — 할 일 · 대화의 말 · 알림. batches 는 그 결제일의 배치(가확정 · 확정)만 넘긴다.
 * 나가기 전이라 상태는 둘뿐이다 — 확정했으면 「확정」, 아니면 「가확정」(lib/payout-board batchStateOf 의 앞날 쪽).
 */
export function openPurchasePlan(due: OpenPurchaseDue, today: string, batches: readonly Batch[]): RemindPlan {
  const title = `열린구매 상신 — ${monthDay(due.payDate)} 정기결제`;
  const total = batches.reduce((n, b) => n + b.total, 0);
  const sum = batches.length ? `지급 ${batches.length}건 · 공급가액 ${won(total)}원` : '지급 0건';
  const late = today > due.deadline;
  const shifted = due.payDay !== due.payDate
    ? `${monthDay(due.payDate)}은 ${josa(offReason(due.payDate), '이라', '라')} 앞 영업일 ${dayLabel(due.payDay)}에 나간다고 보고 셌습니다.`
    : '';
  const years = unknownYears(due);
  const rows = [...batches]
    .sort((a, b) => (a.org ?? '').localeCompare(b.org ?? '', 'ko') || a.kind.localeCompare(b.kind, 'ko'))
    .map((b) => [
      `- ${b.org ?? '지급처 미정'} · ${b.kind} ${b.count}건 · ${won(b.total)}원`,
      b.finalized ? '확정' : '가확정',
      b.invoice ? '' : '세금계산서 없음',
    ].filter(Boolean).join(' · '));

  const say = [
    late
      ? `${dayLabel(due.payDate)} 정기결제 — 열린구매 상신 기한(${dayLabel(due.deadline)})이 지났습니다. 아직이면 오늘 상신해 주세요.`
      : `${dayLabel(due.payDate)} 정기결제 — 오늘이 열린구매 상신 기한입니다(${OPEN_PURCHASE_LEAD}영업일 전).`,
    shifted,
    years.length ? `${years.join(' · ')}년 공휴일 표가 없어 주말만 빼고 셌습니다.` : '',
    batches.length ? `그날 ${sum}` : '그날 지급할 배치가 0건입니다 — 가확정한 지급이 없습니다.',
    ...rows,
    '아지트 열린구매 글은 거래명세서 화면 맨 아래에서 보고 올립니다 — 올리면 이 할 일이 저절로 끝납니다.',
  ].filter(Boolean).join('\n');

  return {
    key: openPurchaseKey(due.payDate),
    task: {
      title,
      note: [due.payDay !== due.payDate ? `${dayLabel(due.payDay)} 나감` : '', sum].filter(Boolean).join(' · '),
      due: due.deadline,
    },
    say,
    alarm: {
      title,
      body: late
        ? `기한 ${dayLabel(due.deadline)} 지남 — 아직이면 오늘 상신 · ${sum}`
        : `오늘 ${dayLabel(due.deadline)}까지 상신 · ${sum}`,
    },
  };
}

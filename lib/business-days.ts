/**
 * 영업일 — 주말과 관공서 공휴일(대체공휴일 · 선거일 · 임시공휴일까지)을 뺀 날. [순수]
 *
 * 쓰는 곳: 정산 담당의 열린구매 상신 알림(lib/agents/open-purchase — 정기결제 10일 · 25일의 3영업일 전, 한백 지시 2026-11-04).
 *
 * ★공휴일은 표다★ — 음력(설날 · 추석 · 부처님오신날) · 대체공휴일 · 선거일 · 임시공휴일이 섞여 셈으로는 못 낸다. 해마다 6월쯤
 * 우주항공청이 이듬해 월력요항(관공서 공휴일)을 낸다 — 그때 다음 해를 더한다. 임시공휴일은 국무회의가 정하면 그날 더한다.
 * ★표에 없는 해는 주말만 뺀다★ — holidaysKnown 이 false 면 부르는 쪽이 그 사실을 말하고 [agents] 로 남긴다(감시가 본다).
 *
 * 2026 은 노동절(5/1)과 제헌절(7/17)이 관공서 공휴일이 된 해다(인사혁신처 개정령, 2026-04-28 국무회의 — 제헌절은 18년 만).
 * 둘 다 대체공휴일 대상이다(2027 년 5/3 · 7/19). 2026-09-28(추석 뒤 월요일) 임시공휴일은 지정되지 않았다.
 * 2027 은 월력요항(2026-06 발표) 그대로 — 대체공휴일 일곱(2/9 · 5/3 · 7/19 · 8/16 · 10/4 · 10/11 · 12/27).
 */

export const KR_HOLIDAYS: Readonly<Record<string, string>> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-01': '노동절',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',

  '2027-01-01': '신정',
  '2027-02-06': '설날 연휴',
  '2027-02-07': '설날',
  '2027-02-08': '설날 연휴',
  '2027-02-09': '설날 대체공휴일',
  '2027-03-01': '삼일절',
  '2027-05-01': '노동절',
  '2027-05-03': '노동절 대체공휴일',
  '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일',
  '2027-07-17': '제헌절',
  '2027-07-19': '제헌절 대체공휴일',
  '2027-08-15': '광복절',
  '2027-08-16': '광복절 대체공휴일',
  '2027-09-14': '추석 연휴',
  '2027-09-15': '추석',
  '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절',
  '2027-10-04': '개천절 대체공휴일',
  '2027-10-09': '한글날',
  '2027-10-11': '한글날 대체공휴일',
  '2027-12-25': '성탄절',
  '2027-12-27': '성탄절 대체공휴일',
};

const DAY_MS = 86_400_000;
const msOf = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** 표가 있는 해 */
const KNOWN_YEARS = new Set(Object.keys(KR_HOLIDAYS).map((d) => d.slice(0, 4)));

/** 그 해의 공휴일을 표가 아는가 — 모르면 주말만 뺀다 */
export const holidaysKnown = (day: string): boolean => KNOWN_YEARS.has(day.slice(0, 4));

/** 그날의 공휴일 이름 — 아니면 null */
export const holidayOf = (day: string): string | null => KR_HOLIDAYS[day] ?? null;

/** n 날 옮긴 날 — 글자를 쪼개 세므로 시간대와 무관하다(lib/date 와 같은 방식) */
export const addDays = (day: string, n: number): string => new Date(msOf(day) + n * DAY_MS).toISOString().slice(0, 10);

/** 요일 — 0 일요일 … 6 토요일 */
export const weekdayOf = (day: string): number => new Date(msOf(day)).getUTCDay();

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 「11월 5일(목)」 */
export function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일(${WEEKDAYS[weekdayOf(day)]})`;
}

/** 영업일인가 — 주말도 공휴일도 아닌 날 */
export function isBusinessDay(day: string): boolean {
  const w = weekdayOf(day);
  return w !== 0 && w !== 6 && !(day in KR_HOLIDAYS);
}

/** 그날이 영업일이면 그날, 아니면 그 앞의 가장 가까운 영업일 — 2026-12-25(성탄절) → 12-24 */
export function businessDayOnOrBefore(day: string): string {
  let d = day;
  while (!isBusinessDay(d)) d = addDays(d, -1);
  return d;
}

/** 그날(빼고) 앞으로 n 번째 영업일 — 「3영업일 전」. 2026-11-10(화) → 11-05(목) */
export function businessDaysBefore(day: string, n: number): string {
  let d = day;
  for (let left = n; left > 0;) {
    d = addDays(d, -1);
    if (isBusinessDay(d)) left -= 1;
  }
  return d;
}

/**
 * 주간 기록의 달력 — 한 주는 월요일부터 일요일까지(한국 달력). 저장소 · 화면이 같이 본다(아무것도 끌어오지 않는다).
 * 저장소는 같은 경계를 SQL 로 센다(date_trunc('week') — 월요일 시작) — 둘이 같은 월요일을 가리켜야 「이 주」 줄을 눌렀을 때
 * 그 줄에 센 것이 그대로 펼쳐진다.
 */

/** 'YYYY-MM-DD' 를 며칠 민다 (달력 날짜끼리라 시간대가 끼지 않는다) */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 그 날이 든 주의 월요일 */
export function mondayOf(day: string): string {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDay(day, -dow);
}

/** 주의 이름 — 이번 주 · 지난주는 말로, 그 앞은 날짜로. 해가 다르면 해를 붙인다 */
export function weekName(start: string, today: string): string {
  const now = mondayOf(today);
  if (start === now) return '이번 주';
  if (start === shiftDay(now, -7)) return '지난주';
  return weekRange(start, today);
}

/** 11.02 – 11.08 (어느 한쪽이라도 올해가 아니면 두 쪽 다 해를 붙인다 — 2025.12.29 – 2026.01.04) */
export function weekRange(start: string, today: string): string {
  const end = shiftDay(start, 6);
  const year = today.slice(0, 4);
  const full = start.slice(0, 4) !== year || end.slice(0, 4) !== year;
  const dot = (d: string) => (full ? d : d.slice(5)).replace(/-/g, '.');
  return `${dot(start)} – ${dot(end)}`;
}

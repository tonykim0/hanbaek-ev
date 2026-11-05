/**
 * 메일 예약 보내기 — 고를 수 있는 날 · 나가는 때 (순수). 한백 2026-11-05 「내가 내일 오전 9시에 보내달라니까 안된다네」 →
 * 「왜 예약발송은 안되는거지」 → 「A로 충분해」.
 *
 * 나가는 것은 매일 아침 크론(/api/cron/mails · vercel.json 00:00 UTC)이다. Vercel Hobby 의 크론은 하루 한 번 · 정시에서 59분까지 늦게
 * 돌아서 ★「그날 오전 9시대」만 고를 수 있다★ — 시각을 고르게 하면 지키지 못할 약속이 된다. 정확한 시각이 필요해지면 외부 예약
 * (QStash 등)이나 Pro 로 크론을 촘촘히 돌리는 길이 있다(그때 SEND_HOUR 와 이 파일만 고친다).
 */
import { today } from '@/lib/date';

/** 예약한 메일이 나가는 때 — 한국 시각 오전 9시(크론 00:00 UTC) */
export const SEND_HOUR = 9;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 그날 오전 9시(한국 시각) */
export const scheduledAtOf = (day: string): Date => new Date(`${day}T${String(SEND_HOUR).padStart(2, '0')}:00:00+09:00`);

/** 고를 수 있는 가장 이른 날 — 오늘 9시 전이면 오늘, 아니면 내일 */
export function earliestDay(now: Date = new Date()): string {
  const d = today(now);
  if (now.getTime() < scheduledAtOf(d).getTime()) return d;
  const next = new Date(`${d}T12:00:00+09:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return today(next);
}

/** 고른 날이 맞는가 — 날짜 꼴이고, 그날 9시가 아직 오지 않았고, 한 달 안 */
export function scheduleError(day: string, now: Date = new Date()): string | null {
  if (!DAY_RE.test(day) || Number.isNaN(scheduledAtOf(day).getTime())) return '날짜를 YYYY-MM-DD 로 골라 주세요.';
  if (scheduledAtOf(day).getTime() <= now.getTime()) return '이미 지난 때입니다 — 오늘 9시가 지났으면 내일부터 고를 수 있습니다.';
  if (scheduledAtOf(day).getTime() - now.getTime() > 31 * 24 * 3600 * 1000) return '한 달 안의 날만 예약할 수 있습니다.';
  return null;
}

/** 예약의 이름 — 「11월 6일 (금) 오전 9시대」 */
export function scheduleLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  const w = WEEK[new Date(`${day}T12:00:00+09:00`).getUTCDay()];
  return `${m}월 ${d}일 (${w}) 오전 ${SEND_HOUR}시대`;
}

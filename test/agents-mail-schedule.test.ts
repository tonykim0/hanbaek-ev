/**
 * 메일 예약 보내기 — 고를 수 있는 날 · 나가는 때(lib/agents/mail-schedule · 한백 2026-11-05 「내일 오전 9시에 보내달라」 → 「A로 충분해」).
 * 크론이 하루 한 번(00:00 UTC = 한국 오전 9시대)이라 날만 고르고, 그날 오전 9시가 지났으면 다음 날부터다.
 */
import { describe, expect, it } from 'vitest';
import { earliestDay, scheduledAtOf, scheduleError, scheduleLabel, SEND_HOUR } from '@/lib/agents/mail-schedule';

const at = (iso: string) => new Date(iso);

describe('나가는 때 (scheduledAtOf · scheduleLabel)', () => {
  it('그날 한국 오전 9시 = 그날 00:00 UTC — 크론(vercel.json 0 0 * * *)과 같은 때', () => {
    expect(SEND_HOUR).toBe(9);
    expect(scheduledAtOf('2026-11-06').toISOString()).toBe('2026-11-06T00:00:00.000Z');
  });

  it('이름은 「11월 6일 (금) 오전 9시대」', () => {
    expect(scheduleLabel('2026-11-06')).toBe('11월 6일 (금) 오전 9시대');
    expect(scheduleLabel('2026-11-09')).toBe('11월 9일 (월) 오전 9시대');
  });
});

describe('고를 수 있는 날 (earliestDay · scheduleError)', () => {
  it('오늘 9시 전이면 오늘, 지났으면 내일부터', () => {
    expect(earliestDay(at('2026-11-05T22:30:00+09:00'))).toBe('2026-11-06');
    expect(earliestDay(at('2026-11-06T08:59:00+09:00'))).toBe('2026-11-06');
    expect(earliestDay(at('2026-11-06T09:00:00+09:00'))).toBe('2026-11-07');
  });

  it('지난 때 · 꼴이 틀린 날 · 한 달 넘는 날은 막는다', () => {
    const now = at('2026-11-05T22:30:00+09:00');
    expect(scheduleError('2026-11-06', now)).toBeNull();
    expect(scheduleError('2026-11-05', now)).toContain('이미 지난 때');
    expect(scheduleError('11/6', now)).toContain('YYYY-MM-DD');
    expect(scheduleError('2026-12-31', now)).toContain('한 달 안');
  });
});

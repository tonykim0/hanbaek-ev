/**
 * 칸반의 「내 차례」와 「며칠째」 — 한백 지시 2026-09-10.
 *
 *   ① 어떤 칸을 내가 처리해야 하나 (courtsOfRole · isMyCourt)
 *   ② 반려·검토 요청 이후 며칠인가 (waitingSinceOf)
 *
 * ②를 stalledDays 로 답할 수 없어서 이 함수가 생겼다 — 저것은 「마지막 움직임 후」라,
 * 반려는 그대로인데 협력사가 파일 한 장만 올려도 0 이 된다.
 */
import { describe, expect, it } from 'vitest';
import { courtsOfRole, isMyCourt, waitingSinceOf } from '@/lib/board';

const NOW = new Date('2026-09-10T09:00:00+09:00');
const none = { rejectedAt: null, submittedAt: null, rejectedDocs: 0 };

describe('누구 차례인가', () => {
  it('한백의 눈 둘은 「한백」 칸을 맡는다 — 열람 전용도 같은 것을 본다', () => {
    expect(courtsOfRole('admin')).toEqual(['한백']);
    expect(courtsOfRole('viewer')).toEqual(['한백']);
  });

  it('턴키는 영업과 시공을 다 맡는다', () => {
    expect(courtsOfRole('salesCons')).toEqual(['영업사', '시공사']);
    expect(courtsOfRole('cons')).toEqual(['시공사']);
    expect(courtsOfRole('sales')).toEqual(['영업사']);
  });

  it('계약검토는 한백, 계약접수·계약보완은 영업사', () => {
    expect(isMyCourt('계약검토', 'admin')).toBe(true);
    expect(isMyCourt('계약검토', 'sales')).toBe(false);
    expect(isMyCourt('계약보완', 'sales')).toBe(true);
    expect(isMyCourt('계약접수', 'cons')).toBe(false);   // 시공사는 계약을 안 모은다
    expect(isMyCourt('계약접수', 'salesCons')).toBe(true); // 턴키는 영업도 한다
  });

  it('★운영사 칸은 아무의 차례도 아니다★ — 우리 손 밖이라 기다리는 자리다', () => {
    for (const r of ['admin', 'viewer', 'salesCons', 'cons', 'sales'] as const) {
      expect(isMyCourt('운영사 계약서 제출', r), r).toBe(false);
    }
  });

  it('시공 칸의 담당이 갈린다 — 발주는 한백, 착공·개통은 시공사', () => {
    expect(isMyCourt('충전기 발주', 'admin')).toBe(true);
    expect(isMyCourt('충전기 발주', 'cons')).toBe(false);
    expect(isMyCourt('착공', 'cons')).toBe(true);
    expect(isMyCourt('개통 및 통신확인', 'cons')).toBe(true);
    expect(isMyCourt('준공서류 접수/검토', 'admin')).toBe(true);
    expect(isMyCourt('준공보완', 'cons')).toBe(true);
  });
});

describe('무엇을 기다린 지 며칠인가', () => {
  it('계약검토는 낸 날부터 센다 — 한백이 안 본 기간', () => {
    expect(waitingSinceOf('계약검토', { ...none, submittedAt: '2026-09-03' }, NOW))
      .toEqual({ label: '검토 요청', days: 7 });
  });

  it('계약보완·준공보완은 반려한 날부터 센다 — 협력사가 안 고친 기간', () => {
    const p = { rejectedAt: '2026-08-31T04:00:00.000Z', submittedAt: null, rejectedDocs: 2 };
    expect(waitingSinceOf('계약보완', p, NOW)).toEqual({ label: '반려', days: 10 });
    expect(waitingSinceOf('준공보완', p, NOW)).toEqual({ label: '반려', days: 10 });
  });

  it('★반려가 풀렸으면 옛 반려일로 세지 않는다★ — 남은 반려가 없으면 기다릴 것도 없다', () => {
    expect(waitingSinceOf('계약보완', { rejectedAt: '2026-08-01', submittedAt: null, rejectedDocs: 0 }, NOW))
      .toBeNull();
  });

  it('★날짜가 없으면 아무것도 안 적는다★ — 0 일로 적으면 오늘 반려한 것처럼 보인다', () => {
    expect(waitingSinceOf('계약보완', { ...none, rejectedDocs: 3 }, NOW)).toBeNull();
    expect(waitingSinceOf('계약검토', none, NOW)).toBeNull();
  });

  it('★하는 중인 칸에는 안 적는다★ — 기다리는 자리가 아니라 일하는 자리다', () => {
    const p = { rejectedAt: '2026-08-01', submittedAt: '2026-08-01', rejectedDocs: 1 };
    for (const k of ['계약접수', '계약완료', '착공', '충전기 발주', '준공완료'] as const) {
      expect(waitingSinceOf(k, p, NOW), k).toBeNull();
    }
  });

  it('같은 날이면 0 일이다 — 오늘 낸 것은 늦은 것이 아니다', () => {
    expect(waitingSinceOf('계약검토', { ...none, submittedAt: '2026-09-10' }, NOW))
      .toEqual({ label: '검토 요청', days: 0 });
  });
});

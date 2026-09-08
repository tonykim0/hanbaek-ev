/**
 * 보드 칸 — 현장이 어느 자리에 서고, 그 자리가 누구 차례인가.
 *
 * ★차례를 저장값에서 떼어낸 자리다★ (2026-09-04). 담당(projects.court)이 여기저기서
 * 따로 찍혀 칸과 어긋났고, 그 어긋남이 할 일 개수로 드러났다(29건 중 10건).
 */
import { describe, expect, it } from 'vitest';
import { boardColumnOf, courtOfColumn } from '@/lib/board';
describe('courtOfColumn — 차례는 칸이 정한다 (2026-09-04)', () => {
  it('★한백의 계약 할 일은 둘뿐이다★ — 검토와 완료', () => {
    expect(courtOfColumn('계약검토')).toBe('한백');
    expect(courtOfColumn('계약완료')).toBe('한백');
  });

  it('모으는 중·고치는 중은 협력사 차례다', () => {
    expect(courtOfColumn('계약접수')).toBe('영업사');
    expect(courtOfColumn('계약보완')).toBe('영업사');
  });

  it('★운영사 계약서 제출은 기다리는 자리다★ — 서류를 올렸다고 한백 차례가 되지 않는다', () => {
    /*
     * 프로덕션에서 6건이 그랬다(2026-09-04): 계약이 끝난 뒤 견적서·실사보고서를 올리자
     * uploadDocument 가 담당을 한백으로 넘겨, 기다리는 현장이 할 일에 섰다.
     */
    expect(courtOfColumn('운영사 계약서 제출')).toBe('운영사');
  });

  it('공정 칸은 COURT_AFTER_STATUS 를 따른다 — 두 벌로 적지 않는다', () => {
    expect(courtOfColumn('착공')).toBe('시공사');
    expect(courtOfColumn('충전기 발주')).toBe('한백');
    expect(courtOfColumn('준공서류 접수/검토')).toBe('한백');
  });
});

/**
 * 계약 세 칸 — ★재검토 요청을 눌러야 검토에 선다★ (한백 지시 2026-09-08).
 * 2026-08-25 에는 보완이 풀리면 요청 없이 검토에 세웠는데, 협력사가 아직 고치는 중인
 * 계약이 한백 칸에 서고 담당은 영업사인데 칸은 검토라 둘이 다른 말을 했다.
 */
describe('boardColumnOf — 계약 칸은 협력사의 선언이 정한다', () => {
  const row = (over: Partial<Parameters<typeof boardColumnOf>[0]> = {}) => boardColumnOf({
    stage: 'intake', status: '운영사 계약서 제출', holdState: null,
    rejectedDocs: 0, docsFilled: true, submitted: false, fixAsked: false, ...over,
  });

  it('처음 모으는 중이면 계약접수', () => {
    expect(row()).toBe('계약접수');
  });

  it('접수하기를 누르면 계약검토 — 필수 서류가 찼다는 것만으로는 안 넘어간다', () => {
    expect(row({ submitted: true })).toBe('계약검토');
    expect(row({ docsFilled: true })).toBe('계약접수');
  });

  it('반려가 하나라도 있으면 계약보완 — 선언이 있어도', () => {
    expect(row({ rejectedDocs: 1, submitted: true, fixAsked: true })).toBe('계약보완');
  });

  it('★반려를 다 풀어도 재검토 요청을 안 눌렀으면 계약보완에 남는다★', () => {
    expect(row({ fixAsked: true, submitted: false })).toBe('계약보완');
  });

  it('재검토 요청을 누르면 계약검토', () => {
    expect(row({ fixAsked: true, submitted: true })).toBe('계약검토');
  });

  it('보완요청 이력이 있는 현장은 접수로 돌아가지 않는다 (2026-08-25 의 그 자리)', () => {
    expect(row({ fixAsked: true })).not.toBe('계약접수');
  });

  it('멈춘 현장은 칸이 곧 멈춤이다', () => {
    expect(row({ holdState: '계약중단', submitted: true })).toBe('계약중단');
  });
});

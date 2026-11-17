/**
 * 보드 칸 — 현장이 어느 자리에 서고, 그 자리가 누구 차례인가.
 *
 * ★차례를 저장값에서 떼어낸 자리다★ (2026-09-04). 담당(projects.court)이 여기저기서
 * 따로 찍혀 칸과 어긋났고, 그 어긋남이 할 일 개수로 드러났다(29건 중 10건).
 */
import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS, bandOfColumn, boardColumnOf, constructionLabelOf, courtOfColumn, isMyCourt, phaseOfProject, showsOnBoard,
} from '@/lib/board';
describe('courtOfColumn — 차례는 칸이 정한다 (2026-09-04)', () => {
  it('★한백의 계약 할 일은 둘뿐이다★ — 검토와 완료', () => {
    expect(courtOfColumn('계약검토')).toBe('한백');
    expect(courtOfColumn('계약완료')).toBe('한백');
  });

  it('모으는 중·고치는 중은 협력사 차례다', () => {
    expect(courtOfColumn('계약접수')).toBe('영업사');
    expect(courtOfColumn('계약보완')).toBe('영업사');
  });

  it('★계약서 제출은 기다리는 자리다★ — 서류를 올렸다고 한백 차례가 되지 않는다', () => {
    /*
     * 프로덕션에서 6건이 그랬다(2026-09-04): 계약이 끝난 뒤 견적서·실사보고서를 올리자
     * uploadDocument 가 담당을 한백으로 넘겨, 기다리는 현장이 할 일에 섰다.
     */
    expect(courtOfColumn('계약서 제출')).toBe('운영사');
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
    stage: 'intake', status: '계약서 제출', holdState: null,
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

describe('맞물리는 칸 — 두 보드에 서는가 (감사 L4)', () => {
  it('계약서 제출은 계약·시공 양쪽에 선다', () => {
    const p = { stage: 'construction' as const, status: '계약서 제출' as const };
    expect(showsOnBoard(p, '시공')).toBe(true);
  });

  /*
   * ★기후부 승인도 양쪽에 선다★ (한백 지시 2026-11-17) — 계약 보드의 칸이지만, 계약 보드에만 두면 시공 보드의
   * 「기후부 승인 대기」에 서 있던 카드가 승인이 나는 순간 사라졌다가 행위신고로 넘겨야 다시 나타난다.
   */
  it('기후부 승인은 계약 보드의 칸이고 시공 보드에도 선다 — 승인이 난 순간 사라지지 않는다', () => {
    const p = { stage: 'construction' as const, status: '기후부 승인' as const };
    expect(phaseOfProject(p)).toBe('계약');
    expect(showsOnBoard(p, '계약')).toBe(true);
    expect(showsOnBoard(p, '시공')).toBe(true);
    expect(bandOfColumn('기후부 승인')).toBe('계약');
  });

  it('두 보드의 칸 차례 — 계약은 기후부 승인에서 끝나고 시공은 승인 대기에서 시작한다', () => {
    const on = (band: '계약' | '시공') => BOARD_COLUMNS
      .filter((c) => c.band === band || c.alsoOn?.band === band)
      .map((c) => (c.alsoOn?.band === band ? c.alsoOn.label : c.label));
    expect(on('계약')).toEqual(['계약접수', '계약검토', '계약보완', '계약완료', '계약서 제출', '기후부 승인']);
    expect(on('시공').slice(0, 3)).toEqual(['기후부 승인 대기', '기후부 승인', '행위신고']);
  });

  it('시공 쪽 이름 — 낸 자리만 「기후부 승인 대기」로 부르고 나머지는 칸 이름 그대로다', () => {
    expect(constructionLabelOf('계약서 제출')).toBe('기후부 승인 대기');
    expect(constructionLabelOf('기후부 승인')).toBe('기후부 승인');
    expect(constructionLabelOf('행위신고')).toBe('행위신고');
  });

  it('승인이 난 칸은 한백 차례다 — 할 일에 선다(행위신고로 넘기기)', () => {
    expect(courtOfColumn('기후부 승인')).toBe('한백');
    expect(isMyCourt('기후부 승인', 'admin')).toBe(true);
    expect(isMyCourt('기후부 승인', 'cons')).toBe(false);
  });
  it('★멈춘 현장은 국면과 상관없이 계약 보드 한 곳에 선다★ — 계약중단 칸은 하나다', () => {
    for (const status of ['계약서 제출', '행위신고', '착공'] as const) {
      const p = { stage: 'construction' as const, status, holdState: '계약중단' };
      expect(showsOnBoard(p, '계약'), status).toBe(true);
      expect(showsOnBoard(p, '시공'), status).toBe(false);
    }
    const intake = { stage: 'intake' as const, status: '계약서 제출' as const, holdState: '계약중단' };
    expect(showsOnBoard(intake, '계약')).toBe(true);
  });
});


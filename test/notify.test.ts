import { describe, expect, it } from 'vitest';
import { approvalNotice, noteAudience, TAB_OF_SCOPE } from '@/lib/notify';

describe('진행현황 글은 그 현장의 기록을 같이 쓰는 사람 모두에게 알림으로 간다', () => {
  const p = { salesOrg: '네이비인프라', gcOrg: '대상전력' };
  it('계약·시공 탭 — 한백과 그 현장의 협력사 둘 다(누가 썼든 같다 — 쓴 사람만 펼칠 때 뺀다)', () => {
    expect(noteAudience({ scope: '계약', ...p })).toEqual({ hanbaek: true, orgs: ['네이비인프라', '대상전력'] });
    expect(noteAudience({ scope: '시공', ...p })).toEqual({ hanbaek: true, orgs: ['네이비인프라', '대상전력'] });
  });
  it('턴키(영업·시공이 한 회사)는 한 번 · 협력사가 없으면 한백만', () => {
    expect(noteAudience({ scope: '시공', salesOrg: '에코일렉', gcOrg: '에코일렉' })).toEqual({ hanbaek: true, orgs: ['에코일렉'] });
    expect(noteAudience({ scope: '계약', salesOrg: null, gcOrg: null })).toEqual({ hanbaek: true, orgs: [] });
  });
  it('기성 탭 글은 한백끼리 — 협력사에게는 그 탭이 없다', () => {
    expect(noteAudience({ scope: '기성', ...p })).toEqual({ hanbaek: true, orgs: [] });
  });
  it('갈래마다 그 글이 서는 탭', () => {
    expect(TAB_OF_SCOPE).toEqual({ 계약: 'intake', 시공: 'construction', 기성: 'receivable' });
  });
});

describe('환경부 승인 알림의 글 — 승인일과 다음 할 일', () => {
  it('행위신고가 남았으면 그것부터 · 끝났거나 대상이 아니면 충전기 발주', () => {
    expect(approvalNotice({ date: '2026-10-12', notifyCleared: false, pastOrder: false })).toEqual({
      title: '환경부 승인',
      body: '2026-10-12 승인 — 운영사 시공승인도 같은 날로 봅니다.\n행위신고를 마치면 충전기 발주로 넘어갑니다.',
    });
    expect(approvalNotice({ date: '2026-10-12', notifyCleared: true, pastOrder: false }).body)
      .toBe('2026-10-12 승인 — 운영사 시공승인도 같은 날로 봅니다.\n행위신고도 끝나 있어 충전기 발주를 준비합니다.');
  });
  it('이미 발주 칸을 지난 현장(늦게 적은 승인일)에는 다음 할 일을 적지 않는다 · 기성은 말하지 않는다', () => {
    const n = approvalNotice({ date: '2026-09-01', notifyCleared: true, pastOrder: true });
    expect(n.body).toBe('2026-09-01 승인 — 운영사 시공승인도 같은 날로 봅니다.');
    for (const v of [true, false]) {
      expect(approvalNotice({ date: '2026-10-12', notifyCleared: v, pastOrder: false }).body).not.toMatch(/기성|지급|청구/);
    }
  });
});

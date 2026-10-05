import { describe, expect, it } from 'vitest';
import { noteAudience, TAB_OF_SCOPE } from '@/lib/notify';

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

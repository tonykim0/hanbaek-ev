import { describe, expect, it } from 'vitest';
import { noteAudience, TAB_OF_SCOPE } from '@/lib/notify';

describe('진행현황 글은 상대방에게 알림으로 간다', () => {
  const p = { salesOrg: '네이비인프라', gcOrg: '대상전력' };
  it('협력사가 남기면 한백에게', () => {
    expect(noteAudience({ byHanbaek: false, scope: '계약', ...p })).toEqual({ kind: 'hanbaek' });
    expect(noteAudience({ byHanbaek: false, scope: '시공', ...p })).toEqual({ kind: 'hanbaek' });
  });
  it('한백이 남기면 그 일을 맡은 협력사에게 — 계약은 영업 쪽, 시공은 시공 쪽', () => {
    expect(noteAudience({ byHanbaek: true, scope: '계약', ...p })).toEqual({ kind: 'org', org: '네이비인프라' });
    expect(noteAudience({ byHanbaek: true, scope: '시공', ...p })).toEqual({ kind: 'org', org: '대상전력' });
  });
  it('한쪽이 비었으면 다른 쪽 · 둘 다 비었으면 아무에게도', () => {
    expect(noteAudience({ byHanbaek: true, scope: '계약', salesOrg: null, gcOrg: '에코일렉' })).toEqual({ kind: 'org', org: '에코일렉' });
    expect(noteAudience({ byHanbaek: true, scope: '시공', salesOrg: '에코일렉', gcOrg: null })).toEqual({ kind: 'org', org: '에코일렉' });
    expect(noteAudience({ byHanbaek: true, scope: '시공', salesOrg: null, gcOrg: null })).toBeNull();
  });
  it('기성 탭 글은 한백끼리의 기록이라 아무에게도 안 간다', () => {
    expect(noteAudience({ byHanbaek: true, scope: '기성', ...p })).toBeNull();
  });
  it('갈래마다 그 글이 서는 탭', () => {
    expect(TAB_OF_SCOPE).toEqual({ 계약: 'intake', 시공: 'construction', 기성: 'receivable' });
  });
});

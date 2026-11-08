/** 제안서를 못 짓는 까닭(lib/solar/proposal/blocker) — 화면 위에서부터 처음 걸리는 것 하나 */
import { describe, expect, it } from 'vitest';
import { proposalBlocker, type ProposalReadiness } from '@/lib/solar/proposal/blocker';

const ready: ProposalReadiness = {
  templatesLoaded: true,
  productChosen: true,
  templateState: null,
  pnu: '4313012345100010000',
  hasPlan: true,
  aiBusy: false,
  roofs: 3,
  selected: 2,
  customer: '(주)가나',
  address: '충북 충주시 동충주산단4길 17',
  seller: { company: '(주)가나에너지', person: '홍길동', phone: '010-1234-5678' },
};

describe('proposalBlocker', () => {
  it('다 갖추면 없다', () => expect(proposalBlocker(ready)).toBeNull());
  it('걸음마다 그 까닭', () => {
    expect(proposalBlocker({ ...ready, templatesLoaded: false })).toBe('템플릿 읽는 중');
    expect(proposalBlocker({ ...ready, productChosen: false })).toBe('상품 미선택');
    expect(proposalBlocker({ ...ready, templateState: '조건 미지정' })).toBe('조건 미지정');
    expect(proposalBlocker({ ...ready, pnu: null })).toBe('필지 없음');
    expect(proposalBlocker({ ...ready, hasPlan: false })).toBe('지도 자료 없음');
    expect(proposalBlocker({ ...ready, aiBusy: true })).toBe('AI 패널 배치 중');
    expect(proposalBlocker({ ...ready, roofs: 0, selected: 0 })).toBe('패널 배치 전');
    expect(proposalBlocker({ ...ready, selected: 0 })).toBe('고른 지붕 없음');
    expect(proposalBlocker({ ...ready, customer: '  ' })).toBe('고객명 없음');
    expect(proposalBlocker({ ...ready, address: '' })).toBe('주소 없음');
    expect(proposalBlocker({ ...ready, seller: { ...ready.seller, company: ' ' } })).toBe('영업사 없음');
    expect(proposalBlocker({ ...ready, seller: { ...ready.seller, person: '' } })).toBe('담당자명 없음');
    expect(proposalBlocker({ ...ready, seller: { ...ready.seller, phone: '' } })).toBe('연락처 없음');
    expect(proposalBlocker({ ...ready, seller: { ...ready.seller, phone: '010-123-4567' } })).toBe('연락처 11자리 아님');
  });
  it('여럿 걸리면 화면 위의 것 — 상품을 안 골랐으면 아래 칸이 비어도 「상품 미선택」', () => {
    expect(proposalBlocker({ ...ready, productChosen: false, templateState: null, customer: '', aiBusy: true })).toBe('상품 미선택');
    expect(proposalBlocker({ ...ready, aiBusy: true, roofs: 0, customer: '' })).toBe('AI 패널 배치 중');
  });
});

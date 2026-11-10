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
  kw: 123.45,
  minKw: 0,
  customer: '(주)가나',
  address: '충북 충주시 동충주산단4길 17',
  partyNeeded: false,
  party: null,
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
  it('참여 최소 용량 — 그 상품 기준으로 깐 용량이 못 미치면(꾸민 값), 비운 조건(0)이나 용량을 아직 모르면 막지 않는다', () => {
    expect(proposalBlocker({ ...ready, kw: 99.5, minKw: 150 })).toBe('150kW 미만(참여 최소 용량)');
    expect(proposalBlocker({ ...ready, kw: 150, minKw: 150 })).toBeNull();
    expect(proposalBlocker({ ...ready, kw: 99.5, minKw: 0 })).toBeNull();
    expect(proposalBlocker({ ...ready, kw: null, minKw: 150 })).toBeNull();
    // 배치 걸음이 먼저다 — 고른 지붕이 없으면 그 까닭
    expect(proposalBlocker({ ...ready, selected: 0, kw: 0, minKw: 150 })).toBe('고른 지붕 없음');
  });
  it('계약자 구분 — 받는 상품만, 고르기 전에는 막는다', () => {
    expect(proposalBlocker({ ...ready, partyNeeded: true })).toBe('계약자 구분 미지정');
    expect(proposalBlocker({ ...ready, partyNeeded: true, party: 'personal' })).toBeNull();
    expect(proposalBlocker({ ...ready, partyNeeded: false, party: null })).toBeNull();
    expect(proposalBlocker({ ...ready, partyNeeded: true, address: '' })).toBe('주소 없음');
  });
  it('여럿 걸리면 화면 위의 것 — 상품을 안 골랐으면 아래 칸이 비어도 「상품 미선택」', () => {
    expect(proposalBlocker({ ...ready, productChosen: false, templateState: null, customer: '', aiBusy: true })).toBe('상품 미선택');
    expect(proposalBlocker({ ...ready, aiBusy: true, roofs: 0, customer: '' })).toBe('AI 패널 배치 중');
  });
});

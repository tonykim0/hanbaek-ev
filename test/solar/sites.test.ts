import { describe, expect, it } from 'vitest';
import { canRegisterSite, cleanSiteInput, draftOf, siteIdOf, SITE_LIMITS } from '@/lib/solar/sites';

const ok = { name: '  에코텍이엔지 동충주공장 ', address: '충북 충주시 산척면 동충주산단4길 17', kind: 'roof' };

describe('상담 접수 — 받은 값 다듬기 (화면 · 저장소가 같은 규칙)', () => {
  it('앞뒤 빈칸을 걷고, 비운 칸은 null 이다', () => {
    expect(cleanSiteInput({ ...ok, customer: ' ', phone: '', memo: undefined })).toEqual({
      name: '에코텍이엔지 동충주공장',
      address: '충북 충주시 산척면 동충주산단4길 17',
      kind: 'roof',
      customer: null,
      phone: null,
      memo: null,
    });
  });

  it('현장명 · 주소 · 설치 형태가 있어야 접수다 — 빠진 칸의 말로 막는다', () => {
    expect(() => cleanSiteInput({ ...ok, name: '   ' })).toThrow('현장명');
    expect(() => cleanSiteInput({ ...ok, address: '' })).toThrow('주소');
    expect(() => cleanSiteInput({ ...ok, kind: 'roofs' })).toThrow('설치 형태');
    expect(() => cleanSiteInput(null)).toThrow('현장명');
  });

  it('길이 한도를 넘으면 막는다', () => {
    expect(() => cleanSiteInput({ ...ok, name: 'ㄱ'.repeat(SITE_LIMITS.name + 1) })).toThrow('현장명');
    expect(() => cleanSiteInput({ ...ok, memo: 'ㄱ'.repeat(SITE_LIMITS.memo + 1) })).toThrow('상담 메모');
  });

  it('연락처는 숫자 모양을 강제하지 않는다 — 내선 · 말이 붙는다', () => {
    expect(cleanSiteInput({ ...ok, phone: '043-123-4567 (내선 2)' }).phone).toBe('043-123-4567 (내선 2)');
  });

  it('글자 값이 아니면 빈 것으로 본다', () => {
    expect(cleanSiteInput({ ...ok, customer: 12 }).customer).toBeNull();
  });
});

describe('현장 번호', () => {
  it('SL-연도-세 자리 순번 · 넘치면 그대로 늘어난다', () => {
    expect(siteIdOf(2026, 7)).toBe('SL-2026-007');
    expect(siteIdOf(2026, 1234)).toBe('SL-2026-1234');
  });
});

describe('누가 상담 접수를 하나 (2026-11-04 「한백도 접수하게해줘」)', () => {
  it('한백 관리자와 태양광 참여 협력사 — 열람 전용 · 참여하지 않는 협력사는 아니다', () => {
    expect(canRegisterSite({ role: 'admin' })).toBe(true);
    expect(canRegisterSite({ role: 'salesCons', solar: true })).toBe(true);
    expect(canRegisterSite({ role: 'sales', solar: true })).toBe(true);
    expect(canRegisterSite({ role: 'cons', solar: false })).toBe(false);
    expect(canRegisterSite({ role: 'cons' })).toBe(false);
    // 열람 전용은 태양광을 늘 보지만 쓰기가 없다
    expect(canRegisterSite({ role: 'viewer', solar: true })).toBe(false);
  });

  it('폼의 담당 협력사 — 고르기 전에는 null, 현장에서 오면 그 소속', () => {
    expect(draftOf().org).toBeNull();
    expect(draftOf({ org: '에코일렉' }).org).toBe('에코일렉');
  });
});

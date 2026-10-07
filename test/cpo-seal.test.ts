import { describe, expect, it } from 'vitest';
import { needsCpoSeal, sealPrompt, sealReadOf } from '@/lib/cpo-seal';

describe('운영사 직인 — 누구의 계약서를 읽나', () => {
  it('현대엔지니어링·SK일렉링크만', () => {
    expect(needsCpoSeal('현대엔지니어링')).toBe(true);
    expect(needsCpoSeal('SK일렉링크')).toBe(true);
    expect(needsCpoSeal('나이스인프라')).toBe(false);
    expect(needsCpoSeal('플러그링크')).toBe(false);
    expect(needsCpoSeal(null)).toBe(false);
    expect(needsCpoSeal(undefined)).toBe(false);
  });

  it('물음에 그 운영사의 이름과 자리가 들어간다', () => {
    expect(sealPrompt('현대엔지니어링')).toContain('충전사업자');
    expect(sealPrompt('SK일렉링크')).toContain('서비스제공자');
  });
});

describe('운영사 직인 — 판독의 답 읽기', () => {
  it('찾았으면 찍힘·비어 있음 그대로', () => {
    expect(sealReadOf({ found: true, seal: true, page: 2 })).toEqual({ seal: true, page: 2 });
    expect(sealReadOf({ found: true, seal: false, page: 2 })).toEqual({ seal: false, page: 2 });
  });

  it('서명 칸을 못 찾았으면 seal 은 null — 비어 있음(false)과 섞지 않는다', () => {
    expect(sealReadOf({ found: false, seal: false, page: null })).toEqual({ seal: null, page: null });
    expect(sealReadOf({ seal: true })).toEqual({ seal: null, page: null });
    expect(sealReadOf(null)).toEqual({ seal: null, page: null });
  });

  it('모양이 틀린 값은 버린다', () => {
    expect(sealReadOf({ found: true, seal: 'yes', page: '2' })).toEqual({ seal: null, page: null });
    expect(sealReadOf({ found: true, seal: true, page: 0 })).toEqual({ seal: true, page: null });
    expect(sealReadOf({ found: true, seal: true, page: 2.4 })).toEqual({ seal: true, page: 2 });
  });
});

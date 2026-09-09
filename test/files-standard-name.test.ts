/**
 * 표준 파일명 — 분류가 있는 서류는 「기타」로 붙지 않는다 (감사 2026-09-04 M24).
 * 분류(doc-category-map)에 카테고리를 더하면 여기 줄임말도 더해야 한다 — 빠지면 이 시험이 잡는다.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORY_TO_KIND } from '@/lib/doc-category-map';
import { buildStandardName } from '@/lib/files';

describe('buildStandardName', () => {
  it('분류가 있는 모든 카테고리에 줄임말이 있다', () => {
    for (const category of Object.keys(CATEGORY_TO_KIND)) {
      if (category === '기타') continue;
      const name = buildStandardName('시험현장', category);
      expect(name, `${category} → ${name}`).not.toContain('_기타');
    }
  });
  it('감사 M24 의 넷', () => {
    expect(buildStandardName('시험현장', '기설치 충전기 설치이력')).toContain('기설치이력');
    expect(buildStandardName('시험현장', '기설치 증빙자료')).toContain('기설치증빙');
    expect(buildStandardName('시험현장', '별지2 사전체크리스트')).toContain('사전체크리스트');
    expect(buildStandardName('시험현장', '설치승낙서')).toContain('설치승낙서');
  });
});

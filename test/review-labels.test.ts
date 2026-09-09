/** 검수 이력의 종류 이름 — 감사 2026-09-04 L7 */
import { describe, expect, it } from 'vitest';
import { reviewKindLabel } from '@/lib/review-labels';

describe('reviewKindLabel', () => {
  it('내부 필드명은 우리 말로', () => {
    expect(reviewKindLabel('contractConfirmedAt')).toBe('계약 확인');
    expect(reviewKindLabel('preInstall')).toBe('기설치 조사');
    expect(reviewKindLabel('process.status')).toBe('공정 단계');
  });
  it('공정 서류 키는 접두사가 있어도 이름으로', () => {
    expect(reviewKindLabel('notify')).toBe('행위신고');
    expect(reviewKindLabel('process.notify')).toBe('행위신고');
  });
  it('계약 서류 키는 정의의 이름으로, 모르는 것은 원문', () => {
    expect(reviewKindLabel('contract')).toBe('계약서');
    expect(reviewKindLabel('what-is-this')).toBe('what-is-this');
  });
});

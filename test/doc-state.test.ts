/** 서류 칸 상태 글자 — 감사 2026-09-04 L8 */
import { describe, expect, it } from 'vitest';
import { docState } from '@/lib/doc-state';
import type { ProjectDocument } from '@/types/project';

const doc = (status: ProjectDocument['status']): ProjectDocument =>
  ({ kind: 'etc', files: [], filename: null, blobUrl: null, status, rejectReason: null, uploadedBy: null, uploadedAt: null }) as ProjectDocument;

describe('docState', () => {
  it('선택 칸도 파일이 있으면 제출됨, 반려면 반려다', () => {
    expect(docState(doc('uploaded'), 'o').label).toBe('제출됨');
    expect(docState(doc('rejected'), 'o').label).toBe('반려');
    expect(docState(doc('approved'), 'o').label).toBe('확인함');
  });
  it('선택 칸이 비어 있을 때만 해당없음', () => {
    expect(docState(undefined, 'o').label).toBe('해당없음');
    expect(docState(doc('none'), 'o').label).toBe('해당없음');
  });
  it('필수·조건부는 비면 미제출', () => {
    expect(docState(undefined, 'm')).toEqual({ label: '미제출', tone: 'text-red-700' });
    expect(docState(doc('none'), 'c').label).toBe('미제출');
  });
});

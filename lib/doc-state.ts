/**
 * 서류 칸의 상태 글자 — 감사 2026-09-04 L8.
 * 선택(req 'o') 칸이라도 파일이 있거나 반려됐으면 그것이 상태다. 「해당없음」은 비어 있을 때의 말이다.
 */
import type { ProjectDocument } from '@/types/project';
import type { DocReq } from '@/lib/doc-rules';

export function docState(doc: ProjectDocument | undefined, req: DocReq): { label: string; tone: string } {
  if (doc && doc.status === 'rejected') return { label: '반려', tone: 'text-red-700' };
  // 제출된 것은 통과로 본다 — 반려하지 않는 한 계약 완료를 막지 않는다
  if (doc && doc.status === 'uploaded') return { label: '제출됨', tone: 'text-brand-700' };
  if (doc && doc.status === 'approved') return { label: '확인함', tone: 'text-brand-700' };
  if (req === 'o') return { label: '해당없음', tone: 'text-slate-400' };
  return req === 'm'
    ? { label: '미제출', tone: 'text-red-700' }
    : { label: '미제출', tone: 'text-slate-400' };
}

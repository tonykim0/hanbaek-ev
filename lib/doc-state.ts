/**
 * 서류 칸의 상태 글자 — 감사 2026-09-04 L8.
 * 선택(req 'o') 칸이라도 파일이 있거나 반려됐으면 그것이 상태다. 「해당없음」은 비어 있을 때의 말이다.
 */
import type { ProjectDocument } from '@/types/project';
import type { DocReq } from '@/lib/doc-rules';

/**
 * ★보완하며 새로 올린 칸★ (한백 지시 2026-10-08 「이번에 어떤 부분이 업데이트됐는지 그 칸만 하이라이트」) — 칸의 파일 중
 * 이번 판에 새로 온 것이 있으면 그 칸이 받았던 반려 사유(없으면 null)를, 아니면 undefined.
 */
export function resubmitOf(doc: ProjectDocument | undefined): { reason: string | null } | undefined {
  const fresh = doc?.files.filter((f) => f.resubmit) ?? [];
  if (fresh.length === 0) return undefined;
  return { reason: fresh.find((f) => f.resubmit?.reason)?.resubmit?.reason ?? null };
}

export function docState(doc: ProjectDocument | undefined, req: DocReq): { label: string; tone: string } {
  if (doc && doc.status === 'rejected') return { label: '반려', tone: 'text-red-700' };
  if (resubmitOf(doc)) return { label: '새로 올림', tone: 'text-sky-700' };
  // 제출된 것은 통과로 본다 — 반려하지 않는 한 계약 완료를 막지 않는다
  if (doc && doc.status === 'uploaded') return { label: '제출됨', tone: 'text-brand-700' };
  if (doc && doc.status === 'approved') return { label: '확인함', tone: 'text-brand-700' };
  if (req === 'o') return { label: '해당없음', tone: 'text-slate-400' };
  return req === 'm'
    ? { label: '미제출', tone: 'text-red-700' }
    : { label: '미제출', tone: 'text-slate-400' };
}

/**
 * 채운 서식을 파일로 — 세 생성기(fill-hec · fill-ledger · fill-pluglink)가 같이 쓴다.
 *
 * 브라우저에서는 Blob(내려받기), 시험(node)에서는 Uint8Array 로 묶는다.
 */
import type JSZip from 'jszip';

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export function packZip(zip: JSZip, kind: keyof typeof MIME): Promise<Blob | Uint8Array> {
  const opts = { compression: 'DEFLATE' as const };
  return typeof Blob !== 'undefined' && typeof window !== 'undefined'
    ? zip.generateAsync({ ...opts, type: 'blob', mimeType: MIME[kind] })
    : zip.generateAsync({ ...opts, type: 'uint8array' });
}

/** 협력사가 받는 파일 이름 — 접수 ZIP 의 표준 이름과 같은 꼴(현장명_서류명) */
export const surveyFileName = (siteName: string, kind: keyof typeof MIME) =>
  `${siteName.trim() || '현장'}_실사보고서 (사진대지).${kind}`;

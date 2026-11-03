/**
 * 브라우저에서 — 파일 한 장을 그 태양광 현장의 자리에 올리고 붙인다(접수 폼 · 현장 상세가 같이 쓴다).
 *
 * 세 걸음: 토큰(자리는 우리가 짓는다 — siteFilePathname) → Blob 에 바로 올리기(서버리스 본문 한도 4.5MB 를 피한다) → 붙이기
 * (서버가 우리 저장소에서 그 자리를 다시 찾아 적는다). 전기차 서류 칸(components/DocFiles)과 같은 길이다.
 * 실패하면 그 까닭(한글)을 던진다 — 부르는 쪽이 누른 자리 옆에 띄운다.
 */
import { docContentType } from '@/types/project';
import { SITE_FILE_MAX_BYTES, siteFilePathname } from './sites';

const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

export async function uploadSiteFile(siteId: string, file: File, onPct?: (pct: number) => void): Promise<void> {
  if (file.size > SITE_FILE_MAX_BYTES) throw new Error(`${file.name} — ${mb(file.size)}MB · ${mb(SITE_FILE_MAX_BYTES)}MB 까지입니다.`);
  const pathname = siteFilePathname(siteId, file.name);
  const json = { 'Content-Type': 'application/json' };

  const t = await fetch(`/api/solar/sites/${siteId}/files?step=token`, { method: 'POST', headers: json, body: JSON.stringify({ pathname }) });
  const tb = (await t.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!t.ok || !tb.token) throw new Error(tb.error ?? '업로드 준비에 실패했습니다.');

  const { put } = await import('@vercel/blob/client');
  const blob = await put(pathname, file, {
    access: 'public',
    token: tb.token,
    // 형식은 확장자로 — 한컴 엑셀처럼 브라우저가 말하는 형식을 Blob 이 거절하는 일이 있었다(types/project docContentType)
    contentType: docContentType(file.name, file.type),
    onUploadProgress: ({ percentage }) => onPct?.(Math.round(percentage)),
  });

  const c = await fetch(`/api/solar/sites/${siteId}/files`, { method: 'POST', headers: json, body: JSON.stringify({ blobUrl: blob.url, filename: file.name }) });
  if (!c.ok) {
    const cb = (await c.json().catch(() => ({}))) as { error?: string };
    throw new Error(cb.error ?? '올린 파일을 현장에 붙이지 못했습니다.');
  }
}

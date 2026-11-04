/**
 * 브라우저에서 — 자료 한 장을 태양광 자료실에 올린다(한백 관리자). 세 걸음: 토큰(자리는 lib/solar/library 의 규칙으로 우리가 짓는다)
 * → Blob 에 바로 올리기(서버리스 본문 한도 4.5MB 를 피한다 · 10MB 넘으면 나눠 올린다) → 확인(서버가 그 자리를 다시 찾아 기록한다).
 * 실패하면 그 까닭(한글)을 던진다 — 부르는 쪽이 누른 자리 옆에 띄운다.
 */
import { docContentType } from '@/types/project';
import { LIBRARY_MAX_BYTES, LIBRARY_MULTIPART_BYTES, libraryPathOf } from './library';

const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** @returns replaced — 같은 이름의 자료가 있어 교체했다(옛 본은 보관 자리에 남았다) */
export async function uploadLibraryFile(category: string, file: File, onPct?: (pct: number) => void): Promise<{ replaced: boolean }> {
  if (file.size > LIBRARY_MAX_BYTES) throw new Error(`${file.name} — ${mb(file.size)}MB · ${mb(LIBRARY_MAX_BYTES)}MB 까지입니다.`);
  const pathname = libraryPathOf(category, file.name);

  const t = await fetch('/api/solar/library?step=token', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ pathname }) });
  const tb = (await t.json().catch(() => ({}))) as { token?: string; replaced?: boolean; error?: string };
  if (!t.ok || !tb.token) throw new Error(`${file.name} — ${tb.error ?? '업로드 준비에 실패했습니다.'}`);

  const { put } = await import('@vercel/blob/client');
  await put(pathname, file, {
    access: 'public',
    token: tb.token,
    multipart: file.size > LIBRARY_MULTIPART_BYTES,
    // 형식은 확장자로 — 한컴 엑셀처럼 브라우저가 말하는 형식을 Blob 이 거절하는 일이 있었다(types/project docContentType)
    contentType: docContentType(file.name, file.type),
    onUploadProgress: ({ percentage }) => onPct?.(Math.round(percentage)),
  });

  const c = await fetch('/api/solar/library', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ pathname }) });
  if (!c.ok) {
    const cb = (await c.json().catch(() => ({}))) as { error?: string };
    throw new Error(`${file.name} — ${cb.error ?? '올린 자료를 확인하지 못했습니다.'}`);
  }
  return { replaced: !!tb.replaced };
}

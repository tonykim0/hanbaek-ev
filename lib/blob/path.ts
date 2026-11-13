/**
 * 파일 주소 ↔ 저장소 경로 — 순수(브라우저 · 서버 둘 다 쓴다).
 *
 * ★파일은 비공개 저장소에 있다★ (2026-11-14 사용자 「그래 비공개로 전환해줘」). 공개 저장소일 때는 DB 에 적힌
 * Blob 주소(`https://<저장소>.public.blob.vercel-storage.com/<경로>`)를 브라우저가 그대로 열었다 — 주소만 알면
 * 로그인 없이 계약서 · 사업자등록증 · 통장사본이 열렸고, 주소가 한 번 퍼지면 거둘 길이 없었다.
 *
 * 이제 브라우저는 ★콘솔의 문★(`/api/files/<경로>`)으로만 파일을 받는다 — 문이 로그인과 「이 사람이 이 파일을
 * 볼 수 있는가」를 본 뒤 5분짜리 서명 주소로 넘긴다(app/api/files). 서버는 SDK 로 읽는다(lib/blob/server).
 *
 * ★DB 의 주소는 고치지 않는다★ — 옛 공개 저장소의 주소든 새 비공개 저장소의 주소든 ★경로★만 뽑아 지금의
 * 저장소에서 찾는다. 옮길 때 파일을 같은 경로로 복사했기 때문이다(lib/blob/sync). 그래서 옛 주소가
 * 수천 곳의 jsonb 에 남아 있어도 다 그대로 열린다.
 */

/** 올리는 파일의 공개 범위 — 저장소가 비공개라 이 값이어야 한다(다르면 SDK 가 거절한다). 브라우저 올리기도 이것 */
export const BLOB_ACCESS = 'private' as const;

/** 우리 Blob 주소의 호스트 — 공개(public) · 비공개(private) 저장소 둘 다 */
export const BLOB_HOST_RE = /^[a-z0-9]+\.(public|private)\.blob\.vercel-storage\.com$/i;

/** 콘솔의 파일 문 — 브라우저가 파일을 받는 유일한 길 */
export const FILE_ROUTE = '/api/files/';

function decodePath(p: string): string | null {
  try {
    const out = decodeURIComponent(p);
    return out && !out.startsWith('/') && !out.split('/').includes('..') ? out : null;
  } catch {
    return null;
  }
}

/**
 * 주소에서 저장소 경로를 뽑는다 — Blob 주소(공개 · 비공개 · `?download=1` 이 붙은 것) · 파일 문 주소 둘 다.
 * 우리 것이 아니면 null(다른 호스트 · 깨진 주소 · `..` 이 든 경로).
 */
export function blobPathOf(urlOrHref: string | null | undefined): string | null {
  if (!urlOrHref) return null;
  if (urlOrHref.startsWith(FILE_ROUTE)) return decodePath(urlOrHref.slice(FILE_ROUTE.length).split('?')[0]);
  let u: URL;
  try {
    u = new URL(urlOrHref);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (BLOB_HOST_RE.test(u.hostname)) return decodePath(u.pathname.slice(1));
  // 다른 주소에서 온 파일 문 주소(https://hanbaek-re.vercel.app/api/files/…)도 같은 경로다
  if (u.pathname.startsWith(FILE_ROUTE)) return decodePath(u.pathname.slice(FILE_ROUTE.length));
  return null;
}

/** 우리 저장소의 파일 주소인가 — Blob 주소 · 파일 문 주소 */
export function isBlobUrl(url: string | null | undefined): boolean {
  return blobPathOf(url) !== null;
}

/**
 * 브라우저에 줄 주소 — 우리 파일이면 파일 문, 아니면 그대로(정적 파일 /notices/files/… · 바깥 주소).
 * `download` 면 받기(첨부)로 연다.
 */
export function fileHref(url: string | null | undefined, opts?: { download?: boolean }): string {
  if (!url) return '';
  const path = blobPathOf(url);
  if (path === null) return url;
  const q = opts?.download ? '?download=1' : '';
  return FILE_ROUTE + path.split('/').map(encodeURIComponent).join('/') + q;
}

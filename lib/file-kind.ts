/**
 * 파일의 형식 — 미리보기를 그릴 수 있는가 · 사진인가. 전기차 서류 칸(components/DocFiles)과 태양광 첨부파일
 * (components/solar/SiteFiles)이 같은 기준을 쓴다(2026-11-03 태양광에 미리보기를 붙이며 DocFiles 에서 꺼냈다).
 */

/** 이름(없으면 주소)의 확장자 — 소문자. 못 읽으면 pdf 로 본다(서류 칸의 옛 기록에는 이름이 없는 장이 있다) */
export function extOf(file: { name?: string | null; url?: string | null }): string {
  const from = file.name ?? file.url ?? '';
  const m = from.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'pdf';
}

/** 브라우저가 탭에서 그려주는 형식 — 그 밖(엑셀 · 워드 · 한글)은 내려받아야 열린다 */
export const PREVIEWABLE = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt'];
/** 줄에서 바로 그려 보여줄 수 있는 형식 — 사진 */
export const THUMBNAIL = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

export const isImageFile = (file: { name?: string | null; url?: string | null }): boolean => THUMBNAIL.includes(extOf(file));
export const canPreviewFile = (file: { name?: string | null; url?: string | null }): boolean => PREVIEWABLE.includes(extOf(file));

/** 크기 — 1MB 부터 소수 한 자리 MB, 그 밑은 KB(0 이어도 1KB) */
export const sizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

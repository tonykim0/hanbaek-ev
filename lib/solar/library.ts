/**
 * 태양광 자료실 (2026-11-04, 한백 「태양광사업관리 페이지에서도 자료실 기능을 만들어줘 · 제목은 운영사 자료실 아니고 그냥 자료실 ·
 * 우리가 업로드 할 수 있는 기능도 · 왼쪽 사이드바에」). 순수 모듈이다 — 화면(올리기)과 서버(토큰 · 목록)가 같은 자리 규칙을 쓴다.
 *
 * ★전기차 자료실(lib/materials)과 같은 방식이다★ — DB 없이 Blob 의 한 자리를 그대로 나열한다(올리면 배포 없이 바로 보인다).
 * 다른 것 둘: ① 운영사 층이 없다(태양광에는 운영사가 없다) ② 분류를 정해 두지 않는다 — 올리는 한백이 이름을 붙이고, 비워도 된다.
 * 태양광 자료가 어떤 갈래로 쌓일지 아직 모른다(전기차는 셋으로 시작해 실제로 올라온 것을 보고 여섯으로 다시 갈랐다).
 *
 *   solar-materials/<분류>/<파일명>      분류를 붙인 자료
 *   solar-materials/<파일명>             분류 없는 자료
 *
 * 같은 자리로 다시 올리면 교체된다 — 밀려난 옛 본과 뺀 자료는 목록 밖(solar-materials-archive/)에 한 부 남긴다(전기차와 같은 보험:
 * Blob 에는 버전도 휴지통도 없다).
 */
import { archiveStamp, sanitizeFileName } from '@/lib/materials-meta';

export const LIBRARY_PREFIX = 'solar-materials/';
/** 목록 밖 보관 자리 — 목록은 LIBRARY_PREFIX 로 시작하는 것만 훑으므로 여기는 안 뜬다 */
export const LIBRARY_ARCHIVE_PREFIX = 'solar-materials-archive/';
/** 한 장의 한도 — 전기차 자료실과 같다(원본 브로슈어 · 도면 묶음) */
export const LIBRARY_MAX_BYTES = 500 * 1024 * 1024;
/** 이만큼 넘으면 나눠 올린다(전기차 자료실과 같은 값) */
export const LIBRARY_MULTIPART_BYTES = 10 * 1024 * 1024;
export const LIBRARY_CATEGORY_MAX = 30;
export const LIBRARY_NAME_MAX = 200;
/** 분류 없는 자료의 묶음 이름 — 분류를 붙인 자료와 같이 있을 때만 머리로 선다 */
export const LOOSE_LABEL = '분류 없음';

export type LibraryFile = {
  /** solar-materials/… — 빼기 · 교체의 열쇠 */
  pathname: string;
  url: string;
  /** 누르면 내려받아지는 주소(Blob 이 준다) */
  downloadUrl: string;
  /** 화면에 적는 이름 — 파일명 그대로(완성형) */
  name: string;
  /** 분류 — 없으면 null */
  category: string | null;
  size: number;
  /** 올린 시각(ISO) */
  uploadedAt: string;
};

/** 한 칸의 이름 — 경로 구분자 · 제어문자 · 앞의 점을 걷고 완성형으로(전기차 자료실과 같은 다듬기) */
const clean = (s: string) => sanitizeFileName(s);

/** 올릴 자리 — 분류가 비면 바로 밑 */
export function libraryPathOf(category: string, fileName: string): string {
  const c = clean(category);
  return c ? `${LIBRARY_PREFIX}${c}/${clean(fileName)}` : `${LIBRARY_PREFIX}${clean(fileName)}`;
}

/**
 * 자료실 자리인가 — 한 칸(파일) 또는 두 칸(분류/파일)이고, 칸마다 다듬은 이름 ★그대로★여야 한다(완성형까지).
 * 토큰 발급 · 빼기가 이것으로 임의 경로를 막는다(남의 자리 — 현장 파일 · 전기차 자료 — 를 덮거나 지우는 길).
 * 전기차 자료실은 예전에 자모가 갈라진(NFD) 이름으로 올라간 파일이 있어 그것도 받지만, 여기는 올리는 길이 처음부터
 * libraryPathOf 하나라 완성형만 받는다 — 같은 이름이 두 자리로 갈리지 않게.
 */
export function isLibraryPath(pathname: string): boolean {
  if (!pathname.startsWith(LIBRARY_PREFIX) || pathname.includes('..')) return false;
  const parts = pathname.slice(LIBRARY_PREFIX.length).split('/');
  if (parts.length > 2) return false;
  const fileName = parts[parts.length - 1];
  if (!fileName || fileName.length > LIBRARY_NAME_MAX || fileName !== clean(fileName)) return false;
  if (parts.length === 2) {
    const c = parts[0];
    if (!c || c.length > LIBRARY_CATEGORY_MAX || c !== clean(c)) return false;
  }
  return true;
}

/** 옛 본 · 뺀 자료가 옮겨 갈 자리 — 원래 자리를 품고 시각을 붙인다(한 자료의 옛 본이 한자리에 모인다) */
export function libraryArchivePathOf(pathname: string, now: Date = new Date()): string {
  const dot = pathname.lastIndexOf('.');
  const ext = dot > pathname.lastIndexOf('/') ? pathname.slice(dot) : '';
  return `${LIBRARY_ARCHIVE_PREFIX}${pathname}/${archiveStamp(now)}${ext}`;
}

/** Blob 한 건 → 자료. 자리 규칙에 안 맞으면 null(손으로 넣은 엉뚱한 것은 목록에 안 세운다) */
export function libraryFileOf(blob: { pathname: string; url: string; downloadUrl: string; size: number; uploadedAt: Date | string }): LibraryFile | null {
  if (!isLibraryPath(blob.pathname)) return null;
  const parts = blob.pathname.slice(LIBRARY_PREFIX.length).split('/');
  return {
    pathname: blob.pathname,
    url: blob.url,
    downloadUrl: blob.downloadUrl,
    name: parts[parts.length - 1].normalize('NFC'),
    category: parts.length === 2 ? parts[0].normalize('NFC') : null,
    size: blob.size,
    uploadedAt: new Date(blob.uploadedAt).toISOString(),
  };
}

const byName = (a: string, b: string) => a.localeCompare(b, 'ko', { numeric: true });

/**
 * 분류별로 묶는다 — 분류 없는 자료가 맨 앞, 분류는 이름순, 자료는 이름순(「2. 」가 「10. 」보다 앞 — 숫자는 수로 견준다).
 * 빈 묶음은 없다(파일이 있어야 분류가 있다 — 자리가 곧 분류다).
 */
export function groupLibrary(files: readonly LibraryFile[]): { category: string | null; files: LibraryFile[] }[] {
  const map = new Map<string | null, LibraryFile[]>();
  for (const f of files) map.set(f.category, [...(map.get(f.category) ?? []), f]);
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : byName(a, b)))
    .map(([category, list]) => ({ category, files: [...list].sort((x, y) => byName(x.name, y.name)) }));
}

/** 올릴 때 고를 수 있게 — 지금 있는 분류 이름 */
export const categoriesOf = (files: readonly LibraryFile[]): string[] =>
  [...new Set(files.map((f) => f.category).filter((c): c is string => !!c))].sort(byName);

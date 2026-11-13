/**
 * 태양광 자료실 목록 — Blob 의 solar-materials/ 를 그대로 읽는다(lib/solar/library 의 자리 규칙). 서버에서만 부른다.
 * 전기차 자료실(lib/materials getMaterials)과 같은 방식이다 — DB 가 없어 올리면 배포 없이 바로 보인다.
 */
import { LIBRARY_PREFIX, libraryFileOf, type LibraryFile } from './library';
import { hasBlobStore, listBlobs } from '@/lib/blob/server';

export type LibraryList = {
  files: LibraryFile[];
  /** Blob 이 연결되지 않았다(PRIVATE_BLOB_READ_WRITE_TOKEN 없음) */
  storageMissing: boolean;
  /** 목록을 못 읽은 까닭 — 화면이 띠로 알린다 */
  error: string | null;
};

export async function listSolarLibrary(): Promise<LibraryList> {
  if (!hasBlobStore()) return { files: [], storageMissing: true, error: null };
  const files: LibraryFile[] = [];
  try {
    for (const b of await listBlobs(LIBRARY_PREFIX)) {
      const f = libraryFileOf(b);
      if (f) files.push(f);
    }
  } catch (err) {
    console.error('[solar-library] 목록 조회 실패:', err);
    return { files: [], storageMissing: false, error: '자료 목록을 불러오지 못했습니다.' };
  }
  return { files, storageMissing: false, error: null };
}

/**
 * 태양광 자료실의 자리 규칙 (2026-11-04 — 「태양광사업관리 페이지에서도 자료실 · 우리가 업로드」).
 * 토큰 발급 · 빼기가 이 규칙으로 임의 경로를 막는다 — 현장 첨부파일(solar-sites/) · 전기차 자료(materials/)를 덮거나 지우는 길.
 */
import { describe, expect, it } from 'vitest';
import {
  categoriesOf, groupLibrary, isLibraryPath, LIBRARY_ARCHIVE_PREFIX, libraryArchivePathOf, libraryFileOf, libraryPathOf, type LibraryFile,
} from '@/lib/solar/library';

describe('올릴 자리', () => {
  it('분류가 있으면 solar-materials/분류/파일, 비우면 바로 밑 — 이름은 다듬는다(완성형 · 경로 구분자)', () => {
    expect(libraryPathOf('영업자료', '제안서 v1.pdf')).toBe('solar-materials/영업자료/제안서 v1.pdf');
    expect(libraryPathOf('  ', '제안서.pdf')).toBe('solar-materials/제안서.pdf');
    expect(libraryPathOf('인허가/계통', 'a/b.pdf')).toBe('solar-materials/인허가_계통/a_b.pdf');
    // 맥에서 고른 파일은 자모가 갈라진 NFD 로 온다 — 자리는 완성형이어야 같은 이름이 같은 자리다
    expect(libraryPathOf('', '모듈 사양서.pdf'.normalize('NFD'))).toBe('solar-materials/모듈 사양서.pdf');
  });

  it('자료실 자리만 받는다 — 다른 자리 · 위로 오르기 · 세 칸 · 다듬지 않은 이름은 아니다', () => {
    expect(isLibraryPath('solar-materials/제안서.pdf')).toBe(true);
    expect(isLibraryPath('solar-materials/영업자료/제안서.pdf')).toBe(true);
    expect(isLibraryPath('solar-sites/SL-2026-001/a.pdf')).toBe(false);
    expect(isLibraryPath('materials/sk/sales/a.pdf')).toBe(false);
    expect(isLibraryPath('solar-materials/../materials/a.pdf')).toBe(false);
    expect(isLibraryPath('solar-materials/a/b/c.pdf')).toBe(false);
    expect(isLibraryPath('solar-materials/')).toBe(false);
    expect(isLibraryPath('solar-materials//a.pdf')).toBe(false);
    expect(isLibraryPath('solar-materials/ a.pdf')).toBe(false); // 다듬으면 앞 빈칸이 걷힌다 — 다듬은 그대로가 아니다
    expect(isLibraryPath(`solar-materials/${'가'.repeat(31)}/a.pdf`)).toBe(false); // 분류는 30자까지
    expect(isLibraryPath('solar-materials/모듈.pdf'.normalize('NFD'))).toBe(false);
  });

  it('보관 자리 — 원래 자리를 품고 서울 시각과 확장자를 붙인다(목록 밖)', () => {
    const at = new Date('2026-11-04T05:06:07Z'); // 서울 14:06:07
    expect(libraryArchivePathOf('solar-materials/영업자료/제안서.pdf', at)).toBe(
      `${LIBRARY_ARCHIVE_PREFIX}solar-materials/영업자료/제안서.pdf/20261104-140607.pdf`,
    );
    expect(libraryArchivePathOf('solar-materials/README', at)).toBe(`${LIBRARY_ARCHIVE_PREFIX}solar-materials/README/20261104-140607`);
    expect(isLibraryPath(libraryArchivePathOf('solar-materials/a.pdf', at))).toBe(false);
  });
});

const blob = (pathname: string, at = '2026-11-04T00:00:00Z') => ({
  pathname,
  url: `https://x.public.blob.vercel-storage.com/${pathname}`,
  downloadUrl: `https://x.public.blob.vercel-storage.com/${pathname}?download=1`,
  size: 1024,
  uploadedAt: new Date(at),
});

describe('목록', () => {
  it('Blob 한 건 → 자료 — 분류 · 이름을 자리에서 읽고, 규칙 밖의 것은 세우지 않는다', () => {
    expect(libraryFileOf(blob('solar-materials/영업자료/제안서.pdf'))).toMatchObject({ category: '영업자료', name: '제안서.pdf', size: 1024 });
    expect(libraryFileOf(blob('solar-materials/제안서.pdf'))?.category).toBeNull();
    expect(libraryFileOf(blob('solar-materials/a/b/c.pdf'))).toBeNull();
  });

  it('분류 없는 자료가 맨 앞, 분류는 이름순, 자료는 이름순 — 숫자는 수로(2 가 10 보다 앞)', () => {
    const files = [
      'solar-materials/인허가/10. 개발행위.pdf',
      'solar-materials/인허가/2. 발전사업허가.pdf',
      'solar-materials/영업자료/제안서.pdf',
      'solar-materials/회사소개서.pdf',
    ].map((p) => libraryFileOf(blob(p)) as LibraryFile);
    const g = groupLibrary(files);
    expect(g.map((x) => x.category)).toEqual([null, '영업자료', '인허가']);
    expect(g[2].files.map((f) => f.name)).toEqual(['2. 발전사업허가.pdf', '10. 개발행위.pdf']);
    expect(categoriesOf(files)).toEqual(['영업자료', '인허가']);
  });
});

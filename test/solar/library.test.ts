/**
 * 태양광 자료실의 자리 규칙 (2026-11-04 — 「태양광사업관리 페이지에서도 자료실 · 우리가 업로드」).
 * 토큰 발급 · 빼기가 이 규칙으로 임의 경로를 막는다 — 현장 첨부파일(solar-sites/) · 전기차 자료(materials/)를 덮거나 지우는 길.
 */
import { describe, expect, it } from 'vitest';
import {
  categoriesOf, filterLibrary, groupLibrary, isLibraryPath, LIBRARY_ARCHIVE_PREFIX, libraryArchivePathOf, libraryFileOf, libraryPathOf,
  libraryPickOf, type LibraryFile,
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

describe('거르기 — 분류 칩 · 검색 (2026-11-25 「분류별로 쭉 스크롤 해야해」)', () => {
  const files = [
    'solar-materials/인허가/2. 발전사업허가.pdf',
    'solar-materials/인허가/10. 개발행위 허가.pdf',
    'solar-materials/영업자료/제안서 모햇.pptx',
    'solar-materials/영업자료/제안서 솔라15.pptx',
    'solar-materials/회사소개서.pdf',
  ].map((p) => libraryFileOf(blob(p)) as LibraryFile);
  const names = (v: ReturnType<typeof filterLibrary>) => v.shown.flatMap((g) => g.files.map((f) => f.name));

  it('전체면 묶음 차례 그대로 · 칩은 분류 없음이 맨 앞이고 수를 단다', () => {
    const v = filterLibrary(files, { query: '', category: undefined });
    expect(v.count).toBe(5);
    expect(v.chips).toEqual([
      { category: null, label: '분류 없음', count: 1 },
      { category: '영업자료', label: '영업자료', count: 2 },
      { category: '인허가', label: '인허가', count: 2 },
    ]);
    expect(v.all).toBe(5);
  });

  it('칩을 고르면 그 분류만 — 분류 없음(null)도 고른다', () => {
    expect(names(filterLibrary(files, { query: '', category: '인허가' }))).toEqual(['2. 발전사업허가.pdf', '10. 개발행위 허가.pdf']);
    expect(names(filterLibrary(files, { query: '', category: null }))).toEqual(['회사소개서.pdf']);
  });

  it('★칩의 수는 검색을 먹인 수다★ — 칩 자리는 그대로(0 도 적는다) · 낱말이 다 들어야 맞음 · 분류 이름으로도 찾는다', () => {
    const v = filterLibrary(files, { query: '허가', category: undefined });
    expect(v.chips.map((c) => c.count)).toEqual([0, 0, 2]);
    expect(v.all).toBe(2);
    expect(names(filterLibrary(files, { query: '제안서 모햇', category: undefined }))).toEqual(['제안서 모햇.pptx']);
    expect(filterLibrary(files, { query: '영업자료', category: undefined }).count).toBe(2);
    expect(filterLibrary(files, { query: 'PPTX', category: undefined }).count).toBe(2); // 대소문자 무시
  });

  it('검색과 칩은 겹쳐 좁힌다 — 0건이면 묶음도 없다', () => {
    expect(names(filterLibrary(files, { query: '솔라', category: '영업자료' }))).toEqual(['제안서 솔라15.pptx']);
    const none = filterLibrary(files, { query: '솔라', category: '인허가' });
    expect(none.count).toBe(0);
    expect(none.shown).toEqual([]);
  });

  it('주소의 cat — 없으면 전체 · 빈 값이면 분류 없음 · 지금 없는 분류면 전체', () => {
    expect(libraryPickOf(null, files)).toBeUndefined();
    expect(libraryPickOf('', files)).toBeNull();
    expect(libraryPickOf('인허가', files)).toBe('인허가');
    expect(libraryPickOf('없는분류', files)).toBeUndefined();
    // 분류 없는 자료가 없는 자료실에서 「분류 없음」을 열면 전체
    expect(libraryPickOf('', files.filter((f) => f.category !== null))).toBeUndefined();
  });
});

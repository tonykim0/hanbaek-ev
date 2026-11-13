/**
 * 파일 주소 → 저장소 경로 — 옛 공개 저장소 주소 · 새 비공개 저장소 주소 · 파일 문 주소가 같은 경로로 모여야
 * DB 의 주소를 고치지 않고 비공개로 옮길 수 있다(lib/blob/path 머리말).
 */
import { describe, expect, it } from 'vitest';
import { blobPathOf, fileHref, isBlobUrl } from '@/lib/blob/path';

const OLD = 'https://ivbvhnhxxxhywujn.public.blob.vercel-storage.com';
const NEW = 'https://abcdef0123456789.private.blob.vercel-storage.com';

describe('blobPathOf', () => {
  it('공개 · 비공개 저장소 주소가 같은 경로', () => {
    expect(blobPathOf(`${OLD}/projects/HB-2026-265/approval-1792995140278.pptx`)).toBe('projects/HB-2026-265/approval-1792995140278.pptx');
    expect(blobPathOf(`${NEW}/projects/HB-2026-265/approval-1792995140278.pptx`)).toBe('projects/HB-2026-265/approval-1792995140278.pptx');
  });

  it('한글 · 빈칸 · 괄호는 풀어서 · ?download=1 은 뗀다', () => {
    const url = `${OLD}/materials/%EB%82%98%EC%9D%B4%EC%8A%A4/%EA%B3%84%EC%95%BD%EC%84%9C%20(1).pdf?download=1`;
    expect(blobPathOf(url)).toBe('materials/나이스/계약서 (1).pdf');
  });

  it('파일 문 주소도 같은 경로 — 상대 · 절대 둘 다', () => {
    expect(blobPathOf('/api/files/materials/%EB%82%98%EC%9D%B4%EC%8A%A4/a.pdf?download=1')).toBe('materials/나이스/a.pdf');
    expect(blobPathOf('https://hanbaek-re.vercel.app/api/files/projects/HB-2026-1/a.pdf')).toBe('projects/HB-2026-1/a.pdf');
  });

  it('우리 것이 아니면 null — 다른 호스트 · http · 깨진 인코딩 · .. 경로 · 빈 값', () => {
    expect(blobPathOf('https://example.com/projects/a.pdf')).toBeNull();
    expect(blobPathOf('https://evil.blob.vercel-storage.com.example.com/a.pdf')).toBeNull();
    expect(blobPathOf('http://ivbvhnhxxxhywujn.public.blob.vercel-storage.com/a.pdf')).toBeNull();
    expect(blobPathOf(`${OLD}/a%E0%A4%A.pdf`)).toBeNull();
    expect(blobPathOf('/api/files/projects/../partner-docs/x.pdf')).toBeNull();
    expect(blobPathOf('/notices/files/legacy-charger-history-template.xlsx')).toBeNull();
    expect(blobPathOf('')).toBeNull();
    expect(blobPathOf(null)).toBeNull();
  });
});

describe('fileHref', () => {
  it('우리 파일은 파일 문으로 — 경로는 마디마다 인코딩', () => {
    expect(fileHref(`${OLD}/materials/%EB%82%98%EC%9D%B4%EC%8A%A4/%EA%B3%84%EC%95%BD%EC%84%9C%20(1).pdf`))
      .toBe('/api/files/materials/%EB%82%98%EC%9D%B4%EC%8A%A4/%EA%B3%84%EC%95%BD%EC%84%9C%20(1).pdf');
    expect(fileHref(`${NEW}/projects/HB-2026-1/a.pdf`, { download: true })).toBe('/api/files/projects/HB-2026-1/a.pdf?download=1');
  });

  it('파일 문 주소를 다시 넣어도 같은 주소', () => {
    const once = fileHref(`${OLD}/projects/HB-2026-1/a b.pdf`);
    expect(fileHref(once)).toBe(once);
  });

  it('우리 것이 아니면 그대로 — 정적 파일 · 바깥 주소 · 빈 값', () => {
    expect(fileHref('/notices/files/a.xlsx')).toBe('/notices/files/a.xlsx');
    expect(fileHref('https://example.com/a.pdf')).toBe('https://example.com/a.pdf');
    expect(fileHref(undefined)).toBe('');
  });

  it('isBlobUrl', () => {
    expect(isBlobUrl(`${NEW}/a.pdf`)).toBe(true);
    expect(isBlobUrl('/api/files/a.pdf')).toBe(true);
    expect(isBlobUrl('/notices/a.pdf')).toBe(false);
  });
});

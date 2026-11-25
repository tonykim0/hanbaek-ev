/**
 * 운영사 자료실 거르기 — 운영사 탭 · 분류 칩 · 검색 (한백 2026-11-25 「자료실에서 필요한 자료를 바로 확인 할 수 있는 필터를
 * 걸어줘 지금은 분류별로 쭉 스크롤 해야해」).
 *
 * ★건수는 「눌렀을 때 나올 수」다★ — 탭의 수는 검색 · 고른 분류를, 칩의 수는 검색 · 고른 운영사를 먹인 수. 칩 · 탭 자리는
 * 걸러도 그대로다(0 도 적는다).
 */
import { describe, expect, it } from 'vitest';
import { filterMaterials, type MaterialFile, type MaterialGroup } from '@/lib/materials-meta';

const file = (title: string): MaterialFile => ({
  title,
  fileName: `${title}.pdf`,
  order: null,
  docDate: null,
  pathname: `materials/x/${title}.pdf`,
  url: '',
  downloadUrl: '',
  ext: 'PDF',
  size: '1 KB',
  uploaded: '2026. 11. 25.',
  uploadedAt: 0,
});

const group = (key: string, label: string, cats: Record<string, string[]>): MaterialGroup => {
  const categories = Object.entries(cats).map(([k, titles]) => ({ key: k, label: k, files: titles.map(file) }));
  return { key, label, categories, fileCount: categories.reduce((n, c) => n + c.files.length, 0) };
};

// 분류 이름은 materials-meta 의 CATEGORY_LABELS 를 거쳐 나오므로 칩의 label 은 「법인관련」 등이다
const groups: MaterialGroup[] = [
  group('hanbaek', '한백', { corp: ['사업자등록증', '법인인감증명서'], vendor: ['배상책임보험 증권'] }),
  group('hec', '현대엔지니어링', { sales: ['완속사업제안서'], install: ['준공서류 양식'] }),
  group('sk', 'SK일렉링크', { sales: ['제안서 v1.9'], corp: ['사업자등록증 SK'], etc: ['옛 자료'] }),
];
const titles = (v: ReturnType<typeof filterMaterials>) => v.shown.flatMap((g) => g.categories.flatMap((c) => c.files.map((f) => f.title)));
const all = { query: '', group: null, category: null };

describe('filterMaterials — 운영사 탭 · 분류 칩 · 검색', () => {
  it('아무것도 안 걸면 전부 · 칩은 자료실에 있는 분류 모두를 일의 차례로(옛 분류는 뒤)', () => {
    const v = filterMaterials(groups, all);
    expect(v.count).toBe(8);
    expect(v.categoryChips.map((c) => c.label)).toEqual(['영업자료', '법인관련', '업체·보험', '설치·준공', '기타']);
    expect(v.categoryChips.map((c) => c.count)).toEqual([2, 3, 1, 1, 1]);
    expect(v.groupTabs.map((t) => t.count)).toEqual([3, 2, 3]);
    expect(v.allGroups).toBe(8);
    expect(v.allCategories).toBe(8);
  });

  it('분류만 고르면 모든 운영사의 그 분류 — 그 분류가 없는 운영사는 빠진다', () => {
    const v = filterMaterials(groups, { ...all, category: 'corp' });
    expect(titles(v)).toEqual(['사업자등록증', '법인인감증명서', '사업자등록증 SK']);
    expect(v.shown.map((g) => g.key)).toEqual(['hanbaek', 'sk']);
    expect(v.shown.every((g) => g.categories.every((c) => c.key === 'corp'))).toBe(true);
    expect(v.shown.map((g) => g.fileCount)).toEqual([2, 1]);
  });

  it('★탭의 수는 고른 분류를 먹인 수 · 칩의 수는 고른 운영사를 먹인 수★ — 자리는 그대로(0 도)', () => {
    const byCat = filterMaterials(groups, { ...all, category: 'corp' });
    expect(byCat.groupTabs).toEqual([
      { key: 'hanbaek', label: '한백', count: 2 },
      { key: 'hec', label: '현대엔지니어링', count: 0 },
      { key: 'sk', label: 'SK일렉링크', count: 1 },
    ]);
    expect(byCat.allGroups).toBe(3);

    const byGroup = filterMaterials(groups, { ...all, group: 'hec' });
    expect(byGroup.categoryChips.map((c) => c.count)).toEqual([1, 0, 0, 1, 0]);
    expect(byGroup.allCategories).toBe(2);
    // 탭의 수는 운영사를 고른 것과 상관없다 — 그 탭을 누르면 나올 수
    expect(byGroup.groupTabs.map((t) => t.count)).toEqual([3, 2, 3]);
  });

  it('운영사 · 분류 · 검색은 겹쳐 좁힌다 — 0건이면 묶음도 없다', () => {
    expect(titles(filterMaterials(groups, { query: '', group: 'sk', category: 'sales' }))).toEqual(['제안서 v1.9']);
    const none = filterMaterials(groups, { query: '', group: 'hec', category: 'corp' });
    expect(none.count).toBe(0);
    expect(none.shown).toEqual([]);
  });

  it('검색 — 낱말이 다 들어야 맞음 · 운영사 · 분류 이름으로도 찾는다 · 대소문자 무시 · 칩의 수에도 먹는다', () => {
    const v = filterMaterials(groups, { ...all, query: '사업자등록증' });
    expect(titles(v)).toEqual(['사업자등록증', '사업자등록증 SK']);
    expect(v.categoryChips.map((c) => c.count)).toEqual([0, 2, 0, 0, 0]);
    expect(titles(filterMaterials(groups, { ...all, query: '사업자등록증 sk' }))).toEqual(['사업자등록증 SK']);
    expect(filterMaterials(groups, { ...all, query: '현대엔지니어링' }).count).toBe(2);
    expect(filterMaterials(groups, { ...all, query: 'install' }).count).toBe(1); // 분류 이름(여기서는 열쇠 그대로)
  });

  it('빈 자료실 — 칩도 탭도 없다', () => {
    const v = filterMaterials([], all);
    expect(v.count).toBe(0);
    expect(v.categoryChips).toEqual([]);
    expect(v.groupTabs).toEqual([]);
  });
});

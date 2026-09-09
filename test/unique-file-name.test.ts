/** ZIP 안 이름 겹침 — 감사 2026-09-04 M26 */
import { describe, expect, it } from 'vitest';
import { uniqueFileName } from '@/lib/files';

describe('uniqueFileName', () => {
  it('처음 나온 이름은 그대로, 같은 이름은 (2) (3) 으로 비켜 간다', () => {
    const used = new Set<string>();
    expect(uniqueFileName('현장_계약서.pdf', used)).toBe('현장_계약서.pdf');
    expect(uniqueFileName('현장_계약서.pdf', used)).toBe('현장_계약서 (2).pdf');
    expect(uniqueFileName('현장_계약서.pdf', used)).toBe('현장_계약서 (3).pdf');
  });
  it('확장자가 없어도 된다', () => {
    const used = new Set(['메모']);
    expect(uniqueFileName('메모', used)).toBe('메모 (2)');
  });
  it('비켜 간 이름이 이미 쓰였으면 그 다음 번호로', () => {
    const used = new Set(['a.pdf', 'a (2).pdf']);
    expect(uniqueFileName('a.pdf', used)).toBe('a (3).pdf');
  });
});

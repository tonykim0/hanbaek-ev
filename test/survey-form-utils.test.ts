import { describe, expect, it } from 'vitest';
import { num } from '@/lib/survey/form-utils';
import { xmlSafe } from '@/lib/survey/xml-safe';

describe('실사보고서 숫자 칸', () => {
  it('숫자만 읽고, 비우면 null, 소수점 뒤는 버린다(점만 빠져 열 배가 되지 않게)', () => {
    expect(num('')).toBeNull();
    expect(num('  ')).toBeNull();
    expect(num('30m')).toBe(30);
    expect(num('1,250')).toBe(1250);
    expect(num('12.5')).toBe(12);
    expect(num('abc')).toBeNull();
  });
});

describe('서식에 넣는 글', () => {
  it('XML 이 못 받는 제어 문자는 걷고 줄바꿈·탭은 남긴다', () => {
    expect(xmlSafe('A\u0001B\u000bC\nD\tE')).toBe('ABC\nD\tE');
  });
});

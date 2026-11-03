import { describe, expect, it } from 'vitest';
import { buildingUseName } from '@/lib/solar/building-use';

describe('buildingUseName — VWorld usability 코드를 이름으로', () => {
  it('실제 응답의 코드', () => {
    expect(buildingUseName('04000')).toBe('제2종근린생활시설');
    expect(buildingUseName('07000')).toBe('판매시설');
    expect(buildingUseName('02000')).toBe('공동주택');
    expect(buildingUseName('17100')).toBe('공장');
  });
  it('모르는 코드는 코드를 같이 보인다', () => {
    expect(buildingUseName('Z3000')).toBe('기타 (코드 Z3000)');
  });
  it('이미 이름이거나 비었으면 그대로', () => {
    expect(buildingUseName('공장')).toBe('공장');
    expect(buildingUseName(null)).toBeNull();
    expect(buildingUseName('')).toBeNull();
  });
});

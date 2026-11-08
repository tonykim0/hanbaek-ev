/** 부지 검토를 부르는 주소 — 화면이 지은 것을 라우트가 그대로 읽는다(lib/solar/check-query) */
import { describe, expect, it } from 'vitest';
import { checkParams, modeOf, pickedOf } from '@/lib/solar/check-query';
import type { Suggestion } from '@/lib/solar/types';

const place: Suggestion = { kind: 'place', name: '가나공장', road: '충북 충주시 동충주산단4길 17', parcel: '충북 충주시 대소원면 영평리 1', category: '공장', lat: 36.97, lng: 127.9 };

describe('부지 검토 주소', () => {
  it('고른 후보는 갈래 · 이름 · 주소 · 좌표가 그대로 돌아온다(분류는 싣지 않는다)', () => {
    const p = new URLSearchParams(checkParams('ground', '  가나공장 ', place).toString());
    expect(p.get('q')).toBe('가나공장');
    expect(modeOf(p)).toBe('ground');
    expect(pickedOf(p)).toEqual({ ...place, category: null });
  });
  it('후보 없이 글자만 — 고른 것이 없고 방식은 지붕형이 기본', () => {
    expect(pickedOf(checkParams('roof', '동충주산단4길 17'))).toBeNull();
    expect(modeOf(new URLSearchParams('q=x'))).toBe('roof');
  });
  it('우리나라 밖 좌표는 버린다 — 글자로 다시 찾는다', () => {
    expect(pickedOf(checkParams('roof', 'x', { ...place, lat: 10, lng: 127 }))).toBeNull();
  });
  it('빈 이름 · 주소는 null', () => {
    expect(pickedOf(checkParams('roof', 'x', { ...place, kind: 'address', name: null, road: null }))).toMatchObject({ kind: 'address', name: null, road: null });
  });
});

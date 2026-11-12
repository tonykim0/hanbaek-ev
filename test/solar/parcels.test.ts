/**
 * 여러 필지를 한 부지로(lib/solar/parcels) — 주소 칸 한 줄과 필지 목록 사이를 오간다.
 */
import { describe, expect, it } from 'vitest';
import { joinParcels, lotLabel, MAX_PARCELS, pnusOfKey, siteQueryOf, spanOf, splitParcels, traceKeyOf } from '@/lib/solar/parcels';

describe('주소 칸 한 줄 → 필지들', () => {
  it('쉼표가 없으면 그대로 하나', () => {
    expect(splitParcels('  충남 OO시 OO구 가나동 12 ')).toEqual(['충남 OO시 OO구 가나동 12']);
  });
  it('번지만 적은 칸은 앞 주소의 동 · 리를 이어받는다', () => {
    expect(splitParcels('충남 OO시 OO구 가나동 12, 12-3')).toEqual(['충남 OO시 OO구 가나동 12', '충남 OO시 OO구 가나동 12-3']);
    expect(splitParcels('가나동 12,12-3，산 7-1')).toEqual(['가나동 12', '가나동 12-3', '가나동 산 7-1']);
    // 도로명이면 길 이름을
    expect(splitParcels('가나로 100-10, 100-12')).toEqual(['가나로 100-10', '가나로 100-12']);
  });
  it('온 주소를 적은 칸은 그대로 — 그 뒤의 번지는 그 주소의 동을 잇는다', () => {
    expect(splitParcels('가나동 12, 충남 OO시 OO구 다라동 12, 13')).toEqual(['가나동 12', '충남 OO시 OO구 다라동 12', '충남 OO시 OO구 다라동 13']);
  });
  it('숫자 없는 칸이 끼면(상호 속의 쉼표) · 번지로 시작하면 나누지 않는다', () => {
    expect(splitParcels('가나, 다라 공장')).toEqual(['가나, 다라 공장']);
    expect(splitParcels('12, 12-3')).toEqual(['12, 12-3']);
    expect(splitParcels('OO공장, 12-3')).toEqual(['OO공장, 12-3']);
  });
});

describe('필지들 → 주소 칸 한 줄', () => {
  it('같은 동 · 리면 번지만 — 나누면 되돌아온다', () => {
    const list = ['충청남도 OO시 OO구 가나동 12', '충청남도 OO시 OO구 가나동 12-3', '충청남도 OO시 OO구 다라동 3'];
    const line = joinParcels(list);
    expect(line).toBe('충청남도 OO시 OO구 가나동 12, 12-3, 충청남도 OO시 OO구 다라동 3');
    expect(splitParcels(line)).toEqual(list);
    expect(joinParcels(['가나동 12'])).toBe('가나동 12');
  });
  it('필지 이름은 동 · 리와 번지', () => {
    expect(lotLabel('충청남도 OO시 OO구 가나동 12-3')).toBe('가나동 12-3');
    expect(lotLabel('경기도 화성시 양감면 정문리 산 12')).toBe('정문리 산 12');
    expect(lotLabel(null)).toBe('필지');
  });
  it('다시 부르는 주소 — 한 필지면 도로명, 여럿이면 지번을 늘어놓는다', () => {
    const one = { query: '가나동 12', roadAddress: '가나로 100-10', jibunAddress: '가나동 12', parcels: [{ pnu: null, jibunAddress: '가나동 12', roadAddress: '가나로 100-10' }] };
    expect(siteQueryOf(one)).toBe('가나로 100-10');
    const two = { ...one, parcels: [...one.parcels, { pnu: null, jibunAddress: '가나동 12-3', roadAddress: '가나로 100-12' }] };
    expect(siteQueryOf(two)).toBe('가나동 12, 12-3');
  });
});

describe('AI 지붕 따기의 열쇠', () => {
  const A = '9999912000100120000';
  const B = '9999912000100120003';
  it('차례와 상관없이 같은 열쇠 · 겹친 번호 · 빈 번호는 뺀다', () => {
    expect(traceKeyOf([B, A, A, null])).toBe(`${A},${B}`);
    expect(traceKeyOf([A])).toBe(A);
    expect(traceKeyOf([null])).toBeNull();
  });
  it('열쇠 → 번호들 — 19자리가 아니거나 너무 많으면 null', () => {
    expect(pnusOfKey(`${B},${A}`)).toEqual([A, B]);
    expect(pnusOfKey(A)).toEqual([A]);
    expect(pnusOfKey('123')).toBeNull();
    expect(pnusOfKey(`${A},`)).toBeNull();
    expect(pnusOfKey(Array.from({ length: MAX_PARCELS + 1 }, (_, i) => `99999120001001200${String(i).padStart(2, '0')}`).join(','))).toBeNull();
  });
});

describe('묶은 필지가 걸친 거리', () => {
  it('동서 · 남북 중 긴 쪽(m)', () => {
    // 위도 0.009° ≈ 1,000m
    expect(spanOf([127, 36.77, 127.001, 36.779])).toBeGreaterThan(990);
    expect(spanOf([127, 36.77, 127.001, 36.779])).toBeLessThan(1010);
    expect(spanOf([127, 36.77, 127, 36.77])).toBe(0);
  });
});

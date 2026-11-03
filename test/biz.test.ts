import { describe, expect, it } from 'vitest';
import { asBiz, BIZ_HOME, bizOf, isShared } from '@/lib/biz';
import { HANBAEK_ONLY } from '@/lib/routes-map';

describe('bizOf — 사업은 주소로 가른다', () => {
  it('/solar 아래는 태양광', () => {
    expect(bizOf('/solar')).toBe('solar');
    expect(bizOf('/solar/abc')).toBe('solar');
  });
  it('전환 단추가 가는 첫 화면은 제 사업이다 — 태양광은 설치 검토', () => {
    expect(BIZ_HOME.solar).toBe('/solar/check');
    expect(bizOf(BIZ_HOME.solar, 'ev')).toBe('solar');
    expect(bizOf(BIZ_HOME.ev, 'solar')).toBe('ev');
  });
  it('나머지는 전기차 — 마지막 사업이 태양광이어도', () => {
    expect(bizOf('/projects', 'solar')).toBe('ev');
    expect(bizOf('/solarx', 'solar')).toBe('ev');
  });
  it('같이 쓰는 화면(공지 · 알림 · 협력사 정보 · 계정설정)은 마지막 사업 그대로', () => {
    expect(bizOf('/notices', 'solar')).toBe('solar');
    expect(bizOf('/notifications/x', 'solar')).toBe('solar');
    expect(bizOf('/admin/accounts', 'solar')).toBe('solar');
    expect(bizOf('/notices')).toBe('ev');
    expect(isShared('/admin/partners')).toBe(true);
    expect(isShared('/admin/materials')).toBe(false);
  });
  it('쿠키 값은 태양광만 태양광 — 나머지는 전기차', () => {
    expect(asBiz('solar')).toBe('solar');
    expect(asBiz('x')).toBe('ev');
    expect(asBiz(undefined)).toBe('ev');
  });
});

describe('태양광은 아직 한백만 — 엣지에서도 막힌다', () => {
  it('/solar 가 한백 전용 목록에 있다', () => expect(HANBAEK_ONLY as readonly string[]).toContain('/solar'));
});

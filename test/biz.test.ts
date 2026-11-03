import { describe, expect, it } from 'vitest';
import { asBiz, BIZ_ALERTS, BIZ_HOME, bizOf, isShared, seesSolar } from '@/lib/biz';
import { HANBAEK_ONLY } from '@/lib/routes-map';

describe('bizOf — 사업은 주소로 가른다', () => {
  it('/solar 아래는 태양광', () => {
    expect(bizOf('/solar')).toBe('solar');
    expect(bizOf('/solar/abc')).toBe('solar');
  });
  it('전환 단추가 가는 첫 화면은 제 사업이다 — 태양광은 부지 검토', () => {
    expect(BIZ_HOME.solar).toBe('/solar/check');
    expect(bizOf(BIZ_HOME.solar, 'ev')).toBe('solar');
    expect(bizOf(BIZ_HOME.ev, 'solar')).toBe('ev');
  });
  it('나머지는 전기차 — 마지막 사업이 태양광이어도', () => {
    expect(bizOf('/projects', 'solar')).toBe('ev');
    expect(bizOf('/solarx', 'solar')).toBe('ev');
  });
  it('같이 쓰는 화면(공지 · 협력사 정보 · 계정설정)은 마지막 사업 그대로', () => {
    expect(bizOf('/notices', 'solar')).toBe('solar');
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

describe('알림은 사업마다 따로 (2026-11-03 — 지금까지의 알림은 전부 전기차)', () => {
  it('/notifications 는 전기차 — 태양광에 있다 와도 전기차 틀이다', () => {
    expect(isShared('/notifications')).toBe(false);
    expect(bizOf('/notifications', 'solar')).toBe('ev');
  });
  it('사이드바 「알림」은 그 사업의 알림으로 간다', () => {
    expect(BIZ_ALERTS.ev).toBe('/notifications');
    expect(bizOf(BIZ_ALERTS.solar)).toBe('solar');
  });
});

describe('태양광을 보는 계정 — 한백 + 태양광 참여 협력사 (2026-11-03 에코일렉)', () => {
  it('한백의 눈은 참여 표시와 상관없이 본다', () => {
    expect(seesSolar({ role: 'admin' })).toBe(true);
    expect(seesSolar({ role: 'viewer', solar: false })).toBe(true);
  });
  it('협력사는 참여를 켠 계정만', () => {
    expect(seesSolar({ role: 'salesCons', solar: true })).toBe(true);
    expect(seesSolar({ role: 'salesCons', solar: false })).toBe(false);
    expect(seesSolar({ role: 'cons' })).toBe(false);
  });
  it('/solar 는 엣지의 한백 전용 목록에 없다 — 참여 여부는 매 요청 DB 에서 읽는 값이라 레이아웃이 문이다', () => {
    expect(HANBAEK_ONLY as readonly string[]).not.toContain('/solar');
  });
});

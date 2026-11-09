/**
 * 부지 검토의 검사 짓기(lib/solar/site-checks) — 받아 온 자료가 검사 한 칸이 되는 모양.
 * 2026-11-08 run.ts 에서 옮기며 그때의 결과를 받아 적은 특성화 시험이다(옮기기 전에는 시험이 하나도 없었다).
 * 사용승인 연수는 오늘에 따라 바뀌어 앞머리만 본다.
 */
import { describe, expect, it } from 'vitest';
import { summarizeRegister, type RegisterBuilding } from '@/lib/solar/building-register';
import type { LngLat } from '@/lib/solar/geo';
import { FLUSH_KINDS, roofCheck, roofSetbackCheck, setbackCheck, siteCheck, siteFactsOf, terrainCheck, zoneCheck } from '@/lib/solar/site-checks';

/** 토지특성의 지목 · 면적 · 용도지역이 빈 것 — 지형 · 도로만 보는 시험에 */
const NO_LAND = { category: null, areaM2: null, zoning: [] as string[] };

const O: LngLat = [127.9, 36.97];
const m = (x: number, y: number): LngLat => [O[0] + x / 89_000, O[1] + y / 111_320];
/** 왼쪽 아래(x0, y0)에서 s 미터 정사각 */
const sq = (x0: number, y0: number, s: number) => [[m(x0, y0), m(x0 + s, y0), m(x0 + s, y0 + s), m(x0, y0 + s), m(x0, y0)]];
const parcel = [sq(0, 0, 100)];
const bld = (x: number, y: number, s: number, properties: Record<string, unknown>) => ({ properties, polygons: [sq(x, y, s)] });
const facts = (c: { facts?: { label: string; value: string }[] }) => Object.fromEntries((c.facts ?? []).map((f) => [f.label, f.value]));

describe('용도지역·지구', () => {
  it('못 받으면 모름 — 그 까닭을 적는다', () => {
    expect(zoneCheck({ ok: false, error: '시간 초과' }, 'roof')).toMatchObject({ status: 'unknown', summary: '토지이용계획 못 받음 — 시간 초과' });
  });
  it('「접함」은 걸린 지역에 안 센다 · 막는 것이 없으면 통과', () => {
    const c = zoneCheck({ ok: true, value: [{ name: '가나지구', relation: '포함' }, { name: '개발제한구역', relation: '접함' }] }, 'ground');
    expect(c).toMatchObject({ status: 'ok', summary: '설치를 막는 지역·지구 없음' });
    expect(facts(c)).toEqual({ '걸린 지역·지구': '가나지구' });
  });
  it('가장 나쁜 것이 상태 · 그 사유가 결론 한 줄', () => {
    const c = zoneCheck({ ok: true, value: [{ name: '개발제한구역', relation: '포함' }, { name: '자연녹지지역', relation: '포함' }] }, 'ground');
    expect(c.status).toBe('banned');
    expect(c.summary).toMatch(/^개발제한구역 — 지상 태양광은/);
    expect(facts(c)['걸린 지역·지구']).toBe('개발제한구역 · 자연녹지지역');
  });
  it('같은 지역도 지붕형은 막지 않는다', () => {
    expect(zoneCheck({ ok: true, value: [{ name: '개발제한구역', relation: '포함' }] }, 'roof').status).toBe('ok');
  });
});

describe('부지(지상형)', () => {
  it('지목 대지면 통과 · 면적은 지적도 도형으로', () => {
    const r = siteCheck({ properties: { jibun: '12-3 대' }, polygons: parcel }, parcel);
    expect(r.check).toMatchObject({ key: 'site', status: 'ok', summary: '지목 대지' });
    expect(facts(r.check)).toEqual({ 필지: '12-3 대', 면적: '9,971㎡ (3,016평) · 지적도 도형으로 잼' });
    expect(Math.round(r.area!)).toBe(9971);
  });
  it('논이면 농지전용', () => {
    expect(siteCheck({ properties: { jibun: '12-3 답' }, polygons: parcel }, parcel).check).toMatchObject({ status: 'conditional', summary: '지목 답(논) — 농지전용 허가 필요' });
  });
  it('도형이 없으면 모름', () => {
    expect(siteCheck({ properties: {}, polygons: [] }, [])).toEqual({ check: expect.objectContaining({ status: 'unknown', summary: '필지 도형을 못 받음' }), area: null });
  });
});

describe('현장의 공적 자료(제안서의 부지 검토 표)', () => {
  const traits = { year: '2026', height: '평지', shape: null, road: null, use: null, category: '공장용지', areaM2: 15_446, zoning: ['일반공업지역'] };
  const register = summarizeRegister([
    { dong: '1동', main: true, archArea: 2_937, structure: null, roof: '기타지붕(판넬)', height: null, use: '공장', useApr: '20240315' },
    { dong: '2동', main: true, archArea: 584.72, structure: null, roof: '(철근)콘크리트', height: null, use: '사무소', useApr: '20240401' },
    { dong: '경비실', main: false, archArea: 20, structure: null, roof: null, height: null, use: '경비실', useApr: null },
  ]);
  const zones = { ok: true as const, value: [
    { name: '도시지역', relation: '포함' },
    { name: '일반공업지역', relation: '포함' },
    { name: '가축사육제한구역', relation: '포함' },
    { name: '자연녹지지역', relation: '접함' },
  ] };
  it('땅은 토지특성, 건물은 대장의 주건축물(건축면적 합 · 가장 큰 동의 주용도 · 사용승인일)', () => {
    expect(siteFactsOf({ ok: true, value: traits }, zones, register, '2074장')).toEqual({
      zoning: ['일반공업지역'],
      landCategory: '공장용지',
      landAreaM2: 15_446,
      buildingAreaM2: 3_521.72,
      buildingUse: '공장',
      approvedOn: '20240315',
    });
  });
  it('토지특성을 못 받으면 지목은 지번 끝 부호에서 · 용도지역은 토지이용계획에서(지구 · 접함 빼고) · 면적은 갈음하지 않는다', () => {
    expect(siteFactsOf({ ok: false, error: '없음' }, zones, null, '2074장')).toEqual({
      zoning: ['일반공업지역'],
      landCategory: '공장용지',
      landAreaM2: null,
      buildingAreaM2: null,
      buildingUse: null,
      approvedOn: null,
    });
    expect(siteFactsOf({ ok: true, value: null }, { ok: false, error: '없음' }, null, null)).toMatchObject({ zoning: [], landCategory: null });
  });
});

describe('경사 · 진입도로', () => {
  it('못 받음 · 자료 없음은 모름', () => {
    expect(terrainCheck({ ok: false, error: '없음' })).toMatchObject({ status: 'unknown', summary: '토지특성 못 받음 — 없음' });
    expect(terrainCheck({ ok: true, value: null })).toMatchObject({ status: 'unknown', summary: '이 필지의 토지특성 자료 없음' });
  });
  it('걸리는 것이 없으면 지형 · 도로가 결론', () => {
    const c = terrainCheck({ ok: true, value: { ...NO_LAND, year: '2026', height: '완경사', shape: '정방형', road: '세로각지(가)', use: '공업용' } });
    expect(c).toMatchObject({ status: 'ok', summary: '완경사 · 세로각지(가)' });
    expect(facts(c)).toEqual({ 지형: '완경사 · 정방형', 도로: '세로각지(가)', '지금 쓰임': '공업용' });
  });
  it('급경사 · 맹지는 둘 다 결론에', () => {
    const c = terrainCheck({ ok: true, value: { ...NO_LAND, year: '2026', height: '급경사', shape: null, road: '맹지', use: null } });
    expect(c.status).toBe('conditional');
    expect(c.summary.split(' / ').map((s) => s.split(' — ')[0])).toEqual(['급경사', '맹지']);
    expect(facts(c)['지금 쓰임']).toBe('—');
  });
});

describe('주택 이격(지상형)', () => {
  it('200m 안 주택만 — 단독은 동, 공동은 세대로 센다', () => {
    const r = setbackCheck(parcel, {
      ok: true,
      value: [
        bld(150, 0, 10, { usability_nm: '단독주택' }),
        bld(0, 220, 20, { main_purps_nm: '아파트', hhld_cnt: '30' }),
        bld(700, 0, 10, { usability_nm: '단독주택' }),
        bld(20, 20, 30, { usability_nm: '공장' }),
      ],
    });
    expect(r.houses).toHaveLength(2);
    expect(r.check).toMatchObject({ status: 'conditional', summary: '200m 안 주택 31호 이상 — 지자체 조례의 이격거리 확인 필요' });
    expect(facts(r.check)).toMatchObject({ '200m 안 단독주택': '1동', '200m 안 공동주택': '1동' });
  });
  it('못 받으면 모름', () => expect(setbackCheck(parcel, { ok: false, error: 'x' })).toMatchObject({ check: { status: 'unknown' }, houses: [] }));
  it('지붕형은 이격 제외 — 정한 지역이면 조례 확인', () => {
    expect(roofSetbackCheck(null)).toMatchObject({ status: 'skip' });
    expect(roofSetbackCheck([{ name: '관광단지', relation: '포함' }])).toMatchObject({ status: 'conditional', summary: '지붕형이지만 관광단지 — 조례 이격거리가 적용될 수 있음' });
  });
});

describe('건물(지붕형)', () => {
  // 필지 안 둘(대장이 붙은 900㎡ · 도형만 있는 것) · 필지 밖 하나
  const shapes = { ok: true as const, value: [bld(10, 10, 30, { archarea: '900', useapr_day: '19900101', usability_nm: '공장' }), bld(60, 60, 20, { archarea: '0' }), bld(300, 300, 20, { archarea: '50' })] };
  const reg = (over: Partial<RegisterBuilding>): RegisterBuilding => ({ dong: null, main: true, archArea: 0, structure: null, roof: null, height: null, use: null, useApr: null, ...over });
  const factory = reg({ dong: '1동', archArea: 1200.5, structure: '일반철골구조', roof: '기타지붕(판넬)', height: 9, use: '공장', useApr: '20150301' });

  it('대장 키가 없으면 지도 도형으로 — 대장 면적이 0 인 도형은 도형 면적', () => {
    const r = roofCheck(parcel, shapes, { ok: true, value: null });
    expect(r.on.map((b) => b.registered)).toEqual([true, false]);
    expect(Math.round(r.area!)).toBe(1299);
    expect(r.check.status).toBe('conditional');
    expect(r.check.summary).toMatch(/^사용승인 1990년/);
    expect(facts(r.check)).toMatchObject({ 건축면적: '1,299㎡ (393평) · 2동 (지도 도형으로 잼)', 건축물대장: '연결 안 됨 (DATA_GO_KR_KEY 없음) — 지도 도형으로 잼' });
  });
  it('대장을 봤는데 이 지번에 건물이 없으면 등록부터', () => {
    expect(roofCheck(parcel, shapes, { ok: true, value: [] }).check).toMatchObject({ status: 'conditional', summary: '건축물대장에 이 지번 건물 없음 — 등록 여부 확인' });
  });
  it('대장을 못 받으면 그 까닭을 사실에', () => {
    expect(facts(roofCheck(parcel, shapes, { ok: false, error: '503' }).check)['건축물대장']).toBe('못 받음 — 503');
  });
  it('도형을 못 받음 · 필지에 건물 없음', () => {
    expect(roofCheck(parcel, { ok: false, error: '시간 초과' }, { ok: true, value: null })).toMatchObject({ check: { status: 'unknown', summary: '건물 자료 못 받음 — 시간 초과' }, area: null });
    expect(roofCheck(parcel, { ok: true, value: [] }, { ok: true, value: null }).check).toMatchObject({ status: 'hard', summary: '이 필지에 건물이 없음 — 지상형으로 검토' });
  });
  it('대장이 있으면 그것이 정본 — 통과면 면적 · 동수 · 지붕이 결론', () => {
    const r = roofCheck(parcel, shapes, { ok: true, value: [factory] });
    expect(r.area).toBe(1200.5);
    expect(r.check).toMatchObject({ status: 'ok', summary: '건축면적 1,201㎡ (363평) · 1동 · 판넬·금속 지붕', source: { name: '국토교통부 건축물대장' } });
    expect(r.on).toHaveLength(2);
  });
  it('슬레이트 · 부속건축물 — 결론은 걸린 것, 면적은 사실로', () => {
    const r = roofCheck(parcel, shapes, {
      ok: true,
      value: [factory, reg({ dong: '2동', archArea: 300, roof: '슬레이트', useApr: '19950101' }), reg({ main: false, archArea: 20, use: '경비실' })],
    });
    expect(r.area).toBe(1500.5);
    expect(r.check).toMatchObject({ status: 'conditional', summary: '슬레이트 지붕 — 석면이면 철거·교체 뒤 설치가 일반적 (지자체 처리 지원 있음)', law: '산업안전보건법 제122조 · 석면안전관리법 제25조' });
    expect(facts(r.check)).toMatchObject({ 건축면적: '1,501㎡ (454평) · 2동', 부속건축물: '1동 20㎡ — 면적에서 뺌', 지붕: '판넬·금속 1,201㎡ · 슬레이트 300㎡' });
  });
  it('지붕면 부착형으로 까는 갈래는 기와뿐', () => expect([...FLUSH_KINDS]).toEqual(['기와']));
});

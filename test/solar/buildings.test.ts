import { describe, expect, it } from 'vitest';
import { dropShadowCopies, markProvisional, unlotted } from '@/lib/solar/buildings';
import type { PolygonCoords } from '@/lib/solar/geo';

/** 경위도 정사각형 — s 는 한 변(도) */
const sq = (x: number, y: number, s: number): PolygonCoords[] => [[[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]]];
const b = (name: string, polygons: PolygonCoords[], registered: boolean) => ({ name, polygons, registered });

describe('dropShadowCopies — 같은 건물의 무대장 도형 그림자를 뺀다', () => {
  it('대장 건물과 겹치고 크기가 비슷하면 그림자 (이랜드 천안물류센터 42,454 + 42,406㎡)', () => {
    const out = dropShadowCopies([b('대장', sq(127.1, 36.73, 0.002), true), b('그림자', sq(127.10001, 36.73001, 0.002), false)]);
    expect(out.map((x) => x.name)).toEqual(['대장']);
  });
  it('따로 선 무대장 건물은 남는다 (풍세로 706 의 대장 없는 동들)', () => {
    const out = dropShadowCopies([b('대장', sq(127.1, 36.73, 0.001), true), b('옆 동', sq(127.105, 36.73, 0.001), false)]);
    expect(out.map((x) => x.name)).toEqual(['대장', '옆 동']);
  });
  it('큰 건물 위의 작은 대장 건물(경비실)은 큰 무대장 도형을 지우지 않는다 — 크기가 다르다', () => {
    const out = dropShadowCopies([b('경비실', sq(127.1009, 36.7309, 0.0001), true), b('창고', sq(127.1, 36.73, 0.002), false)]);
    expect(out.map((x) => x.name)).toEqual(['경비실', '창고']);
  });
});

describe('markProvisional — 도로명주소를 붙일 때 그린 임시 네모', () => {
  const box = sq(127.93, 37.08, 0.0004);
  const sn = (lotted: boolean) => ({ bd_mgt_sn: lotted ? '4313041022120740000064229' : '4313041022100000000000008' });
  it('본번 0000 · 대장 없음 · 네모 — 셋 다면 임시 (충주 동충주산단4길 17)', () =>
    expect(markProvisional([{ polygons: box, registered: false }], [{ polygons: box, properties: sn(false) }])).toEqual([true]));
  it('관리번호에 지번이 있으면 실제 건물', () =>
    expect(markProvisional([{ polygons: box, registered: false }], [{ polygons: box, properties: sn(true) }])).toEqual([false]));
  it('대장과 엮인 건물은 아니다', () =>
    expect(markProvisional([{ polygons: box, registered: true }], [{ polygons: box, properties: sn(false) }])).toEqual([false]));
  it('네모가 아닌 실제 모양(산단 블록 건물, 꼭짓점 여럿)은 아니다', () => {
    const shape: PolygonCoords[] = [[[[127.93, 37.08], [127.9304, 37.08], [127.9304, 37.0802], [127.9302, 37.0803], [127.93, 37.0804], [127.93, 37.08]]]];
    expect(markProvisional([{ polygons: shape, registered: false }], [{ polygons: shape, properties: sn(false) }])).toEqual([false]);
  });
  it('관리번호 모양', () => {
    expect(unlotted('4313041022100000000000008')).toBe(true);
    expect(unlotted('4413111600116880000000001')).toBe(false);
  });
});

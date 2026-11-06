import { AREA_PER_KW, CARPORT } from './assumptions';
import { projector, unprojector, type LngLat, type PolygonCoords } from './geo';
import { layoutRoof, type Layout } from './layout';

/**
 * 지상형 설치 영역 — 사람이 지도에 그린 네모(주차장 · 빈 땅). 지상형은 지붕을 딸 것이 없어 영업에서 주차장 면적을
 * 네모 단위로 그려 용량을 잰다(한백). 네모는 돌릴 수 있다 — 주차장은 길을 따라 비스듬히 놓인 곳이 많다.
 *
 * 네모 = 가운데 · 폭 w · 높이 h(m) · 기울기 angle(라디안, 동쪽에서 반시계). 폭은 기울기 방향, 높이는 그 직각.
 * 꼭짓점 차례는 상자 자기 축으로 왼쪽 아래 → 오른쪽 아래 → 오른쪽 위 → 왼쪽 위.
 */
export type Box = { id: string; center: LngLat; w: number; h: number; angle: number };

/** 이보다 작은 네모는 만들지 않는다(누르다 생긴 점 하나짜리 네모) — m */
export const MIN_SIDE_M = 1;

const rot = ([x, y]: [number, number], a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export function boxCorners(b: Box): LngLat[] {
  const toLL = unprojector(b.center);
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
  ).map(([sx, sy]) => toLL(rot([(sx * b.w) / 2, (sy * b.h) / 2], b.angle)));
}

export function boxRing(b: Box): LngLat[] {
  const c = boxCorners(b);
  return [...c, c[0]];
}

export const boxPolygons = (b: Box): PolygonCoords[] => [[boxRing(b)]];

/** 넓이(㎡) — 폭 × 높이 그대로 */
export const boxArea = (b: Box): number => b.w * b.h;

/** 마주 보는 두 꼭짓점과 기울기로 네모 — 그릴 때(두 번 누르기)와 모서리를 끌 때 */
export function boxFromCorners(id: string, a: LngLat, c: LngLat, angle: number): Box {
  const [u, v] = rot(projector(a)(c), -angle);
  const center = unprojector(a)(rot([u / 2, v / 2], angle));
  return { id, center, w: Math.abs(u), h: Math.abs(v), angle };
}

/** 꼭짓점 i 를 p 로 끈다 — 맞은편 꼭짓점과 기울기는 그대로. 너무 작아지면 그 자리에 둔다 */
export function resizeCorner(b: Box, i: number, p: LngLat): Box {
  const next = boxFromCorners(b.id, boxCorners(b)[(i + 2) % 4], p, b.angle);
  return next.w < MIN_SIDE_M || next.h < MIN_SIDE_M ? b : next;
}

/** 가운데에서 p 쪽이 네모의 「위」가 되게 돌린다 — 남북·동서에서 2° 안이면 거기 붙인다 */
export function rotateToward(b: Box, p: LngLat): Box {
  const [x, y] = projector(b.center)(p);
  if (x === 0 && y === 0) return b;
  let angle = Math.atan2(y, x) - Math.PI / 2;
  const quarter = Math.PI / 2;
  const snap = Math.round(angle / quarter) * quarter;
  if (Math.abs(angle - snap) < (2 * Math.PI) / 180) angle = snap;
  return { ...b, angle: Math.atan2(Math.sin(angle), Math.cos(angle)) };
}

/** from 에서 to 로 끈 만큼 옮긴다 */
export function moveBy(b: Box, from: LngLat, to: LngLat): Box {
  const toM = projector(from);
  const [dx, dy] = toM(to);
  const [cx, cy] = toM(b.center);
  return { ...b, center: unprojector(from)([cx + dx, cy + dy]) };
}

/** 위 변 가운데에서 바깥으로 outM 만큼 — 돌리는 손잡이 자리 */
export function knobPoint(b: Box, outM: number): LngLat {
  return unprojector(b.center)(rot([0, b.h / 2 + outM], b.angle));
}

/* ---------------------------------------------------------- 용량 */

/** 주차장 캐노피(기본) · 땅에 세움 */
export type GroundUse = 'carport' | 'land';

/** 주차장 캐노피 — 네모를 캐노피 지붕으로 보고 모듈을 빈틈없이 깐다(근거는 assumptions CARPORT) */
export function carportPanels(b: Box, lat: number): Layout {
  // 캐노피는 한 판 구조물이라 짧은 줄도 깐다(지붕의 토막 빼기 minRun 은 지붕에만)
  return layoutRoof(boxPolygons(b), 'flush', lat, { setbackM: CARPORT.setbackM, aisleEvery: 0, minRun: 1 });
}

/** 땅에 세움 — 넓이 → 예상 용량(kW, 소수 첫째) · 지상형 기준 그대로(땅 AREA_PER_KW.ground ㎡ 당 1kW) */
export const kwOfArea = (area: number): number => Math.round((area / AREA_PER_KW.ground) * 10) / 10;

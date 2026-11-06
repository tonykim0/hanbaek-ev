/**
 * 웹 메르카토르 — 경위도와 항공사진 픽셀을 오간다. [순수 · 브라우저 · 서버]
 *
 * 항공사진 잇기(lib/solar/sources/aerial — 서버)와 제안서의 가배치 그림(components/solar/proposal-image — 브라우저)이 같은 셈을
 * 써야 패널이 사진의 지붕 위에 정확히 얹힌다. 타일은 XYZ, 256px.
 */
import type { LngLat } from './geo';

export const TILE = 256;

/** 경위도 → 그 확대 단계의 전체 픽셀 좌표 */
export function toWorldPx([lng, lat]: LngLat, z: number): [number, number] {
  const n = 2 ** z * TILE;
  const r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
}

/** 전체 픽셀 좌표 → 경위도 */
export function fromWorldPx([x, y]: [number, number], z: number): LngLat {
  const n = 2 ** z * TILE;
  return [(x / n) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI];
}

/** 픽셀 하나가 땅에서 몇 m 인가 */
export const metersPerPx = (lat: number, z: number) => (156_543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

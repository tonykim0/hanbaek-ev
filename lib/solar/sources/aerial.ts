import type { LngLat, PolygonCoords } from '../geo';
import { expandBbox } from '../geo';
import { SourceError } from './http';
import { blank, decodeJpeg, encodeJpeg, paste, strokeRing } from './raster';

/**
 * VWorld 항공영상(WMTS Satellite) — 필지 둘레를 한 장으로 이어 붙인다. 지붕을 AI 로 따는 데 쓴다(lib/roof-trace).
 * 타일은 웹 메르카토르 XYZ, 256px. 가장 크게는 19단계(위도 37°에서 약 0.24m/px) — 20단계부터는 XML 오류가 온다(실측).
 * 지도 모양 자료보다 새것이다: 충주 동충주산단4길 17 의 2024-11 준공 공장이 찍혀 있다.
 */
const TILE = 256;
const MAX_ZOOM = 19;

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

export type Aerial = {
  jpeg: Buffer;
  width: number;
  height: number;
  z: number;
  /** 사진 왼쪽 위 모서리의 전체 픽셀 좌표 — 사진 안 픽셀 (x, y) 는 (originX + x, originY + y) */
  originX: number;
  originY: number;
  metersPerPx: number;
};

/**
 * @param bbox 필지 외접 사각형 [서, 남, 동, 북]
 * @param outline 사진에 노란 선으로 그려 넣을 필지 — AI 가 「어느 땅의 지붕인가」를 안다
 * @param maxPx 긴 변 한도 — 고해상 비전이 1:1 좌표로 읽는 범위(2,576px) 안에서 비용을 아낀다
 */
export async function aerialOf(
  bbox: [number, number, number, number],
  outline: PolygonCoords[],
  { marginM = 25, maxPx = 1600 } = {},
): Promise<Aerial> {
  const key = process.env.VWORLD_KEY;
  if (!key) throw new Error('[VWorld] VWORLD_KEY 없음');
  const [w, s, e, n] = expandBbox(bbox, marginM);

  // 긴 변이 한도 안에 드는 가장 큰 확대 단계
  let z = MAX_ZOOM;
  for (; z > 14; z--) {
    const [x0, y0] = toWorldPx([w, n], z);
    const [x1, y1] = toWorldPx([e, s], z);
    if (Math.max(x1 - x0, y1 - y0) <= maxPx) break;
  }
  const [x0, y0] = toWorldPx([w, n], z).map(Math.floor) as [number, number];
  const [x1, y1] = toWorldPx([e, s], z).map(Math.ceil) as [number, number];
  const [tx0, ty0, tx1, ty1] = [Math.floor(x0 / TILE), Math.floor(y0 / TILE), Math.floor(x1 / TILE), Math.floor(y1 / TILE)];

  const jobs: { tx: number; ty: number }[] = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push({ tx, ty });
  const width = x1 - x0;
  const height = y1 - y0;
  // 타일을 받는 대로 자른 판(필지 둘레)에 바로 얹는다 — 판 왼쪽 위는 타일 묶음 왼쪽 위에서 (x0, y0) 만큼 들어간 자리
  const photo = blank(width, height);
  const offX = x0 - tx0 * TILE;
  const offY = y0 - ty0 * TILE;
  // 여섯씩 — 한꺼번에 수십 장을 던지지 않는다
  for (let i = 0; i < jobs.length; i += 6) {
    const got = await Promise.all(
      jobs.slice(i, i + 6).map(async ({ tx, ty }) => {
        const res = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${key}/Satellite/${z}/${ty}/${tx}.jpeg`, {
          headers: process.env.VWORLD_DOMAIN ? { Referer: process.env.VWORLD_DOMAIN } : undefined,
          signal: AbortSignal.timeout(10_000),
        });
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || !type.startsWith('image/')) throw new SourceError('VWorld 항공영상', `타일 ${z}/${ty}/${tx} 못 받음 (${res.status} ${type})`, res.status);
        let tile;
        try {
          tile = decodeJpeg(new Uint8Array(await res.arrayBuffer()));
        } catch (err) {
          throw new SourceError('VWorld 항공영상', `타일 ${z}/${ty}/${tx} 을 못 읽음 (${type} — ${err instanceof Error ? err.message : String(err)})`);
        }
        return { tile, left: (tx - tx0) * TILE - offX, top: (ty - ty0) * TILE - offY };
      }),
    );
    for (const g of got) paste(photo, g.tile, g.left, g.top);
  }

  // 필지를 노란 선(#ffd400 · 3px)으로 — AI 가 「어느 땅의 지붕인가」를 안다
  for (const ring of outline.flatMap((p) => p.slice(0, 1))) {
    strokeRing(
      photo,
      ring.map((pt) => {
        const [px, py] = toWorldPx(pt, z);
        return [px - x0, py - y0] as const;
      }),
      [0xff, 0xd4, 0x00],
      3,
    );
  }
  const jpeg = encodeJpeg(photo, 88);
  return { jpeg, width, height, z, originX: x0, originY: y0, metersPerPx: metersPerPx((s + n) / 2, z) };
}

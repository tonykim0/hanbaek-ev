import jpeg from 'jpeg-js';

/**
 * 항공사진 한 장 짓기 — 타일 잇기 · 필지 선 긋기 · JPEG 굽기. 순수 JS 다(lib/solar/sources/aerial).
 *
 * ★sharp 를 쓰지 않는 이유★ 검토 사이트(solar-site)는 sharp 로 했다. 콘솔에 들이며(2026-11-03) 네이티브 모듈을 하나
 * 더 까는 대신 이미 있는 jpeg-js(heic-convert 가 쓰던 것)로 바꿨다 — 워크트리들이 node_modules 를 나눠 쓰고, 하는 일이
 * 「256px 타일 수십 장을 잇고 선 하나 긋기」라 순수 JS 로 1초 안이다. 판독(30~60초) 앞에서는 보이지 않는다.
 */
export type Rgba = { width: number; height: number; data: Uint8Array };

/** 검정 판 — 타일이 안 덮은 자리는 검정이다(sharp 의 바탕과 같다) */
export function blank(width: number, height: number): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}

export function decodeJpeg(buf: Uint8Array): Rgba {
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  return { width: img.width, height: img.height, data: img.data };
}

export function encodeJpeg(img: Rgba, quality: number): Buffer {
  return jpeg.encode({ width: img.width, height: img.height, data: img.data }, quality).data;
}

/** src 를 판의 (left, top) 에 얹는다 — 판 밖으로 나간 쪽은 자른다 */
export function paste(dst: Rgba, src: Rgba, left: number, top: number): void {
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(dst.width, left + src.width);
  const y1 = Math.min(dst.height, top + src.height);
  if (x0 >= x1 || y0 >= y1) return;
  for (let y = y0; y < y1; y++) {
    const s = ((y - top) * src.width + (x0 - left)) * 4;
    dst.data.set(src.data.subarray(s, s + (x1 - x0) * 4), (y * dst.width + x0) * 4);
  }
}

/**
 * 닫힌 고리를 굵기 width(px)로 긋는다 — 둥근 붓을 반 픽셀마다 찍는다. 꼭짓점은 픽셀 좌표(왼쪽 위 0,0 · 픽셀 가운데가 +0.5).
 * 마지막 점에서 첫 점으로 돌아오는 변도 긋는다(GeoJSON 고리처럼 첫 점을 끝에 또 적었으면 길이 0 인 변이다).
 */
export function strokeRing(img: Rgba, ring: readonly (readonly [number, number])[], rgb: readonly [number, number, number], width = 3): void {
  const r = width / 2;
  const dab = (cx: number, cy: number) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(img.height - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(img.width - 1, Math.ceil(cx + r)); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
        const i = (y * img.width + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
  };
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let s = 0; s <= steps; s++) dab(ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps);
  }
}

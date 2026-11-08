/**
 * 좁은 범위(수 km)의 경위도 계산 — 필지 중심 기준 등장방형 투영으로 미터 좌표를 만든다.
 * 200m 이격 판단에는 오차가 수 cm 수준이라 충분하다.
 */

export type LngLat = [number, number];
export type Ring = LngLat[];
/** GeoJSON Polygon 의 coordinates — 바깥 고리 하나 + 구멍들 */
export type PolygonCoords = Ring[];

const R = 6_371_008.8;
export const rad = (d: number) => (d * Math.PI) / 180;

export function projector(origin: LngLat) {
  const k = Math.cos(rad(origin[1]));
  return ([lng, lat]: LngLat): [number, number] => [
    rad(lng - origin[0]) * R * k,
    rad(lat - origin[1]) * R,
  ];
}

/** projector 의 반대 — 미터 좌표 → [경도, 위도] */
export function unprojector(origin: LngLat) {
  const k = Math.cos(rad(origin[1]));
  const deg = (r: number) => (r * 180) / Math.PI;
  return ([x, y]: [number, number]): LngLat => [origin[0] + deg(x / (R * k)), origin[1] + deg(y / R)];
}

/** GeoJSON geometry(Polygon·MultiPolygon) → 폴리곤 목록 */
export function polygonsOf(geom: { type: string; coordinates: unknown } | null | undefined): PolygonCoords[] {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates as PolygonCoords];
  if (geom.type === 'MultiPolygon') return geom.coordinates as PolygonCoords[];
  return [];
}

export function centroidOf(polys: PolygonCoords[]): LngLat | null {
  let n = 0;
  let x = 0;
  let y = 0;
  for (const p of polys)
    for (const [lng, lat] of p[0] ?? []) {
      x += lng;
      y += lat;
      n++;
    }
  return n ? [x / n, y / n] : null;
}

/** 면적(㎡) — 구멍은 뺀다 */
export function areaOf(polys: PolygonCoords[]): number {
  const c = centroidOf(polys);
  if (!c) return 0;
  const proj = projector(c);
  let total = 0;
  for (const p of polys)
    p.forEach((ring, i) => {
      const a = Math.abs(shoelace(ring.map(proj)));
      total += i === 0 ? a : -a;
    });
  return total;
}

function shoelace(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return s / 2;
}

export function bboxOf(polys: PolygonCoords[]): [number, number, number, number] | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of polys)
    for (const [x, y] of p[0] ?? []) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

/** bbox 를 사방으로 m 만큼 넓힌다 */
export function expandBbox(b: [number, number, number, number], m: number): [number, number, number, number] {
  const dLat = (m / R) * (180 / Math.PI);
  const dLng = dLat / Math.cos(rad((b[1] + b[3]) / 2));
  return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat];
}

/**
 * 두 도형 사이 최단 수평거리(m). 겹치거나 한쪽이 다른 쪽 안에 있으면 0.
 * 고시 초안의 잰 방법(부지 경계 ~ 주택 외벽 최단 수평거리)과 같다.
 */
export function distanceBetween(a: PolygonCoords[], b: PolygonCoords[]): number {
  const c = centroidOf(a);
  if (!c) return Infinity;
  const proj = projector(c);
  const ringsA = a.map((p) => p[0].map(proj));
  const ringsB = b.map((p) => p[0].map(proj));

  for (const ra of ringsA) for (const rb of ringsB) {
    if (rb.some((pt) => pointInRing(pt, ra)) || ra.some((pt) => pointInRing(pt, rb))) return 0;
  }
  let best = Infinity;
  for (const ra of ringsA)
    for (const rb of ringsB) {
      for (const p of rb) best = Math.min(best, toRing(p, ra));
      for (const p of ra) best = Math.min(best, toRing(p, rb));
    }
  return best;
}

/**
 * a 넓이 중 bs(여럿) 안에 드는 몫(0~1) — a 의 외접 사각형에 n×n 점을 고르게 뿌려 센다(구멍은 보지 않는다).
 * 두 자료가 같은 건물을 따로 그렸는지 가를 때 쓴다(지도 모양 ↔ AI 지붕). 중심점 하나로 가르면 처마까지 그린
 * 모양 · 몇 m 밀린 모양에서 어긋난다.
 */
export function coveredShare(a: PolygonCoords[], bs: PolygonCoords[][], n = 30): number {
  const c = centroidOf(a);
  if (!c || !bs.length) return 0;
  const proj = projector(c);
  const ringsA = a.map((p) => p[0].map(proj));
  const ringsB = bs.flatMap((polys) => polys.map((p) => p[0].map(proj)));
  const xs = ringsA.flatMap((r) => r.map((q) => q[0]));
  const ys = ringsA.flatMap((r) => r.map((q) => q[1]));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let inA = 0;
  let inB = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const pt: [number, number] = [x0 + ((i + 0.5) / n) * (x1 - x0), y0 + ((j + 0.5) / n) * (y1 - y0)];
      if (!ringsA.some((r) => pointInRing(pt, r))) continue;
      inA++;
      if (ringsB.some((r) => pointInRing(pt, r))) inB++;
    }
  return inA ? inB / inA : 0;
}

/** 점이 폴리곤(들) 안에 있는가 — 구멍은 보지 않는다 */
export function containsPoint(polys: PolygonCoords[], pt: LngLat): boolean {
  const proj = projector(pt);
  return polys.some((p) => pointInRing([0, 0], p[0].map(proj)));
}

/** 점이 고리 안인가(반직선 세기) — 평면 좌표 · 경위도 어느 쪽이든 같은 셈이다 */
export function pointInRing([x, y]: [number, number], ring: readonly [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function toRing(p: [number, number], ring: [number, number][]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(best, pointToSegment(p, ring[j], ring[i]));
  }
  return best;
}

/** 점과 선분 사이 거리 */
export function pointToSegment([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 화면으로 보낼 좌표는 소수 여섯째 자리(약 10cm)까지 — VWorld 는 열다섯 자리를 준다 */
export function roundPolys(polys: PolygonCoords[], digits = 6): PolygonCoords[] {
  const f = 10 ** digits;
  return polys.map((p) => p.map((ring) => ring.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f] as LngLat)));
}

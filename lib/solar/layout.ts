import { LAYOUT, MODULE, TILT_DEG } from './assumptions';
import { centroidOf, pointInRing, pointToSegment, projector, rad, unprojector, type LngLat, type PolygonCoords } from './geo';

/**
 * 지붕 위 모듈 배치 — 지붕 모양 안에 모듈을 실제 크기로 채운다. 용량은 이 장수 × 모듈 출력이다.
 *
 * - tilted(경사고정형): 기본. 모듈을 세로로 세워 남쪽으로 기울이고, 동지 오전 10시~오후 2시에 앞줄 그림자가 뒷줄에
 *   닿지 않게 띄운다. 줄은 건물 변 중 동서에 가까운 쪽을 따르고(건물과 나란해야 지붕을 덜 버린다), 20장마다 통로로 끊는다.
 * - flush(지붕면 부착형): 지붕면에 붙여 깔아 줄 사이가 틈뿐이다. 줄은 건물 긴 변(용마루 방향)을 따른다.
 *
 * ★실제 설계에 맞췄다★ — 한백 발전설비개요(2026) 223곳은 거의 다 경사고정형(12° 79 · 15° 87 · 지붕면 부착형 2)이고
 * 금속 지붕도 그렇다. 대장 면적과 지도 모양이 맞는 42곳 중 실제 장수가 지붕 모양 안에 들어가는 33곳에 이 배치를 돌리면
 * 실제/배치 — 판넬·금속·기타 24곳 중앙 0.95(25~75%: 0.86~1.06), 콘크리트 옥상 9곳 중앙 0.49(계단실·설비·난간과
 * 옥상 일부만 쓰는 설계). 같은 곳에 옛 배치(밀착)는 판넬 지붕에서 실제의 1.4배였다(2026-11-03, 테두리 판정 허용치 고친 뒤).
 *
 * 채광창·설비·옥상 장애물은 공공 자료에 없다 — 이 배치는 그 지붕 모양에 들어가는 최대치다(AI 지붕 따기가 못 까는 곳을 뺀다).
 */
export type LayoutStyle = 'flush' | 'tilted';
export type Layout = { quads: LngLat[][]; count: number; kw: number; watt: number };

/** 배치의 숫자 — 기본은 assumptions 의 값, 보정 실험만 바꿔 넣는다 */
export type LayoutSpec = {
  module: { lengthM: number; widthM: number; watt: number };
  tiltDeg: number;
  setbackM: number;
  gapM: number;
  /** 줄을 이 장수마다 끊고 통로를 둔다(0 이면 안 끊는다) */
  aisleEvery: number;
  aisleM: number;
  /** 한 줄에서 이어 붙은 토막(통로 · 빈칸에서 끊긴다)이 이보다 짧으면 안 깐다(1 이면 다 깐다) */
  minRun: number;
  /** 동지 정오 앞뒤 몇 시간 동안 앞줄 그림자가 뒷줄에 닿지 않게 띄우나 (2 → 오전 10시~오후 2시) */
  shadeHours: number;
  /**
   * 줄 간격을 이 태양 고도(°)의 그림자로 정한다 — 있으면 shadeHours 대신. 사업자 설계 기준이 고도 하나로 정해 둔 것
   * (구조설계 가이드라인의 「입사각 기준 이격거리」 · 설계 개요의 「음영각」 — lib/solar/proposal/layout-rule) — 위도와 상관없다.
   */
  shadeAngleDeg?: number;
  /**
   * 경사고정형 모듈 방위각의 한도 — 정남에서 동 · 서로 이 각(°)까지만 돌린다. 줄은 건물 변을 따라 정남에서 45° 까지 돌아가는데, 그보다 좁게
   * 정한 사업자 설계 기준이 있다(구조설계 가이드라인의 「모듈 방위각 정남 ±」). 넘는 건물은 줄을 한도까지만 돌려 깐다(변과 조금 어긋난다).
   */
  azimuthLimitDeg?: number;
};
export const SPEC: LayoutSpec = {
  module: MODULE,
  tiltDeg: TILT_DEG.roof,
  setbackM: LAYOUT.setbackM,
  gapM: LAYOUT.gapM,
  aisleEvery: LAYOUT.aisleEvery,
  aisleM: LAYOUT.aisleM,
  minRun: LAYOUT.minRun,
  shadeHours: LAYOUT.shadeHours,
};

type Pt = [number, number];
/** 미터 평면의 허용 오차 — 경위도와 미터를 오가며 생기는 비틀림(µm 단위)을 넘어서는 0.1mm */
const EPS_M = 1e-4;

/** 동지(적위 −23.44°) 정오에서 hours 시간 떨어진 때 — 높이 1 이 남북으로 드리우는 그림자 길이 */
export function winterShadowPerHeight(latDeg: number, hours: number = LAYOUT.shadeHours): number {
  const phi = rad(latDeg);
  const dec = rad(-23.44);
  const sinEl = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(rad(15 * hours));
  const el = Math.asin(sinEl);
  const cosAz = (sinEl * Math.sin(phi) - Math.sin(dec)) / (Math.cos(el) * Math.cos(phi));
  return Math.max(0, cosAz) / Math.tan(el);
}

/** 줄 하나가 차지하는 깊이(m) — 다음 줄 시작까지 */
export function rowPitch(style: LayoutStyle, latDeg: number, spec: LayoutSpec = SPEC): number {
  const L = spec.module.lengthM;
  if (style === 'flush') return L + spec.gapM;
  const t = rad(spec.tiltDeg);
  return L * Math.cos(t) + L * Math.sin(t) * shadowPerHeightOf(latDeg, spec);
}

/** 줄 간격을 정하는 그림자 길이(높이 1 당 남북) — 정한 태양 고도가 있으면 그것, 없으면 동지 shadeHours */
export function shadowPerHeightOf(latDeg: number, spec: Pick<LayoutSpec, 'shadeHours' | 'shadeAngleDeg'> = SPEC): number {
  return spec.shadeAngleDeg ? 1 / Math.tan(rad(spec.shadeAngleDeg)) : winterShadowPerHeight(latDeg, spec.shadeHours);
}

/* ---------------------------------------------------------- 기하 */

function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

/** 가장 작은 외접 직사각형 — 그 한 변의 각도와 그 방향·직각 방향 길이 */
export function mainAxis(points: Pt[]): { angle: number; along: number; across: number } {
  const h = hull(points);
  let best = { angle: 0, area: Infinity, along: 0, across: 0 };
  for (let i = 0; i < h.length; i++) {
    const [x1, y1] = h[i];
    const [x2, y2] = h[(i + 1) % h.length];
    const a = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(a);
    const s = Math.sin(a);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of h) {
      const rx = x * c + y * s;
      const ry = -x * s + y * c;
      minX = Math.min(minX, rx);
      maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry);
      maxY = Math.max(maxY, ry);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < best.area) best = { angle: a, area, along: maxX - minX, across: maxY - minY };
  }
  return { angle: best.angle, along: best.along, across: best.across };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
/** 직사각형의 네 꼭짓점 — 왼쪽 아래부터 반시계 */
const cornersOf = (r: Rect): Pt[] => [
  [r.x0, r.y0],
  [r.x1, r.y0],
  [r.x1, r.y1],
  [r.x0, r.y1],
];
/** 모듈 장수 × 출력(W) → kW */
const kwOf = (count: number, watt: number) => (count * watt) / 1000;
type Edge = { a: Pt; b: Pt; minX: number; minY: number; maxX: number; maxY: number };

const pointRect = ([px, py]: Pt, r: Rect) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));
const segsCross = (p1: Pt, p2: Pt, q1: Pt, q2: Pt) => {
  const d = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1);
  const d2 = d(q1, q2, p2);
  const d3 = d(p1, p2, q1);
  const d4 = d(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};

/** 선분과 축정렬 직사각형 사이 거리 — 겹치면 0 */
function segRect(e: Edge, r: Rect): number {
  const corners = cornersOf(r);
  if (pointRect(e.a, r) === 0 || pointRect(e.b, r) === 0) return 0;
  for (let i = 0; i < 4; i++) if (segsCross(e.a, e.b, corners[i], corners[(i + 1) % 4])) return 0;
  return Math.min(pointRect(e.a, r), pointRect(e.b, r), ...corners.map((c) => pointToSegment(c, e.a, e.b)));
}

/* ---------------------------------------------------------- 배치 */

/**
 * 한 지붕(바깥 고리 + 구멍)을 채운다 — 좌표는 회전된 미터 평면.
 * 모든 줄이 같은 격자를 쓴다 — 통로가 줄마다 같은 자리에 서서 지붕을 가로지르는 길이 된다.
 */
/**
 * 한 줄에서 이어 붙은 장들의 토막(통로 · 못 까는 칸에서 끊긴다) 중 minRun 장보다 짧은 것을 뺀다. 칸은 줄(같은 y) · 왼쪽부터 차례로 온다.
 * 이어 붙은 두 장의 틈은 모듈 사이 틈(몇 cm)이고, 통로 · 빈칸은 모듈 폭의 절반을 넘는다.
 */
function dropShortRuns(rects: Rect[], w: number, minRun: number): Rect[] {
  if (minRun <= 1) return rects;
  const out: Rect[] = [];
  let run: Rect[] = [];
  const close = () => {
    if (run.length >= minRun) out.push(...run);
    run = [];
  };
  for (const r of rects) {
    const prev = run[run.length - 1];
    if (prev && (r.y0 !== prev.y0 || r.x0 - prev.x1 > w / 2)) close();
    run.push(r);
  }
  close();
  return out;
}

function fill(rings: Pt[][], w: number, d: number, stepX: number, stepY: number, margin: number, aisleEvery: number, aisleM: number, minRun = 1): Rect[] {
  const [outer, ...holes] = rings;
  const edges: Edge[] = rings.flatMap((ring) =>
    ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return { a, b, minX: Math.min(a[0], b[0]), minY: Math.min(a[1], b[1]), maxX: Math.max(a[0], b[0]), maxY: Math.max(a[1], b[1]) };
    }),
  );
  const xs = outer.map((p) => p[0]);
  const ys = outer.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

  const fits = (r: Rect) => {
    const corners = cornersOf(r);
    if (!corners.every((c) => pointInRing(c, outer))) return false;
    if (holes.some((h) => corners.some((c) => pointInRing(c, h)))) return false;
    for (const e of edges) {
      if (e.maxX < r.x0 - margin || e.minX > r.x1 + margin || e.maxY < r.y0 - margin || e.minY > r.y1 + margin) continue;
      // 첫 줄은 테두리에서 정확히 margin 에 선다 — 돌린 건물에서는 그 거리가 margin 보다 조금 작게 나와 줄이 통째로 빠졌다
      // (50 × 5m 캐노피를 33° 돌리면 86장 → 44장). 경위도를 다녀오며 생기는 비틀림(µm 단위)이라 0.1mm 를 봐준다
      if (segRect(e, r) < margin - EPS_M) return false;
    }
    return true;
  };

  // 격자를 조금씩 밀어 보고 가장 많이 들어가는 것 — 줄 시작점에 따라 몇 줄이 갈린다
  let best: Rect[] = [];
  for (const fx of [0, 0.5]) {
    for (const fy of [0, 1 / 3, 2 / 3]) {
      const got: Rect[] = [];
      for (let y = minY + margin + fy * stepY; y + d <= maxY - margin + EPS_M; y += stepY) {
        for (let i = 0, x = minX + margin + fx * stepX; x + w <= maxX - margin + EPS_M; ) {
          const r = { x0: x, y0: y, x1: x + w, y1: y + d };
          if (fits(r)) got.push(r);
          i++;
          x += stepX + (aisleEvery && i % aisleEvery === 0 ? aisleM : 0);
        }
      }
      // 토막을 뺀 뒤의 장수로 고른다 — 남는 장이 많은 격자가 이긴다
      const kept = dropShortRuns(got, w, minRun);
      if (kept.length > best.length) best = kept;
    }
  }
  return best;
}

/**
 * @param polys 한 건물(지도 모양 또는 AI 가 딴 지붕)의 폴리곤들 — [경도, 위도]
 * @param latDeg 위도(경사 배치의 그림자 간격)
 */
export function layoutRoof(polys: PolygonCoords[], style: LayoutStyle, latDeg: number, over: Partial<LayoutSpec> = {}): Layout {
  const spec: LayoutSpec = { ...SPEC, ...over };
  const watt = spec.module.watt;
  const origin = centroidOf(polys);
  if (!origin) return { quads: [], count: 0, kw: 0, watt };
  const toM = projector(origin);
  const toLngLat = unprojector(origin);
  const rings = polys.map((p) => p.map((ring) => ring.map(toM) as Pt[]));
  const axis = mainAxis(rings.flatMap((p) => p[0] ?? []));

  // 줄 방향: 지붕면 부착형은 긴 변, 경사고정형은 동서에 가까운 변(직사각형은 90° 돌려도 같다)
  let angle = axis.angle;
  if (style === 'flush') {
    if (axis.along < axis.across) angle += Math.PI / 2;
  } else {
    angle = ((((angle + Math.PI / 4) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) - Math.PI / 4;
    // 줄의 기울기 = 모듈 방위각이 정남에서 돌아간 각 — 한도가 있으면 거기까지만
    if (spec.azimuthLimitDeg && spec.azimuthLimitDeg > 0) {
      const lim = rad(spec.azimuthLimitDeg);
      angle = Math.max(-lim, Math.min(lim, angle));
    }
  }
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = ([x, y]: Pt): Pt => [x * c + y * s, -x * s + y * c];
  const back = ([x, y]: Pt): Pt => [x * c - y * s, x * s + y * c];

  const w = spec.module.widthM;
  const d = style === 'flush' ? spec.module.lengthM : spec.module.lengthM * Math.cos(rad(spec.tiltDeg));
  const stepX = w + spec.gapM;
  const stepY = rowPitch(style, latDeg, spec);

  const quads: LngLat[][] = [];
  for (const p of rings) {
    const r = p.map((ring) => ring.map(rot));
    for (const m of fill(r, w, d, stepX, stepY, spec.setbackM, spec.aisleEvery, spec.aisleM, spec.minRun)) {
      quads.push(cornersOf(m).map((q) => toLngLat(back(q))));
    }
  }
  return { quads, count: quads.length, kw: kwOf(quads.length, watt), watt };
}

/* ---------------------------------------------------------- 빼기 */

/**
 * 빼기 영역과 겹치는 모듈을 지운다 — 원형 구조물·중정·채광창·옥상 설비처럼 지붕 모양에는 들어 있지만 못 까는 곳
 * (폭스존 광주점: 외곽선 6,953㎡ 를 다 채우면 원형 구조물과 가운데 정원 위에도 깔린다).
 * 모듈의 네 꼭짓점·가운데 중 하나가 영역 안이거나, 영역의 꼭짓점이 모듈 안이면 겹친 것으로 본다.
 */
export function cutLayout(layout: Layout, cuts: PolygonCoords[][]): Layout {
  if (!cuts.length || !layout.count) return layout;
  const rings = cuts.flatMap((polys) => polys.map((p) => p[0]).filter((r): r is LngLat[] => Boolean(r?.length)));
  const quads = layout.quads.filter((q) => {
    const center: LngLat = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
    return !rings.some((ring) => [...q, center].some((p) => pointInRing(p, ring)) || ring.some((v) => pointInRing(v, q)));
  });
  return quads.length === layout.count ? layout : { ...layout, quads, count: quads.length, kw: kwOf(quads.length, layout.watt) };
}

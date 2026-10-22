/**
 * 위성사진 위의 패널 배치 — ★순수 계산만 한다★ (그리기는 화면이, 저장은 저장소가).
 *
 * 협력사 회의 Agenda 의 배치도가 하는 일이 이것이다(21차 12~36쪽, 현장 24곳): 위성사진에서
 * 지붕면 하나를 네 점으로 집고, 그 안을 모듈 격자로 채우고, 센 장수에 모듈 출력을 곱해
 * 「650(W) × 136장 = 88.4kW」를 적는다. 사람이 눈으로 하던 그 일을 수로 옮긴다.
 *
 * ★네 점은 사람이 찍는다★ — 지붕면을 자동으로 찾는 일(윤곽 인식)은 오탐이 많아 결국 사람이
 * 고치게 된다. 찍는 것은 네 번이면 끝나고, 그 뒤는 전부 자동이다.
 *
 * ★길이는 한 변으로 준다★ — 위성사진에는 축척이 없다. 지붕 한 변의 실제 길이(m)를 받아
 * 픽셀당 미터를 역산한다. 지도에서 재거나 도면에서 가져오면 되고, 틀려도 그 한 값만 고치면
 * 전부 따라 움직인다. 「위성지도를 참고하여 배치함 · 설치용량은 현장 실측 후 변경될 수 있음」
 * 이라는 그 PDF 의 단서가 이 어림을 정직하게 말한 것이다.
 */

/** 그림 위의 한 점 — 픽셀. 원점은 왼쪽 위. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * 사람이 찍은 지붕면 — ★네 점의 차례가 뜻을 갖는다★.
 * a→b 가 모듈이 늘어서는 방향(가로), a→d 가 줄이 쌓이는 방향(세로)이다.
 * 네 점이 완전한 직사각형일 필요는 없다 — 위성사진은 비스듬히 찍히므로 a→b 와 a→d 의
 * 길이·방향만 쓰고 나머지는 그 두 변이 만드는 평행사변형으로 본다.
 */
export type Quad = [Pt, Pt, Pt, Pt];

/** 모듈 한 장 — 가로·세로는 미터, 출력은 와트 */
export interface Module {
  /** 긴 변 (m) — 세워 놓으면 이쪽이 세로다 */
  long: number;
  /** 짧은 변 (m) */
  short: number;
  /** 한 장 출력 (W) */
  watt: number;
}

/** 650W 급 모듈 — Agenda 의 현장 24곳이 전부 이 급이다(론지 650Wp 등) */
export const MODULE_650: Module = { long: 2.384, short: 1.303, watt: 650 };

export interface LayoutInput {
  /** 사람이 찍은 네 점 (픽셀) */
  quad: Quad;
  /** a→b 변의 실제 길이 (m) — 축척의 근거 */
  edgeMeters: number;
  module: Module;
  /** 모듈을 눕히나 — true 면 긴 변이 a→b 방향(가로)으로 눕는다 */
  landscape: boolean;
  /** 모듈 사이 틈 (m) — 가로·세로 같은 값으로 둔다(구조물 간격) */
  gap: number;
  /** 지붕 가장자리에서 띄우는 거리 (m) */
  margin: number;
}

/** 한 장이 놓일 자리 — 네 모서리를 픽셀로 준다(기울어져 있으므로 사각형이 아니다) */
export type Cell = [Pt, Pt, Pt, Pt];

export interface Layout {
  cells: Cell[];
  /** 가로 장수 × 세로 줄수 */
  cols: number;
  rows: number;
  /** 총 장수 */
  count: number;
  /** 총 용량 (W) */
  watt: number;
  /** 픽셀당 미터 — 되짚을 때 쓴다 */
  metersPerPx: number;
}

const sub = (p: Pt, q: Pt): Pt => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: Pt, q: Pt): Pt => ({ x: p.x + q.x, y: p.y + q.y });
const mul = (p: Pt, k: number): Pt => ({ x: p.x * k, y: p.y * k });
const len = (p: Pt): number => Math.hypot(p.x, p.y);

/**
 * 네 점 안을 모듈로 채운다.
 *
 * 격자는 a 에서 시작해 a→b 방향으로 cols 장, a→d 방향으로 rows 줄 놓는다. 두 방향의
 * 단위벡터에 「모듈 한 장 + 틈」만큼을 곱해 한 칸씩 옮기므로, 비스듬한 지붕에서도 격자가
 * 지붕을 따라 기운다 — Agenda 의 그림이 그렇게 생겼다.
 *
 * ★넘치면 줄인다★ — 마지막 한 장이 가장자리를 넘으면 그 줄·그 칸을 놓지 않는다.
 * 실제로 못 얹을 자리를 장수에 세면 용량이 부풀고, 그 수가 그대로 제안서에 실린다.
 */
export function layoutPanels(input: LayoutInput): Layout {
  const { quad, edgeMeters, module: mod, landscape, gap, margin } = input;
  const [a, b, , d] = quad;

  const alongVec = sub(b, a);
  const downVec = sub(d, a);
  const alongPx = len(alongVec);
  const downPx = len(downVec);

  /* 축척 — a→b 가 edgeMeters 다. 둘 중 하나라도 0 이면 격자를 못 만든다. */
  if (alongPx === 0 || downPx === 0 || edgeMeters <= 0) {
    return { cells: [], cols: 0, rows: 0, count: 0, watt: 0, metersPerPx: 0 };
  }
  const metersPerPx = edgeMeters / alongPx;

  /* 한 장이 차지하는 실제 크기 — 눕히면 긴 변이 가로다 */
  const cellW = landscape ? mod.long : mod.short;
  const cellH = landscape ? mod.short : mod.long;

  /* 가장자리를 뺀 쓸 수 있는 길이(m) */
  const usableAlong = alongPx * metersPerPx - margin * 2;
  const usableDown = downPx * metersPerPx - margin * 2;

  /* n 장을 놓으려면 n*cell + (n-1)*gap 이 쓸 수 있는 길이 안에 들어야 한다 */
  const fit = (usable: number, cell: number): number => {
    if (cell <= 0) return 0;
    const n = Math.floor((usable + gap) / (cell + gap));
    return Math.max(0, n);
  };
  const cols = fit(usableAlong, cellW);
  const rows = fit(usableDown, cellH);
  if (cols === 0 || rows === 0) {
    return { cells: [], cols: 0, rows: 0, count: 0, watt: 0, metersPerPx };
  }

  /* 미터를 픽셀로 되돌려 단위벡터에 싣는다 */
  const alongUnit = mul(alongVec, 1 / alongPx);
  const downUnit = mul(downVec, 1 / downPx);
  const pxOf = (m: number) => m / metersPerPx;

  const stepAlong = pxOf(cellW + gap);
  const stepDown = pxOf(cellH + gap);
  const cellAlong = pxOf(cellW);
  const cellDown = pxOf(cellH);

  /*
   * ★남는 자리는 가운데로 나눈다★ — 가장자리에만 몰면 한쪽이 비어 어색하다.
   * 그 PDF 의 그림도 지붕면 가운데에 격자가 앉아 있다.
   */
  const usedAlong = cols * cellW + (cols - 1) * gap;
  const usedDown = rows * cellH + (rows - 1) * gap;
  const padAlong = pxOf((alongPx * metersPerPx - usedAlong) / 2);
  const padDown = pxOf((downPx * metersPerPx - usedDown) / 2);

  const cells: Cell[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const o = add(
        a,
        add(mul(alongUnit, padAlong + c * stepAlong), mul(downUnit, padDown + r * stepDown))
      );
      cells.push([
        o,
        add(o, mul(alongUnit, cellAlong)),
        add(o, add(mul(alongUnit, cellAlong), mul(downUnit, cellDown))),
        add(o, mul(downUnit, cellDown)),
      ]);
    }
  }

  const count = cols * rows;
  return { cells, cols, rows, count, watt: count * mod.watt, metersPerPx };
}

/**
 * 블록 여럿의 합 — 한 현장에 지붕면이 여럿이다(Agenda 의 현장은 대개 2~3 블록).
 * 제안서 표의 「650(W) × 136장 = 88.4kW」가 이 합이다.
 */
export function totalOf(layouts: Layout[]): { count: number; watt: number; kw: number } {
  const count = layouts.reduce((n, l) => n + l.count, 0);
  const watt = layouts.reduce((n, l) => n + l.watt, 0);
  /* kW 는 소수 한 자리 — 그 PDF 의 표기가 그렇다(88.4kW · 180.7kW) */
  return { count, watt, kw: Math.round(watt / 100) / 10 };
}

/** 제안서 표에 그대로 들어가는 글 — 「650(W)*136장=88.4kW」 */
export function capacityLabel(mod: Module, count: number): string {
  const kw = Math.round((count * mod.watt) / 100) / 10;
  return `${mod.watt}(W)*${count}장=${kw}kW`;
}

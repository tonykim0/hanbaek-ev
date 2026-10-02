/**
 * 사진을 칸 모양으로 — 자를 창 셈. [순수 모듈]
 *
 * 엑셀(xlsx-kit addPicture fill) · 워드(docx-kit putImage) · 여러 장 바둑판(prepare-image) 이 다 이것을 쓴다:
 * 사진을 늘리지 않고 칸 비율로 잘라 칸을 꽉 채운다(한백 「사진이 칸에 맞춰서」). 사진 위 표시가 있으면
 * 그 자리가 남게 창을 옮긴다.
 */

/**
 * 칸 비율로 자를 창 — 잘라 낼 몫(왼·위·오른·아래, 0~1). 사진이 칸보다 납작하면 양옆을, 길쭉하면
 * 위아래를 자른다. 창은 가운데가 기본이고, 표시 범위(focus)가 있으면 그것이 들어오게 옮긴다 —
 * 창보다 넓으면 표시 범위의 가운데에 맞춘다. 사진 밖으로는 나가지 않는다.
 */
export function crop(
  imgAspect: number,
  boxAspect: number,
  focus?: { x0: number; y0: number; x1: number; y1: number }
): { l: number; t: number; r: number; b: number } {
  const winW = imgAspect > boxAspect ? boxAspect / imgAspect : 1;
  const winH = imgAspect > boxAspect ? 1 : imgAspect / boxAspect;
  const place = (win: number, f0?: number, f1?: number) => {
    let start = (1 - win) / 2;
    if (f0 !== undefined && f1 !== undefined) {
      start = f1 - f0 <= win ? Math.min(Math.max(start, f1 - win), f0) : (f0 + f1) / 2 - win / 2;
    }
    return Math.min(Math.max(0, start), 1 - win);
  };
  const l = place(winW, focus?.x0, focus?.x1);
  const t = place(winH, focus?.y0, focus?.y1);
  return { l, t, r: Math.max(0, 1 - l - winW), b: Math.max(0, 1 - t - winH) };
}

/**
 * 자른 창 안에 표시 범위가 다 드는가 — 안 들면 자르지 않고 칸 안에 들인다(contain). 자르면 엑셀은 표시 도형이
 * 사진 밖(이웃 칸·사진 설명)으로 삐져나가고, 워드는 사진에 구운 표시가 잘려 나간다.
 */
export function fits(w: { l: number; t: number; r: number; b: number }, focus?: { x0: number; y0: number; x1: number; y1: number }): boolean {
  if (!focus) return true;
  const e = 1e-6;
  return focus.x0 >= w.l - e && focus.x1 <= 1 - w.r + e && focus.y0 >= w.t - e && focus.y1 <= 1 - w.b + e;
}

export interface Tile { x: number; y: number; w: number; h: number }

/**
 * 한 칸에 사진 여러 장 — 칸(W×H, 픽셀)을 n 칸으로 나눈다. 칸 모양이 사진 모양(보통 4:3)에 가장 가까운 배치를
 * 고른다: 두 장은 위아래 또는 좌우 · 세 장은 「위 한 장 + 아래 두 장」 · 「왼쪽 한 장 + 오른쪽 두 장」 · 한 줄
 * 셋 중에서 · 넷 이상은 바둑판. 빈 칸이 생기지 않게 마지막 줄은 남은 장으로 폭을 나눈다.
 */
export function collageTiles(n: number, W: number, H: number, gap = 8, photoAspect = 4 / 3): Tile[] {
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];
  /** 줄마다 몇 장인가 → 칸들 (w×h 틀에서) */
  const rowsIn = (rows: number[], w: number, h: number): Tile[] => {
    const out: Tile[] = [];
    const rh = (h - gap * (rows.length - 1)) / rows.length;
    rows.forEach((cols, r) => {
      const cw = (w - gap * (cols - 1)) / cols;
      for (let c = 0; c < cols; c++) out.push({ x: c * (cw + gap), y: r * (rh + gap), w: cw, h: rh });
    });
    return out;
  };
  const byRows = (rows: number[]) => rowsIn(rows, W, H);
  /** 열마다 몇 장인가 — 가로·세로를 바꿔 줄로 나눈 뒤 되돌린다 */
  const byCols = (cols: number[]) => rowsIn(cols, H, W).map((t) => ({ x: t.y, y: t.x, w: t.h, h: t.w }));
  const cands: Tile[][] = [];
  if (n === 2) cands.push(byRows([2]), byRows([1, 1]));
  else if (n === 3) cands.push(byRows([1, 2]), byCols([1, 2]), byRows([3]), byRows([1, 1, 1]));
  else {
    for (let rows = 1; rows <= n; rows++) {
      const per = Math.ceil(n / rows);
      const list = Array.from({ length: rows }, (_, r) => Math.min(per, n - r * per)).filter((k) => k > 0);
      if (list.length === rows) cands.push(byRows(list));
    }
  }
  const cost = (ts: Tile[]) => ts.reduce((a, t) => a + Math.abs(Math.log(t.w / t.h / photoAspect)), 0);
  return cands.reduce((best, c) => (cost(c) < cost(best) ? c : best));
}

/**
 * 사진·도면 위 표시 (한백 지시 2026-10-01).
 *
 * 실사보고서 제출본들은 사진과 도면 위에 엑셀·워드 도형으로 표시를 얹어 냈다. 여기서 그리면 서식에
 * 넣을 때 사진에 합쳐 굽는다 — 받은 파일을 다시 열어 도형을 얹을 일이 없다.
 *
 * ★표시의 종류는 제출본의 범례에서 왔다★ (이 Mac 의 플러그링크 실사보고서 349곳의 도형을 모양·색·
 * 선 굵기·점선·화살표·그림까지 갈라 셌다 — 한백 「네모도 여러 종류, 선도 그렇고, 분전반·전주를 구분해놨어」):
 *
 *   기호(sym) — 누른 자리에 찍는다. 플러그링크 도면 범례 그대로다.
 *     charger   충전기 — 하늘색 네모                       (도면 286곳 · 1,669개)
 *     panelNew  충전기 분전반(신설) — 초록 네모에 대각선    (서식 범례 그림 · 290곳 1,254개)
 *     panelOld  기존 분전반(인입점) — 주황 네모에 대각선    (같은 범례 · 299곳 1,274개)
 *     pole      전신주 — 빨간 겹동그라미                    (범례에 전신주를 둔 도면 41곳)
 *     ipPole    IP 전주 — 파란 동그라미                     (같은 곳들)
 *   선(line) — 누를 때마다 꺾인다(가로·세로에 가까우면 곧게 붙는다). 네 가지다.
 *     arrow     빨간 선 + 끝 화살표 — 사진 위 전력 인입 경로 (사진대지에서 가장 흔하다)
 *     wire      굵은 빨간 선, 화살표 없음 — 도면의 배선 경로(기존 분전반 → 충전기 분전반)
 *     dash      빨간 점선 — 땅속·벽 속처럼 안 보이는 구간, 계획 경로(현대엔지니어링 별지의 경로가 이랬다)
 *     leader    가는 검은 선 + 끝 화살표 — 글상자에서 자리를 짚는 지시선(도면 98곳)
 *   번호(num) — 주차면 위 번호. ★모양은 서식마다★:
 *     red       빨간 테두리 · 빈 속 · 빨간 숫자 — 플러그링크(84곳 중 81곳) · 현대엔지니어링 별지
 *     yellow    노란 속 · 검은 숫자 — SK·나이스 사진 대장(101건 전부)
 *   글상자(text) — 흰 바탕 · 검은 테 · 검은 글자(도면 318곳). 여러 줄이 된다.
 *   거점 라벨(label) — 도면의 그 상자: 위 칸은 빨간 글자(「1거점 신규 4대」·분전반 이름), 아래 칸은
 *     검은 글자(「CV 16sq-4C 35m」·「GV 16sq 35m」). 값은 거점에서 만든다(spec plSpotLabel).
 *   동그라미 · 네모 — 끌어서 그린다. 동그라미는 빨강, 네모는 노랑(사진에서 차단기를 짚던 꼴).
 *
 * ★좌표는 사진의 가로·세로에 대한 비율(0~1)이다★ — 화면 크기와 상관없이 같은 자리다.
 * ★굵기·크기는 사진의 긴 변에 비례한다★ — 미리보기(작은 캔버스)와 구운 사진(1600px)이 같은
 * 함수(drawAnnots)를 쓰므로 화면에서 본 모양이 받은 파일의 모양이다.
 */

export interface Pt { x: number; y: number }

export type SymKind = 'charger' | 'panelNew' | 'panelOld' | 'pole' | 'ipPole';
export type LineKind = 'arrow' | 'wire' | 'dash' | 'leader';

/**
 * 표시마다 크기(z, 보통 = 1)를 갖는다 — 도면은 사진보다 촘촘해 같은 크기면 글자가 평면도를 덮는다
 * (한백 「도면에 표시할 때 글자가 너무 커」). 기호는 돌릴 수 있다(r, 도) — 주차면이 가로로 늘어선 줄도 있다.
 */
export type Annot = { z?: number } & (
  | { t: 'num'; x: number; y: number }
  | { t: 'sym'; k: SymKind; x: number; y: number; r?: number }
  | { t: 'line'; pts: Pt[]; k?: LineKind }
  | { t: 'oval'; a: Pt; b: Pt }
  | { t: 'box'; a: Pt; b: Pt }
  | { t: 'text'; x: number; y: number; text: string }
  | { t: 'label'; x: number; y: number; head: string[]; body: string[] }
);

/** 번호 모양 — 위 머리말 */
export type NumStyle = 'red' | 'yellow';

/** 기호 이름 — 도면 범례의 말 그대로 */
export const SYM_LABEL: Record<SymKind, string> = {
  charger: '충전기',
  panelNew: '충전기 분전반',
  panelOld: '기존 분전반',
  pole: '전신주',
  ipPole: 'IP 전주',
};

const RED = '#e11d2a';
const YELLOW = '#facc15';
const INK = '#111827';
/** 범례의 색 — 서식 「3. 도면」 범례(하늘 00B0F0)와 범례 그림(초록·주황)에서 땄다 */
export const SYM_COLOR: Record<SymKind, string> = {
  charger: '#00b0f0',
  panelNew: '#00b050',
  panelOld: '#ffc000',
  pole: RED,
  ipPole: '#0000ff',
};

/**
 * 크기(긴 변 비율, 보통 = 1 일 때) — 처음 잡았던 값(번호 0.026 · 글자 0.019)이 컸다(한백 「동그라미
 * 사이즈 줄여」「글자가 너무 커」). 제출본 도면에서 라벨 글자는 평면도 폭의 1% 안팎이다.
 */
const NUM_R = 0.019;
const SYM_U = 0.016;
const TEXT_U = 0.013;

export const numCount = (list: Annot[]) => list.filter((a) => a.t === 'num').length;

/** 2D 그리기 — 캔버스(브라우저)와 같은 꼴만 쓴다 */
type Ctx = Pick<CanvasRenderingContext2D,
  'beginPath' | 'arc' | 'fill' | 'stroke' | 'moveTo' | 'lineTo' | 'closePath' | 'ellipse' | 'strokeRect'
  | 'fillRect' | 'fillText' | 'strokeText' | 'measureText' | 'save' | 'restore' | 'setLineDash'
  | 'translate' | 'rotate'>
  & { fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number; lineJoin: CanvasLineJoin; lineCap: CanvasLineCap; font: string;
    textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline };

const FONT = '-apple-system, "Malgun Gothic", sans-serif';

/** 기호 하나 — 가운데가 (x, y) */
export function drawSym(ctx: Ctx, k: SymKind, x0: number, y0: number, u: number, z = 1, rot = 0): void {
  const s = Math.max(8, u * SYM_U * z);
  ctx.save();
  ctx.translate(x0, y0);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  const x = 0; const y = 0;
  ctx.lineJoin = 'miter';
  if (k === 'pole' || k === 'ipPole') {
    const r = s * 0.55;
    if (k === 'pole') {
      // 겹동그라미 — 속이 비어 도면이 비친다
      ctx.strokeStyle = SYM_COLOR.pole;
      ctx.lineWidth = Math.max(2, r * 0.22);
      for (const rr of [r, r * 0.5]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = SYM_COLOR.ipPole; ctx.fill();
      ctx.lineWidth = Math.max(1, u * 0.0012); ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // 네모 셋 — 충전기는 세로로 긴 칸(주차면 하나), 분전반은 가로로 긴 함에 대각선
  const [bw, bh] = k === 'charger' ? [s * 0.8, s * 1.3] : [s * 1.3, s * 0.85];
  ctx.fillStyle = SYM_COLOR[k];
  ctx.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  ctx.lineWidth = Math.max(1, u * (k === 'charger' ? 0.0012 : 0.002));
  ctx.strokeStyle = INK;
  ctx.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
  if (k !== 'charger') {
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, y - bh / 2);
    ctx.lineTo(x + bw / 2, y + bh / 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 글자 줄을 흰 상자에 — 거점 라벨은 위 칸(빨강)·아래 칸(검정)을 가는 선으로 가른다 */
function drawBoxText(ctx: Ctx, x: number, y: number, u: number, head: string[], body: string[], z = 1): void {
  const fs = Math.max(9, Math.round(u * TEXT_U * z));
  const lh = fs * 1.35;
  const pad = fs * 0.55;
  ctx.font = `800 ${fs}px ${FONT}`;
  const lines = [...head, ...body];
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), fs * 2);
  const hgt = lines.length * lh + pad * 2 + (head.length && body.length ? pad : 0);
  const left = x - tw / 2 - pad;
  const top = y - hgt / 2;
  ctx.fillStyle = '#fff';
  ctx.fillRect(left, top, tw + pad * 2, hgt);
  ctx.lineWidth = Math.max(1, u * 0.0012);
  ctx.strokeStyle = INK;
  ctx.strokeRect(left, top, tw + pad * 2, hgt);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let cy = top + pad + lh / 2;
  for (const l of head) { ctx.fillStyle = RED; ctx.fillText(l, x, cy); cy += lh; }
  if (head.length && body.length) {
    const mid = cy - lh / 2 + pad / 2;
    ctx.beginPath(); ctx.moveTo(left, mid); ctx.lineTo(left + tw + pad * 2, mid); ctx.stroke();
    cy += pad;
  }
  for (const l of body) { ctx.fillStyle = INK; ctx.fillText(l, x, cy); cy += lh; }
}

export function drawAnnots(ctx: Ctx, w: number, h: number, list: Annot[], style: NumStyle = 'red'): void {
  const u = Math.max(w, h);
  const X = (p: Pt) => p.x * w;
  const Y = (p: Pt) => p.y * h;
  let n = 0;
  ctx.save();
  for (const a of list) {
    const z = a.z ?? 1;
    ctx.setLineDash([]);
    if (a.t === 'num') {
      n += 1;
      const r = Math.max(8, Math.round(u * NUM_R * z));
      const x = a.x * w; const y = a.y * h;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(r * 1.15)}px ${FONT}`;
      if (style === 'yellow') {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffff00';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, r * 0.08);
        ctx.strokeStyle = '#1f2937';
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.fillText(String(n), x, y + r * 0.04);
      } else {
        // 빈 속이라 사진에 묻히지 않게 흰 테를 먼저 깔고 빨강을 얹는다(어두운 지하주차장 사진)
        const lw = Math.max(2, r * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.lineWidth = lw + Math.max(2, r * 0.1);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
        ctx.lineWidth = lw;
        ctx.strokeStyle = RED;
        ctx.stroke();
        ctx.lineWidth = Math.max(2, r * 0.14);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeText(String(n), x, y + r * 0.04);
        ctx.fillStyle = RED;
        ctx.fillText(String(n), x, y + r * 0.04);
      }
    } else if (a.t === 'sym') {
      drawSym(ctx, a.k, a.x * w, a.y * h, u, z, a.r ?? 0);
    } else if (a.t === 'line' && a.pts.length >= 2) {
      const k = a.k ?? 'arrow';
      const lw = (k === 'wire' || k === 'dash' ? Math.max(3, u * 0.006) : k === 'leader' ? Math.max(1.2, u * 0.0018) : Math.max(2, u * 0.005)) * z;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = k === 'dash' ? 'butt' : 'round';
      if (k === 'dash') ctx.setLineDash([lw * 2.6, lw * 1.6]);
      ctx.strokeStyle = k === 'leader' ? INK : RED;
      ctx.beginPath();
      ctx.moveTo(X(a.pts[0]), Y(a.pts[0]));
      for (const p of a.pts.slice(1)) ctx.lineTo(X(p), Y(p));
      ctx.stroke();
      ctx.setLineDash([]);
      if (k === 'wire' || k === 'dash') continue;
      // 끝 화살표 — 마지막 마디의 방향으로
      const p = a.pts[a.pts.length - 1];
      const q = a.pts[a.pts.length - 2];
      const ang = Math.atan2(Y(p) - Y(q), X(p) - X(q));
      const s = (k === 'leader' ? Math.max(7, u * 0.01) : Math.max(9, u * 0.018)) * z;
      ctx.fillStyle = k === 'leader' ? INK : RED;
      ctx.beginPath();
      ctx.moveTo(X(p) + Math.cos(ang) * s * 0.35, Y(p) + Math.sin(ang) * s * 0.35);
      ctx.lineTo(X(p) - Math.cos(ang - 0.45) * s, Y(p) - Math.sin(ang - 0.45) * s);
      ctx.lineTo(X(p) - Math.cos(ang + 0.45) * s, Y(p) - Math.sin(ang + 0.45) * s);
      ctx.closePath();
      ctx.fill();
    } else if (a.t === 'oval' || a.t === 'box') {
      const x1 = Math.min(X(a.a), X(a.b)); const x2 = Math.max(X(a.a), X(a.b));
      const y1 = Math.min(Y(a.a), Y(a.b)); const y2 = Math.max(Y(a.a), Y(a.b));
      ctx.lineWidth = Math.max(2, u * 0.004) * z;
      if (a.t === 'oval') {
        ctx.strokeStyle = RED;
        ctx.beginPath();
        ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(1, (x2 - x1) / 2), Math.max(1, (y2 - y1) / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 네모는 노랑 — 제출본들이 차단기를 노란 상자로 짚었다
        ctx.strokeStyle = YELLOW;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      }
    } else if (a.t === 'text' && a.text.trim()) {
      drawBoxText(ctx, a.x * w, a.y * h, u, [], a.text.split('\n').map((l) => l.trim()).filter(Boolean), z);
    } else if (a.t === 'label') {
      drawBoxText(ctx, a.x * w, a.y * h, u, a.head.filter(Boolean), a.body.filter(Boolean), z);
    }
  }
  ctx.restore();
}

/** 표시가 서 있는 점들 — 범위·끌기가 쓴다 */
function pointsOf(a: Annot): Pt[] {
  if (a.t === 'line') return a.pts;
  if (a.t === 'oval' || a.t === 'box') return [a.a, a.b];
  return [a];
}

/**
 * 표시들이 차지한 범위(비율 0~1) — 사진을 칸 모양으로 자를 때 이 범위를 남긴다. 표시가 없으면 null.
 * 번호 원·글자 상자는 점이 아니라 크기가 있어 둘레를 조금 더 잡는다.
 */
export function annotBounds(list: Annot[]): { x0: number; y0: number; x1: number; y1: number } | null {
  const pts = list.flatMap(pointsOf);
  if (pts.length === 0) return null;
  const pad = 0.05;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  return { x0: c(Math.min(...xs) - pad), y0: c(Math.min(...ys) - pad), x1: c(Math.max(...xs) + pad), y1: c(Math.max(...ys) + pad) };
}

/** 누른 자리에서 가장 가까운 표시 — 지우개·끌기가 쓴다. 없으면 -1 */
export function hitAnnot(list: Annot[], p: Pt, aspect: number): number {
  // 비율 좌표를 긴 변 기준 거리로 — 세로 사진에서도 같은 손가락 거리로 잡힌다
  const sx = aspect >= 1 ? 1 : aspect;
  const sy = aspect >= 1 ? 1 / aspect : 1;
  const d = (a: Pt, b: Pt) => Math.hypot((a.x - b.x) * sx, (a.y - b.y) * sy);
  const segD = (p0: Pt, a: Pt, b: Pt) => {
    const ax = a.x * sx; const ay = a.y * sy; const bx = b.x * sx; const by = b.y * sy;
    const px = p0.x * sx; const py = p0.y * sy;
    const L = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L));
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
  };
  const TOL = 0.035;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if ((a.t === 'num' || a.t === 'sym') && d(a, p) < Math.max(0.02, NUM_R * 1.4 * (a.z ?? 1))) return i;
    if ((a.t === 'text' || a.t === 'label') && d(a, p) < 0.06) return i;
    if (a.t === 'line') {
      for (let k = 1; k < a.pts.length; k++) if (segD(p, a.pts[k - 1], a.pts[k]) < TOL) return i;
    }
    if (a.t === 'oval' || a.t === 'box') {
      const x1 = Math.min(a.a.x, a.b.x) - 0.02; const x2 = Math.max(a.a.x, a.b.x) + 0.02;
      const y1 = Math.min(a.a.y, a.b.y) - 0.02; const y2 = Math.max(a.a.y, a.b.y) + 0.02;
      if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) return i;
    }
  }
  return -1;
}

/** 표시를 통째로 옮긴다(dx·dy 는 비율) — 선·동그라미·네모는 점마다 같이 민다 */
export function moveAnnot(a: Annot, dx: number, dy: number): Annot {
  const m = (p: Pt): Pt => ({ x: Math.min(1, Math.max(0, p.x + dx)), y: Math.min(1, Math.max(0, p.y + dy)) });
  if (a.t === 'line') return { ...a, pts: a.pts.map(m) };
  if (a.t === 'oval' || a.t === 'box') return { ...a, a: m(a.a), b: m(a.b) };
  return { ...a, ...m(a) };
}

/**
 * 선을 곧게 — 앞 점에서 가로·세로로 8° 안이면 그 축에 붙인다. 도면의 배선 경로는 복도를 따라
 * 꺾이는 직각 선이라, 손으로 그어도 반듯해야 한다. aspect 는 사진의 가로/세로(비율 좌표를 각도로).
 */
export function snapPt(prev: Pt, p: Pt, aspect: number): Pt {
  const dx = (p.x - prev.x) * aspect; const dy = p.y - prev.y;
  const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  const near = (t: number) => Math.abs(ang - t) < 8;
  if (near(0) || near(180)) return { x: p.x, y: prev.y };
  if (near(90)) return { x: prev.x, y: p.y };
  return p;
}

/**
 * 사진·도면 위 표시 (한백 지시 2026-10-01).
 *
 * 실사보고서 제출본들은 사진과 도면 위에 엑셀·워드 도형으로 표시를 얹어 냈다. 여기서 그리면 서식에
 * 들어간다 — ★플러그링크 엑셀에는 엑셀 도형으로★(사진과 묶음, 엑셀에서 다시 고친다 — lib/survey/xlsx-marks),
 * 현대엔지니어링·SK·나이스 워드에는 사진에 합쳐 굽는다.
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
 *   선(line) — 누를 때마다 꺾인다(가로·세로에 가까우면 곧게 붙는다). ★굵기는 하나다★(한백 「선 두께 통일,
 *   두껍게 하지 말아줘」 — 지시선도 화살표와 다를 것이 없어 합쳤다):
 *     arrow     빨간 선 + 끝 화살표 — 전력 인입 경로 · 글상자에서 자리를 짚는 지시
 *     wire      빨간 선, 화살표 없음 — 도면의 배선 경로(기존 분전반 → 충전기 분전반)
 *     dash      빨간 점선 — 땅속·벽 속처럼 안 보이는 구간, 계획 경로
 *   번호(num) — 주차면 위 번호. ★모양은 서식마다★:
 *     red       빨간 테두리 · 빨간 숫자 — 플러그링크(84곳 중 81곳) · 현대엔지니어링 별지. 제출본은 속이 비었지만
 *               노랑으로 채운다(한백 2026-10-02 — 빈 속은 사진에 묻힌다)
 *     yellow    노란 속 · 검은 숫자 — SK·나이스 사진 대장(101건 전부)
 *   글상자(text) — 흰 바탕 · 검은 테 · 검은 글자(도면 318곳). 여러 줄이 된다.
 *   거점 라벨(label) — 도면의 그 상자: 위 칸은 빨간 글자(「1거점 신규 4대」·분전반 이름), 아래 칸은
 *     검은 글자(「CV 16sq-4C 35m」·「GV 16sq 35m」). 값은 거점에서 만든다(spec plSpotLabel).
 *   동그라미 · 네모 — 끌어서 그린다. 동그라미는 빨강, 네모는 노랑(사진에서 차단기를 짚던 꼴).
 *
 * ★모든 표시는 상자 하나로 잰다★ — 가운데·폭·높이·회전(boxOf). 화면의 고르기 틀·모서리 손잡이·회전
 * 꼭지, 엑셀 도형의 자리가 모두 이 상자에서 나온다. 그래서 화면에서 늘리고 돌린 것이 엑셀에서도 같다.
 *
 * ★좌표는 사진의 가로·세로에 대한 비율(0~1)이다★ — 화면 크기와 상관없이 같은 자리다.
 * ★크기는 사진의 긴 변에 비례한다★ — 미리보기(작은 캔버스)와 구운 사진(1600px)이 같은 함수를 쓴다.
 */

export interface Pt { x: number; y: number }

export type SymKind = 'charger' | 'panelNew' | 'panelOld' | 'pole' | 'ipPole';
export type LineKind = 'arrow' | 'wire' | 'dash';

/**
 * 크기(z, 보통 = 1)는 점 하나로 서는 표시(번호·기호·글자·라벨)의 것이다 — 모서리를 끌면 바뀐다.
 * 회전(r, 도)은 선을 뺀 모든 표시가 갖는다 — 위 꼭지를 끌면 바뀐다(선은 점을 직접 돌린다).
 * 동그라미·네모는 두 모서리(a·b)가 크기다.
 */
export type Annot = { z?: number; r?: number } & (
  | { t: 'num'; x: number; y: number }
  | { t: 'sym'; k: SymKind; x: number; y: number }
  | { t: 'line'; pts: Pt[]; k?: LineKind | 'leader' }
  | { t: 'oval'; a: Pt; b: Pt }
  | { t: 'box'; a: Pt; b: Pt }
  | { t: 'text'; x: number; y: number; text: string }
  /*
   * 거점 라벨 — spot(거점 번호)이 있으면 ★거점 값에 묶인다★: 그릴 때·서식에 넣을 때 그 거점의 지금 값으로
   * 글을 다시 만든다(resolveLabels). 거점의 배관·배선 길이를 고치면 도면의 흰 상자가 따라 바뀐다
   * (한백 「글자는 숫자 입력하는 거에 따라 해당 도면에 자동 표시」). head·body 는 마지막으로 만든 글이다.
   */
  | { t: 'label'; x: number; y: number; head: string[]; body: string[]; spot?: number }
);

/** 거점 라벨의 글 — 거점 값에서 만든다(spec plSpotLabel) */
export interface SpotLabel { name: string; head: string[]; body: string[] }

/** 거점에 묶인 라벨을 지금 값으로 — 그 거점이 없으면 마지막 글을 그대로 둔다 */
export function resolveLabels(list: Annot[], labels: SpotLabel[] | undefined): Annot[] {
  if (!labels?.length || !list.some((a) => a.t === 'label' && a.spot)) return list;
  return list.map((a) => {
    if (a.t !== 'label' || !a.spot) return a;
    const l = labels.find((x) => x.name === `${a.spot}거점`);
    return l ? { ...a, head: l.head, body: l.body } : a;
  });
}

/**
 * 거점 하나를 뺐을 때 — ★라벨은 거점 번호에 묶이므로★ 그 거점의 라벨은 걷고, 뒤 거점의 라벨은 번호를 하나씩
 * 당긴다. 그대로 두면 3거점 중 2거점을 뺐을 때 도면의 「2거점」 상자에 옛 3거점의 값이 들어가고, 옛 3거점의
 * 라벨은 빈 「3거점」 상자가 된다(엑셀에 조용히 틀린 값이 나간다).
 */
export function dropSpotLabels(list: Annot[], removed: number): Annot[] {
  if (!list.some((a) => a.t === 'label' && a.spot)) return list;
  return list.flatMap((a) => {
    if (a.t !== 'label' || !a.spot || a.spot < removed) return [a];
    return a.spot === removed ? [] : [{ ...a, spot: a.spot - 1 }];
  });
}

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

export const RED = '#e11d2a';
export const YELLOW = '#facc15';
export const INK = '#111827';
/** 범례의 색 — 서식 「3. 도면」 범례(하늘 00B0F0)와 범례 그림(초록·주황)에서 땄다 */
export const SYM_COLOR: Record<SymKind, string> = {
  charger: '#00b0f0',
  panelNew: '#00b050',
  panelOld: '#ffc000',
  pole: RED,
  ipPole: '#0000ff',
};

/** 크기(긴 변 비율, 보통 = 1) — 한백 「동그라미 사이즈 줄여」「글자가 너무 커」로 줄인 값 */
const NUM_R = 0.019;
const SYM_U = 0.016;
const TEXT_U = 0.013;
/** 선 굵기 — 모든 선·동그라미·네모가 같은 굵기다 */
export const lineWidthOf = (u: number) => Math.max(2, u * 0.0032);

export const numCount = (list: Annot[]) => list.filter((a) => a.t === 'num').length;
export const lineKindOf = (a: { k?: LineKind | 'leader' }): LineKind => (a.k === 'leader' || !a.k ? 'arrow' : a.k);

/** 2D 그리기 — 캔버스(브라우저)와 같은 꼴만 쓴다 */
type Ctx = Pick<CanvasRenderingContext2D,
  'beginPath' | 'arc' | 'fill' | 'stroke' | 'moveTo' | 'lineTo' | 'closePath' | 'ellipse' | 'strokeRect'
  | 'fillRect' | 'fillText' | 'strokeText' | 'save' | 'restore' | 'setLineDash' | 'translate' | 'rotate'>
  & { fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number; lineJoin: CanvasLineJoin; lineCap: CanvasLineCap; font: string;
    textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline };

export const FONT = '-apple-system, "Malgun Gothic", sans-serif';

/* ── 상자 하나로 잰다 ─────────────────────────────────────────────────────── */

/** 표시의 상자 — 사진 픽셀(가로 w · 세로 h)로. 가운데·폭·높이·회전(도) */
export interface Box { cx: number; cy: number; w: number; h: number; r: number }

/**
 * 글자 폭 어림 — 한글·한자는 한 글자, 그 밖은 0.6 글자. 캔버스의 measureText 대신 이 어림을 쓴다:
 * 엑셀 도형의 상자 크기도 같은 값으로 잡아야 화면과 엑셀이 같다(엑셀은 글자를 재 주지 않는다).
 */
export function textWidth(s: string, fs: number): number {
  let n = 0;
  for (const ch of s) n += /[ㄱ-힣一-鿿]/.test(ch) ? 1 : 0.6;
  return n * fs;
}

/** 글상자·라벨의 글자 크기와 줄 */
export function textLayout(a: { t: 'text' | 'label'; z?: number } & ({ text: string } | { head: string[]; body: string[] }), u: number) {
  const fs = Math.max(9, u * TEXT_U * (a.z ?? 1));
  const head = 'head' in a ? a.head.filter(Boolean) : [];
  const body = 'head' in a ? a.body.filter(Boolean) : a.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const lh = fs * 1.35;
  const pad = fs * 0.55;
  const tw = Math.max(fs * 2, ...[...head, ...body].map((l) => textWidth(l, fs)));
  const headH = head.length ? head.length * lh + pad * 2 : 0;
  const bodyH = body.length ? body.length * lh + pad * 2 : 0;
  return { fs, lh, pad, head, body, w: tw + pad * 2, headH, bodyH, h: headH + bodyH };
}

function symSize(k: SymKind, u: number, z: number): [number, number] {
  const s = Math.max(8, u * SYM_U * z);
  if (k === 'charger') return [s * 0.8, s * 1.3];
  if (k === 'pole' || k === 'ipPole') return [s * 1.1, s * 1.1];
  return [s * 1.3, s * 0.85];
}

export function boxOf(a: Annot, w: number, h: number): Box {
  const u = Math.max(w, h);
  const z = a.z ?? 1;
  const r = a.r ?? 0;
  if (a.t === 'num') { const d = 2 * Math.max(8, u * NUM_R * z); return { cx: a.x * w, cy: a.y * h, w: d, h: d, r }; }
  if (a.t === 'sym') { const [bw, bh] = symSize(a.k, u, z); return { cx: a.x * w, cy: a.y * h, w: bw, h: bh, r }; }
  if (a.t === 'text' || a.t === 'label') { const L = textLayout(a, u); return { cx: a.x * w, cy: a.y * h, w: L.w, h: L.h, r }; }
  if (a.t === 'oval' || a.t === 'box') {
    const x1 = Math.min(a.a.x, a.b.x) * w; const x2 = Math.max(a.a.x, a.b.x) * w;
    const y1 = Math.min(a.a.y, a.b.y) * h; const y2 = Math.max(a.a.y, a.b.y) * h;
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1), r };
  }
  const xs = a.pts.map((p) => p.x * w); const ys = a.pts.map((p) => p.y * h);
  const x1 = Math.min(...xs); const x2 = Math.max(...xs); const y1 = Math.min(...ys); const y2 = Math.max(...ys);
  return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1), r: 0 };
}

/* ── 그리기 ──────────────────────────────────────────────────────────────── */

/** 기호 하나 — 가운데(0,0) 기준으로, 부르는 쪽이 옮기고 돌려 둔다 */
function drawSymAt(ctx: Ctx, k: SymKind, bw: number, bh: number, u: number): void {
  ctx.lineJoin = 'miter';
  if (k === 'pole') {
    const r = Math.min(bw, bh) / 2;
    ctx.strokeStyle = SYM_COLOR.pole;
    ctx.lineWidth = Math.max(1.5, r * 0.2);
    for (const rr of [r * 0.88, r * 0.45]) { ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke(); }
    return;
  }
  if (k === 'ipPole') {
    const r = Math.min(bw, bh) / 2 * 0.8;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = SYM_COLOR.ipPole; ctx.fill();
    ctx.lineWidth = Math.max(1, u * 0.0012); ctx.strokeStyle = INK; ctx.stroke();
    return;
  }
  ctx.fillStyle = SYM_COLOR[k];
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.lineWidth = Math.max(1, u * 0.0014);
  ctx.strokeStyle = INK;
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  if (k !== 'charger') {
    ctx.beginPath(); ctx.moveTo(-bw / 2, -bh / 2); ctx.lineTo(bw / 2, bh / 2); ctx.stroke();
  }
}

/** 도구 단추의 기호 그림 — 가운데가 (x, y), 긴 변 u 기준 */
export function drawSym(ctx: Ctx, k: SymKind, x: number, y: number, u: number, z = 1, rot = 0): void {
  const [bw, bh] = symSize(k, u, z);
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate((rot * Math.PI) / 180);
  drawSymAt(ctx, k, bw, bh, u);
  ctx.restore();
}

function drawArrowHead(ctx: Ctx, p: { x: number; y: number }, q: { x: number; y: number }, s: number): void {
  const ang = Math.atan2(p.y - q.y, p.x - q.x);
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(ang) * s * 0.3, p.y + Math.sin(ang) * s * 0.3);
  ctx.lineTo(p.x - Math.cos(ang - 0.42) * s, p.y - Math.sin(ang - 0.42) * s);
  ctx.lineTo(p.x - Math.cos(ang + 0.42) * s, p.y - Math.sin(ang + 0.42) * s);
  ctx.closePath();
  ctx.fill();
}

export function drawAnnots(ctx: Ctx, w: number, h: number, list: Annot[], style: NumStyle = 'red'): void {
  const u = Math.max(w, h);
  const lw = lineWidthOf(u);
  let n = 0;
  ctx.save();
  for (const a of list) {
    ctx.setLineDash([]);
    if (a.t === 'line') {
      if (a.pts.length < 2) continue;
      const k = lineKindOf(a);
      const pts = a.pts.map((p) => ({ x: p.x * w, y: p.y * h }));
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = k === 'dash' ? 'butt' : 'round';
      if (k === 'dash') ctx.setLineDash([lw * 3, lw * 2]);
      ctx.strokeStyle = RED;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (k === 'arrow') { ctx.fillStyle = RED; drawArrowHead(ctx, pts[pts.length - 1], pts[pts.length - 2], Math.max(8, lw * 3.6)); }
      continue;
    }
    const b = boxOf(a, w, h);
    ctx.save();
    ctx.translate(b.cx, b.cy);
    if (b.r) ctx.rotate((b.r * Math.PI) / 180);
    if (a.t === 'num') {
      n += 1;
      const r = b.w / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(r * 1.15)}px ${FONT}`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      if (style === 'yellow') {
        ctx.fillStyle = '#ffff00'; ctx.fill();
        ctx.lineWidth = Math.max(1.5, r * 0.08); ctx.strokeStyle = '#1f2937'; ctx.stroke();
        ctx.fillStyle = INK;
        ctx.fillText(String(n), 0, r * 0.04);
      } else {
        // 속을 노랑으로 채운다 — 빈 속은 사진(특히 어두운 지하주차장)에 묻혔다(한백 「안에 배경 채워줘 노랑색으로」 2026-10-02)
        ctx.fillStyle = '#ffff00'; ctx.fill();
        ctx.lineWidth = Math.max(2, r * 0.14); ctx.strokeStyle = RED; ctx.stroke();
        ctx.fillStyle = RED;
        ctx.fillText(String(n), 0, r * 0.04);
      }
    } else if (a.t === 'sym') {
      drawSymAt(ctx, a.k, b.w, b.h, u);
    } else if (a.t === 'oval') {
      ctx.lineWidth = lw; ctx.strokeStyle = RED;
      ctx.beginPath(); ctx.ellipse(0, 0, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (a.t === 'box') {
      // 네모는 노랑 — 제출본들이 차단기를 노란 상자로 짚었다
      ctx.lineWidth = lw; ctx.strokeStyle = YELLOW;
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    } else {
      const L = textLayout(a, u);
      const left = -L.w / 2; let top = -L.h / 2;
      ctx.lineWidth = Math.max(1, u * 0.0012);
      ctx.strokeStyle = INK;
      ctx.font = `800 ${Math.round(L.fs)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 위 칸(빨강)·아래 칸(검정)이 상자 둘이다 — 제출본 도면의 라벨도 상자 둘을 붙여 놓았다
      for (const [lines, hh, color] of [[L.head, L.headH, RED], [L.body, L.bodyH, INK]] as const) {
        if (!lines.length) continue;
        ctx.fillStyle = '#fff'; ctx.fillRect(left, top, L.w, hh); ctx.strokeRect(left, top, L.w, hh);
        ctx.fillStyle = color;
        lines.forEach((l, i) => ctx.fillText(l, 0, top + L.pad + L.lh * (i + 0.5)));
        top += hh;
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

/* ── 조작 ────────────────────────────────────────────────────────────────── */

/**
 * 표시들이 차지한 범위(비율 0~1) — 사진을 칸 모양으로 자를 때 이 범위를 남긴다. 표시가 없으면 null.
 * 크기가 있는 표시라 상자로 잰다(돌린 상자는 바깥으로 넉넉히).
 */
export function annotBounds(list: Annot[], w = 1600, h = 1200): { x0: number; y0: number; x1: number; y1: number } | null {
  if (list.length === 0) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const a of list) {
    const b = boxOf(a, w, h);
    const e = b.r ? Math.hypot(b.w, b.h) / 2 : 0;
    const hw = e || b.w / 2; const hh = e || b.h / 2;
    x0 = Math.min(x0, (b.cx - hw) / w); x1 = Math.max(x1, (b.cx + hw) / w);
    y0 = Math.min(y0, (b.cy - hh) / h); y1 = Math.max(y1, (b.cy + hh) / h);
  }
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const pad = 0.02;
  return { x0: c(x0 - pad), y0: c(y0 - pad), x1: c(x1 + pad), y1: c(y1 + pad) };
}

/** 픽셀 점을 상자의 자기 축(회전을 푼)으로 */
export function toLocal(b: Box, px: number, py: number): { x: number; y: number } {
  const t = (-b.r * Math.PI) / 180;
  const dx = px - b.cx; const dy = py - b.cy;
  return { x: dx * Math.cos(t) - dy * Math.sin(t), y: dx * Math.sin(t) + dy * Math.cos(t) };
}

/** 누른 자리(픽셀)의 표시 — 위에 그린 것부터. 없으면 -1 */
export function hitAnnot(list: Annot[], px: number, py: number, w: number, h: number): number {
  const u = Math.max(w, h);
  const tol = Math.max(6, u * 0.008);
  const segD = (p: Pt, a: Pt, b: Pt) => {
    const L = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  };
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.t === 'line') {
      const pts = a.pts.map((p) => ({ x: p.x * w, y: p.y * h }));
      for (let k = 1; k < pts.length; k++) if (segD({ x: px, y: py }, pts[k - 1], pts[k]) < tol) return i;
      continue;
    }
    const b = boxOf(a, w, h);
    const l = toLocal(b, px, py);
    const inside = Math.abs(l.x) <= b.w / 2 + tol && Math.abs(l.y) <= b.h / 2 + tol;
    // 동그라미·네모는 테두리만 잡는다 — 속을 누르면 그 안의 다른 표시를 고를 수 있게
    if ((a.t === 'oval' || a.t === 'box') && inside) {
      const edge = Math.abs(l.x) >= b.w / 2 - tol * 2 || Math.abs(l.y) >= b.h / 2 - tol * 2
        || (a.t === 'oval' && Math.abs(Math.hypot(l.x / (b.w / 2), l.y / (b.h / 2)) - 1) < (tol * 2) / Math.min(b.w, b.h) * 2);
      if (edge) return i;
      continue;
    }
    if (inside) return i;
  }
  return -1;
}

/** 표시를 통째로 옮긴다(dx·dy 는 비율) — 선·동그라미·네모는 점마다 같이 민다 */
export function moveAnnot(a: Annot, dx: number, dy: number): Annot {
  /*
   * 점이 여럿인 것(선·네모)은 ★옮길 거리를 줄여★ 모양을 지킨다 — 점마다 사진 끝에서 자르면 끝에 닿은 점만 멈춰
   * 선이 꺾이고 네모가 찌그러졌다. 점 하나인 것은 그 점만 사진 안에 둔다.
   */
  const pts = a.t === 'line' ? a.pts : a.t === 'oval' || a.t === 'box' ? [a.a, a.b] : [a];
  const fit = (d: number, vs: number[]) => Math.min(Math.max(d, -Math.min(...vs)), 1 - Math.max(...vs));
  const fx = fit(dx, pts.map((p) => p.x)); const fy = fit(dy, pts.map((p) => p.y));
  const m = (p: Pt): Pt => ({ x: p.x + fx, y: p.y + fy });
  if (a.t === 'line') return { ...a, pts: a.pts.map(m) };
  if (a.t === 'oval' || a.t === 'box') return { ...a, a: m(a.a), b: m(a.b) };
  return { ...a, ...m(a) };
}

/**
 * 모서리를 끌어 크기를 바꾼다 — 원래 표시(orig)와 끈 모서리(sx·sy = ±1)·지금 손 자리(픽셀)로 새 표시.
 *   번호·기호·글자·라벨  가운데에서 손까지의 거리 비율로 고르게 키운다(z)
 *   동그라미·네모        맞은편 모서리를 붙박고 그 사이로(돌린 채로도)
 *   선                  상자의 맞은편 모서리를 붙박고 점들을 늘린다
 */
export function resizeAnnot(orig: Annot, sx: number, sy: number, px: number, py: number, w: number, h: number): Annot {
  const b = boxOf(orig, w, h);
  if (orig.t === 'num' || orig.t === 'sym' || orig.t === 'text' || orig.t === 'label') {
    const d0 = Math.hypot(b.w / 2, b.h / 2) || 1;
    const l = toLocal(b, px, py);
    const d1 = Math.max(4, Math.hypot(l.x, l.y));
    return { ...orig, z: Math.min(8, Math.max(0.2, (orig.z ?? 1) * (d1 / d0))) };
  }
  if (orig.t === 'oval' || orig.t === 'box') {
    const l = toLocal(b, px, py);
    // 맞은편 모서리(자기 축) → 손 자리 사이가 새 상자
    const ox = -sx * b.w / 2; const oy = -sy * b.h / 2;
    const nx1 = Math.min(ox, l.x); const nx2 = Math.max(ox, l.x);
    const ny1 = Math.min(oy, l.y); const ny2 = Math.max(oy, l.y);
    const nw = Math.max(4, nx2 - nx1); const nh = Math.max(4, ny2 - ny1);
    const lc = { x: (nx1 + nx2) / 2, y: (ny1 + ny2) / 2 };
    const t = (b.r * Math.PI) / 180;
    const cx = b.cx + lc.x * Math.cos(t) - lc.y * Math.sin(t);
    const cy = b.cy + lc.x * Math.sin(t) + lc.y * Math.cos(t);
    return { ...orig, a: { x: (cx - nw / 2) / w, y: (cy - nh / 2) / h }, b: { x: (cx + nw / 2) / w, y: (cy + nh / 2) / h } };
  }
  // 선 — 상자의 맞은편 모서리를 붙박고 비율로
  const fx = b.cx - sx * b.w / 2; const fy = b.cy - sy * b.h / 2;
  const kx = b.w > 1 ? (px - fx) / (b.cx + sx * b.w / 2 - fx) : 1;
  const ky = b.h > 1 ? (py - fy) / (b.cy + sy * b.h / 2 - fy) : 1;
  return { ...orig, pts: orig.pts.map((p) => ({ x: (fx + (p.x * w - fx) * kx) / w, y: (fy + (p.y * h - fy) * ky) / h })) };
}

/** 회전 — 꼭지를 끈 만큼(도, 원래에서 더한 값). 선은 가운데를 축으로 점을 돌린다. 15° 근처면 붙는다 */
export function rotateAnnot(orig: Annot, delta: number, w: number, h: number): Annot {
  const snap = (d: number) => (Math.abs(d - Math.round(d / 15) * 15) < 4 ? Math.round(d / 15) * 15 : d);
  if (orig.t !== 'line') {
    const r = ((snap((orig.r ?? 0) + delta) % 360) + 360) % 360;
    return { ...orig, r };
  }
  const b = boxOf(orig, w, h);
  const t = (snap(delta) * Math.PI) / 180;
  return {
    ...orig,
    pts: orig.pts.map((p) => {
      const dx = p.x * w - b.cx; const dy = p.y * h - b.cy;
      return { x: (b.cx + dx * Math.cos(t) - dy * Math.sin(t)) / w, y: (b.cy + dx * Math.sin(t) + dy * Math.cos(t)) / h };
    }),
  };
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

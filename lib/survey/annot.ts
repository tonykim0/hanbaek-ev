/**
 * 사진 위 표시 — 번호 · 경로 선(화살표) · 동그라미 · 네모 · 글자 (한백 지시 2026-10-01).
 *
 * 실사보고서 제출본들은 사진 위에 엑셀 도형으로 이것들을 얹어 냈다(프로덕션 제출본 실측):
 *   설치예정 위치   주차면 위 번호 원 — 몇 번째 충전기가 어디에 서는지
 *   인입라인 사진   케이블 트레이를 따라 빨간 선과 끝 화살표 — 전력이 어디로 들어오는지
 *   도면 확대도     빨간 경로 선 + 「기존 한전전주」·「IP전주 신설」 같은 글자 상자
 *   인입점 사진     전주를 두른 빨간 타원 · 분전반 내부의 차단기를 짚은 노란 상자
 * 여기서 그리면 서식에 넣을 때 사진에 합쳐 굽는다 — 받은 파일을 다시 열어 도형을 얹을 일이 없다.
 *
 * ★번호 모양은 서식마다 다르다★ (내 컴퓨터의 제출본 2026년분 실측, 한백 지시 「학습해볼래」 2026-10-01):
 *   red     빨간 테두리 · 빈 속 · 빨간 숫자 — 플러그링크 엑셀(84곳 중 81곳) · 현대엔지니어링 별지
 *   yellow  노란 속 · 검은 숫자 — SK·나이스 사진 대장(101건 전부)
 * 그래서 그리는 쪽이 모양을 받는다(NumStyle). 고르는 자리는 서식 하나다(lib/survey/spec markStyleOf).
 *
 * 충전기(charger)는 도면의 범례다 — 플러그링크 도면 시트가 「충전기」 자리를 하늘색 네모로 찍는다
 * (서식 범례 · 제출본 도면에 3,874개). 번호와 달리 세지 않는다.
 *
 * ★좌표는 사진의 가로·세로에 대한 비율(0~1)이다★ — 화면 크기와 상관없이 같은 자리다.
 * ★굵기·크기는 사진의 긴 변에 비례한다★ — 미리보기(작은 캔버스)와 구운 사진(1600px)이 같은
 * 함수(drawAnnots)를 쓰므로 화면에서 본 모양이 받은 파일의 모양이다.
 */

export interface Pt { x: number; y: number }

export type Annot =
  | { t: 'num'; x: number; y: number }
  | { t: 'line'; pts: Pt[] }
  | { t: 'oval'; a: Pt; b: Pt }
  | { t: 'box'; a: Pt; b: Pt }
  | { t: 'text'; x: number; y: number; text: string }
  | { t: 'charger'; x: number; y: number };

/** 번호 모양 — 위 머리말 */
export type NumStyle = 'red' | 'yellow';

const RED = '#e11d2a';
const YELLOW = '#facc15';
/** 충전기 범례의 하늘색(서식 「3. 도면」 범례 그대로) */
const CHARGER = '#00b0f0';

/** 번호 원의 반지름(긴 변 비율) — 번호 표시를 넣었을 때의 크기를 그대로 둔다 */
const NUM_R = 0.026;

export const numCount = (list: Annot[]) => list.filter((a) => a.t === 'num').length;

/** 2D 그리기 — 캔버스(브라우저)와 같은 꼴만 쓴다 */
type Ctx = Pick<CanvasRenderingContext2D,
  'beginPath' | 'arc' | 'fill' | 'stroke' | 'moveTo' | 'lineTo' | 'closePath' | 'ellipse' | 'strokeRect'
  | 'fillRect' | 'fillText' | 'strokeText' | 'measureText' | 'save' | 'restore'>
  & { fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern;
    lineWidth: number; lineJoin: CanvasLineJoin; lineCap: CanvasLineCap; font: string;
    textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline };

export function drawAnnots(ctx: Ctx, w: number, h: number, list: Annot[], style: NumStyle = 'red'): void {
  const u = Math.max(w, h);
  const X = (p: Pt) => p.x * w;
  const Y = (p: Pt) => p.y * h;
  let n = 0;
  ctx.save();
  for (const a of list) {
    if (a.t === 'num') {
      n += 1;
      const r = Math.max(14, Math.round(u * NUM_R));
      const x = a.x * w; const y = a.y * h;
      const font = `900 ${Math.round(r * 1.15)}px -apple-system, "Malgun Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font;
      if (style === 'yellow') {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffff00';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, r * 0.08);
        ctx.strokeStyle = '#1f2937';
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.fillText(String(n), x, y + r * 0.04);
      } else {
        // 빈 속이라 사진에 묻히지 않게 흰 테를 먼저 깔고 빨강을 얹는다(어두운 지하주차장 사진)
        const lw = Math.max(3, r * 0.16);
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
    } else if (a.t === 'charger') {
      const sw = Math.max(10, u * 0.022); const sh = sw * 1.5;
      const x = a.x * w; const y = a.y * h;
      ctx.fillStyle = CHARGER;
      ctx.fillRect(x - sw / 2, y - sh / 2, sw, sh);
      ctx.lineWidth = Math.max(1, u * 0.0016);
      ctx.strokeStyle = '#111827';
      ctx.strokeRect(x - sw / 2, y - sh / 2, sw, sh);
    } else if (a.t === 'line' && a.pts.length >= 2) {
      const lw = Math.max(3, u * 0.0065);
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = RED;
      ctx.beginPath();
      ctx.moveTo(X(a.pts[0]), Y(a.pts[0]));
      for (const p of a.pts.slice(1)) ctx.lineTo(X(p), Y(p));
      ctx.stroke();
      // 끝 화살표 — 마지막 마디의 방향으로
      const p = a.pts[a.pts.length - 1];
      const q = a.pts[a.pts.length - 2];
      const ang = Math.atan2(Y(p) - Y(q), X(p) - X(q));
      const s = Math.max(12, u * 0.024);
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.moveTo(X(p) + Math.cos(ang) * s * 0.35, Y(p) + Math.sin(ang) * s * 0.35);
      ctx.lineTo(X(p) - Math.cos(ang - 0.45) * s, Y(p) - Math.sin(ang - 0.45) * s);
      ctx.lineTo(X(p) - Math.cos(ang + 0.45) * s, Y(p) - Math.sin(ang + 0.45) * s);
      ctx.closePath();
      ctx.fill();
    } else if (a.t === 'oval' || a.t === 'box') {
      const x1 = Math.min(X(a.a), X(a.b)); const x2 = Math.max(X(a.a), X(a.b));
      const y1 = Math.min(Y(a.a), Y(a.b)); const y2 = Math.max(Y(a.a), Y(a.b));
      ctx.lineWidth = Math.max(3, u * 0.0055);
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
      const fs = Math.max(12, Math.round(u * 0.026));
      ctx.font = `800 ${fs}px -apple-system, "Malgun Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(a.text).width;
      const pad = fs * 0.45;
      const x = a.x * w; const y = a.y * h;
      // 노란 바탕 · 검은 글자 — 사진 위 어디에 두어도 읽힌다
      ctx.fillStyle = YELLOW;
      ctx.fillRect(x - tw / 2 - pad, y - fs / 2 - pad * 0.6, tw + pad * 2, fs + pad * 1.2);
      ctx.fillStyle = '#111827';
      ctx.fillText(a.text, x, y);
    }
  }
  ctx.restore();
}

/**
 * 표시들이 차지한 범위(비율 0~1) — 사진을 칸 모양으로 자를 때 이 범위를 남긴다. 표시가 없으면 null.
 * 번호 원·글자 상자는 점이 아니라 크기가 있어 둘레를 조금 더 잡는다.
 */
export function annotBounds(list: Annot[]): { x0: number; y0: number; x1: number; y1: number } | null {
  const xs: number[] = []; const ys: number[] = [];
  const add = (p: Pt) => { xs.push(p.x); ys.push(p.y); };
  for (const a of list) {
    if (a.t === 'line') a.pts.forEach(add);
    else if (a.t === 'oval' || a.t === 'box') { add(a.a); add(a.b); }
    else add(a);
  }
  if (xs.length === 0) return null;
  const pad = 0.05;
  const c = (v: number) => Math.min(1, Math.max(0, v));
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
    if ((a.t === 'num' || a.t === 'charger') && d(a, p) < NUM_R * 1.4) return i;
    if (a.t === 'text' && d(a, p) < 0.06) return i;
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

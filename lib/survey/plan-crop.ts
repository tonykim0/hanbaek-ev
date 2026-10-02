/**
 * 전체 도면 → 거점별 도면 확대도 — 자를 틀을 찾고, 그림을 자르고, 그 안의 표시를 옮긴다.
 *
 * 한백 2026-10-02 「전체 도면에서 거점라벨을 붙이면 알아서 식별해서 그만큼 거점을 추가하고 그 거점에 대한
 * 확대화면을 거점별 도면확대도에」. 제출본의 사진대지 첫 칸 「도면 확대도」는 전체 평면도에서 그 거점 자리를
 * 잘라 키운 것이다(같은 기호·배선·라벨이 그대로 보인다).
 *
 * ★틀은 거점 라벨에서 찾는다★(autoCrops) — 표시마다 가장 가까운 거점 라벨의 것으로 보고, 거점마다 그 표시들을
 * 감싸는 칸 모양(3:2) 틀을 잡는다. 어느 라벨에서도 먼 표시(여러 거점이 같이 쓰는 기존 분전반 같은 것)는
 * 어느 거점의 틀도 늘리지 않는다 — 넣으면 틀이 도면 전체가 된다. 틀은 사람이 고칠 수 있다(PlanCrop).
 *
 * 표시의 자리는 비율 좌표라 자른 틀 기준으로 다시 잰다. ★크기는 같이 커진다★ — 표시 크기는 사진 긴 변에
 * 비례하므로(annot) 그대로 두면 잘린 그림에서 원래보다 작아진다 → 크기(z)에 (원래 긴 변 / 자른 긴 변)을 곱한다.
 */
import { annotBounds, boxOf, type Annot, type Pt } from './annot';

export interface CropRect { x: number; y: number; w: number; h: number }

/** 사진대지 도면 확대도 칸(A6:L28)의 가로/세로 — 열 12칸 × 행 23줄 */
export const ZOOM_ASPECT = 1.5;

/** 라벨에서 이보다 먼 표시는 그 거점 것으로 보지 않는다(도면 긴 변 비율) */
const REACH = 0.3;
/** 표시 둘레 여백 · 틀의 가장 작은 긴 변(도면 긴 변 비율) — 너무 바짝 자르면 흐리고 어디인지 모른다 */
const PAD = 0.04;
const MIN_LONG = 0.25;

/**
 * 거점 번호 → 자를 틀(비율). 라벨이 없는 거점은 없다. [순수]
 *
 * @param W·H 도면 그림의 픽셀 크기 — 표시 크기가 긴 변에 비례해서 필요하다
 */
export function autoCrops(marks: Annot[], W: number, H: number, aspect = ZOOM_ASPECT): Map<number, CropRect> {
  const out = new Map<number, CropRect>();
  const u = Math.max(W, H);
  const anchors = marks.flatMap((a) => (a.t === 'label' && a.spot ? [{ n: a.spot, x: a.x * W, y: a.y * H }] : []));
  if (anchors.length === 0 || W <= 0 || H <= 0) return out;

  const nearest = (px: number, py: number): number | null => {
    let best: number | null = null;
    let d = Infinity;
    for (const a of anchors) {
      const e = Math.hypot(a.x - px, a.y - py);
      if (e < d) { d = e; best = a.n; }
    }
    return d <= u * REACH ? best : null;
  };
  const groups = new Map<number, Annot[]>();
  const add = (n: number, a: Annot) => groups.set(n, [...(groups.get(n) ?? []), a]);
  for (const a of marks) {
    if (a.t === 'label') { if (a.spot) add(a.spot, a); continue; }
    if (a.t === 'line') {
      // 점마다 — 두 거점에 걸친 배선은 각 거점이 제 쪽 점만 감싼다
      const by = new Map<number, Pt[]>();
      for (const p of a.pts) {
        const n = nearest(p.x * W, p.y * H);
        if (n !== null) by.set(n, [...(by.get(n) ?? []), p]);
      }
      for (const [n, pts] of by) add(n, { ...a, pts });
      continue;
    }
    const b = boxOf(a, W, H);
    const n = nearest(b.cx, b.cy);
    if (n !== null) add(n, a);
  }

  for (const [n, list] of groups) {
    const bb = annotBounds(list, W, H);
    if (!bb) continue;
    const pad = u * PAD;
    const x0 = bb.x0 * W - pad; const x1 = bb.x1 * W + pad;
    const y0 = bb.y0 * H - pad; const y1 = bb.y1 * H + pad;
    let w = x1 - x0; let h = y1 - y0;
    // 칸 모양으로 넓히고, 너무 작으면 키우고, 그림보다 크면 줄인다
    if (w / h < aspect) w = h * aspect; else h = w / aspect;
    if (Math.max(w, h) < u * MIN_LONG) { const k = (u * MIN_LONG) / Math.max(w, h); w *= k; h *= k; }
    if (w > W) { w = W; h = w / aspect; }
    if (h > H) { h = H; w = h * aspect; }
    const x = Math.min(Math.max(0, (x0 + x1) / 2 - w / 2), W - w);
    const y = Math.min(Math.max(0, (y0 + y1) / 2 - h / 2), H - h);
    out.set(n, { x: x / W, y: y / H, w: w / W, h: h / H });
  }
  return out;
}

/** 틀 안에 서는 표시만 — 자리를 틀 기준으로, 크기를 키워서 [순수] */
export function cropMarks(marks: Annot[], r: CropRect, fullW: number, fullH: number): Annot[] {
  const grow = Math.max(fullW, fullH) / Math.max(r.w * fullW, r.h * fullH);
  const m = (p: Pt) => ({ x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h });
  const inside = (p: Pt) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const out: Annot[] = [];
  for (const a of marks) {
    if (a.t === 'line') {
      if (a.pts.some(inside)) out.push({ ...a, pts: a.pts.map(m) });
    } else if (a.t === 'oval' || a.t === 'box') {
      if (inside({ x: (a.a.x + a.b.x) / 2, y: (a.a.y + a.b.y) / 2 })) out.push({ ...a, a: m(a.a), b: m(a.b) });
    } else if (inside(a)) {
      out.push({ ...a, ...m(a), z: (a.z ?? 1) * grow });
    }
  }
  return out;
}

/** 그림 크기 — 방향을 바로 한 뒤 [브라우저 전용] */
export async function imageSize(file: File): Promise<{ w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const out = { w: bmp.width, h: bmp.height };
  bmp.close?.();
  return out;
}

/** 그림 자르기 — 방향을 바로 하고, 긴 변 2400px 안으로 [브라우저 전용] */
export async function cropImage(file: File, r: CropRect, name: string): Promise<{ file: File; fullW: number; fullH: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sx = r.x * bmp.width; const sy = r.y * bmp.height;
  const sw = r.w * bmp.width; const sh = r.h * bmp.height;
  const k = Math.min(1, 2400 / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('그림을 자를 수 없습니다 — 다른 브라우저에서 다시 해주세요.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const out = { fullW: bmp.width, fullH: bmp.height };
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.92));
  if (!blob) throw new Error('그림을 자르지 못했습니다.');
  return { file: new File([blob], name, { type: 'image/jpeg' }), ...out };
}

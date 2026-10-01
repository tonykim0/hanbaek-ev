/**
 * 전체 도면 → 거점 도면(도면 확대도) — 그림을 자르고 그 안의 표시를 옮긴다 (components/survey/PlanCrop).
 *
 * 표시의 자리는 비율 좌표라 자른 틀 기준으로 다시 잰다. ★크기는 같이 커진다★ — 표시 크기는 사진 긴 변에
 * 비례하므로(annot) 그대로 두면 잘린 그림에서 원래보다 작아진다. 도면 확대도는 「잘라서 키운 것」이라
 * 기호·라벨도 같은 비율로 커져야 한다 → 크기(z)에 (원래 긴 변 / 자른 긴 변)을 곱한다.
 */
import type { Annot } from './annot';

export interface CropRect { x: number; y: number; w: number; h: number }

/** 틀 안에 서는 표시만 — 자리를 틀 기준으로, 크기를 키워서 [순수] */
export function cropMarks(marks: Annot[], r: CropRect, fullW: number, fullH: number): Annot[] {
  const grow = Math.max(fullW, fullH) / Math.max(r.w * fullW, r.h * fullH);
  const m = (p: { x: number; y: number }) => ({ x: (p.x - r.x) / r.w, y: (p.y - r.y) / r.h });
  const inside = (p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
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

/**
 * 제안서의 현장 사진 — 항공사진 위에 고른 지붕의 패널을 그린다(가배치 그림). [브라우저]
 *
 * 에너닷 · 루모라 · 타이런트 제안서 모두 「위성지도 기준 가배치」 그림이 현장 쪽의 얼굴이다. 부지 검토의 AI 배치(lib/solar/layout)가
 * 이미 패널 하나하나의 네 꼭짓점(경위도)을 갖고 있어 그것을 그대로 그린다 — 지도 화면의 패널과 같은 것이 제안서에 실린다.
 * 사진은 한 번 받고(/api/solar/aerial — 키는 서버에) 틀의 자리마다 그 비율로 잘라 쓴다: 고른 지붕 둘레에 여백을 두고 가운데 맞춘다.
 */
import type { LngLat } from '@/lib/solar/geo';
import { toWorldPx } from '@/lib/solar/mercator';
import type { SiteImage } from '@/lib/solar/proposal/fill-common';

/** 받아 올 사진의 둘레 — 지붕 둘레의 두 배 정사각(자리 비율이 0.6~1.7 이어도 잘라 낼 수 있게), 적어도 한 변 80m */
const SPAN_TIMES = 2;
const MIN_SPAN_M = 80;
/** 지붕 둘레 밖으로 남기는 여백(배) */
const MARGIN = 1.3;
const OUT_W = 1600;

const M_PER_DEG_LAT = 111_320;

export type SiteImager = (aspect: number, withPanels: boolean) => Promise<SiteImage>;

/**
 * @param quads  고른 지붕의 패널 — 하나에 네 꼭짓점
 * @param extent 고른 지붕의 꼭짓점 — 사진을 어디에 맞출지
 */
export async function siteImager(quads: LngLat[][], extent: LngLat[]): Promise<SiteImager> {
  if (!extent.length) throw new Error('고른 지붕이 없습니다.');
  const lngs = extent.map((p) => p[0]);
  const lats = extent.map((p) => p[1]);
  const [w0, e0, s0, n0] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
  const cLng = (w0 + e0) / 2;
  const cLat = (s0 + n0) / 2;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((cLat * Math.PI) / 180);
  const spanM = Math.max(MIN_SPAN_M, Math.max((e0 - w0) * mPerDegLng, (n0 - s0) * M_PER_DEG_LAT) * SPAN_TIMES);
  const halfLng = spanM / 2 / mPerDegLng;
  const halfLat = spanM / 2 / M_PER_DEG_LAT;
  const bbox = [cLng - halfLng, cLat - halfLat, cLng + halfLng, cLat + halfLat].map((v) => v.toFixed(7)).join(',');

  const res = await fetch(`/api/solar/aerial?bbox=${bbox}&px=2000`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `항공사진을 받지 못했습니다 (${res.status})`);
  }
  const z = Number(res.headers.get('X-Aerial-Z'));
  const ox = Number(res.headers.get('X-Aerial-Origin-X'));
  const oy = Number(res.headers.get('X-Aerial-Origin-Y'));
  const photo = await createImageBitmap(await res.blob());
  const px = (p: LngLat): [number, number] => {
    const [x, y] = toWorldPx(p, z);
    return [x - ox, y - oy];
  };
  const pts = extent.map(px);
  const [bx0, bx1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const [by0, by1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const quadPx = quads.map((q) => q.map(px));

  return async (aspect, withPanels) => {
    // 자를 창 — 지붕 둘레 × 여백을 담는 가장 작은 그 비율의 창, 사진 밖으로 나가면 안으로 민다
    let cw = Math.max((bx1 - bx0) * MARGIN, (by1 - by0) * MARGIN * aspect, 200);
    let ch = cw / aspect;
    if (cw > photo.width) [cw, ch] = [photo.width, photo.width / aspect];
    if (ch > photo.height) [cw, ch] = [photo.height * aspect, photo.height];
    const cx = Math.min(Math.max((bx0 + bx1) / 2 - cw / 2, 0), photo.width - cw);
    const cy = Math.min(Math.max((by0 + by1) / 2 - ch / 2, 0), photo.height - ch);
    const outW = OUT_W;
    const outH = Math.round(OUT_W / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('그림판을 열지 못했습니다.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, cx, cy, cw, ch, 0, 0, outW, outH);
    if (withPanels) {
      const s = outW / cw;
      ctx.fillStyle = 'rgba(23, 47, 112, 0.95)';
      ctx.strokeStyle = 'rgba(191, 219, 254, 0.85)';
      ctx.lineWidth = Math.max(0.5, Math.min(1.5, s * 0.2));
      for (const q of quadPx) {
        ctx.beginPath();
        q.forEach(([x, y], i) => (i ? ctx.lineTo((x - cx) * s, (y - cy) * s) : ctx.moveTo((x - cx) * s, (y - cy) * s)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.88));
    if (!blob) throw new Error('그림을 굽지 못했습니다.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: outW, height: outH };
  };
}

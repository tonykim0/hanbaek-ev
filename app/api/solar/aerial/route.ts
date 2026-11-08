/**
 * GET /api/solar/aerial?bbox=서,남,동,북 — 그 둘레의 항공사진 한 장(JPEG). 태양광 제안서의 가배치 그림 바탕이다(2026-11-06).
 *
 * VWorld 항공영상 타일을 이어 붙인다(lib/solar/sources/aerial — AI 지붕 찾기와 같은 길). 키는 서버에만 있다 — 브라우저가 받아
 * 패널을 그려 얹는다(components/solar/proposal-image). 사진의 자리(확대 단계 · 왼쪽 위 픽셀)는 머리에 실어 보낸다:
 *   X-Aerial-Z · X-Aerial-Origin-X · X-Aerial-Origin-Y — 경위도 → 사진 픽셀은 toWorldPx(점, z) − 원점.
 * 한백의 눈(관리자 · 열람 전용)만 — 제안서를 짓는 사람이다. 바깥 자료의 하루 한도가 걸려 있어 둘레는 3km 안으로 막는다.
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { aerialOf } from '@/lib/solar/sources/aerial';
import { hasVworld } from '@/lib/solar/sources/vworld';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
/** 둘레 한 변의 한도(도) — 위도 37° 에서 약 3km */
const MAX_SPAN_DEG = 0.03;

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return fail('로그인이 필요합니다.', 401);
  if (!isHanbaek(session.role)) return fail('제안서는 한백만 만듭니다.', 403);
  const params = new URL(req.url).searchParams;
  const bbox = (params.get('bbox') ?? '').split(',').map(Number);
  if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) return fail('둘레(bbox)가 이상합니다.', 400);
  const [w, s, e, n] = bbox;
  if (!(w < e && s < n) || e - w > MAX_SPAN_DEG || n - s > MAX_SPAN_DEG) return fail('둘레가 너무 크거나 뒤집혔습니다.', 400);
  const px = Math.min(2400, Math.max(400, Number(params.get('px')) || 1600));
  if (!hasVworld()) return fail('항공사진 키(VWORLD_KEY)가 아직 없습니다.', 503);
  try {
    const a = await aerialOf([w, s, e, n], [], { marginM: 0, maxPx: px });
    return new NextResponse(new Uint8Array(a.jpeg), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=600',
        'X-Aerial-Z': String(a.z),
        'X-Aerial-Origin-X': String(a.originX),
        'X-Aerial-Origin-Y': String(a.originY),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[solar-aerial] 항공사진', bbox.join(','), msg);
    return fail(`항공사진을 받지 못했습니다 — ${msg}`, 502);
  }
}

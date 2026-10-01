/**
 * POST /api/survey/read-plate — 실사 사진에서 판넬명·전주번호·메인차단기를 읽는다 { image(base64), mediaType }
 *
 * 우리 DB 에 아무것도 쓰지 않는다(읽어서 돌려줄 뿐 — 칸을 채우는 것은 화면이다). 실사보고서 작성처럼
 * 로그인한 누구나(열람 전용 포함) 쓴다. 판독 비용이 나가므로 로그인 없이는 안 연다.
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { readPlate } from '@/lib/survey/read-plate';

export const maxDuration = 60;
/** 화면이 긴 변 1600px JPEG 로 줄여 보낸다 — 그보다 크면 줄이지 않고 보낸 것이다 */
const MAX_BASE64 = 4 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { image?: unknown; mediaType?: unknown } | null;
  const type = TYPES.find((t) => t === body?.mediaType);
  if (typeof body?.image !== 'string' || !type) return NextResponse.json({ error: '사진이 없습니다.' }, { status: 400 });
  if (body.image.length > MAX_BASE64) return NextResponse.json({ error: '사진이 너무 큽니다.' }, { status: 413 });
  try {
    return NextResponse.json(await readPlate({ data: body.image, mediaType: type }));
  } catch (err) {
    console.error('[survey-plate] 판독 실패', err);
    return NextResponse.json({ error: '사진의 글자를 읽지 못했습니다.' }, { status: 502 });
  }
}

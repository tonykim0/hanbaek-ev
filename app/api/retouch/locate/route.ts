/**
 * POST /api/retouch/locate — 스캔본에서 고칠 문구의 자리를 찾는다 { prompt, pages: [{ image(base64 JPEG), width, height }] }
 * [한백 관리자]
 *
 * 우리 DB 에 아무것도 쓰지 않는다 — 찾은 자리를 돌려줄 뿐이고, 지우고 다시 쓰는 일은 화면이 한다. 받은 PDF 를
 * 감사 기록에 남기는 것은 /api/retouch/log 다. 공문서로 보이면 422 로 멈춘다(lib/retouch/locate).
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { Declined, IssuedDocument, locateEdits } from '@/lib/retouch/locate';
import type { LocatePage } from '@/lib/retouch/types';

export const maxDuration = 120;
/* Vercel 요청 본문 한도(4.5MB) 안 — 화면이 넘치면 그림을 더 줄여 보낸다 */
const MAX_BASE64 = 4_000_000;
const MAX_PAGES = 12;

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: '서류 문구 수정은 한백 관리자만 쓸 수 있습니다.' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown; pages?: unknown } | null;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return NextResponse.json({ error: '무엇을 고칠지 적어주세요.' }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: '요청이 너무 깁니다.' }, { status: 400 });
  const pages = Array.isArray(body?.pages) ? (body.pages as Array<Record<string, unknown>>) : [];
  if (pages.length === 0) return NextResponse.json({ error: '서류가 없습니다.' }, { status: 400 });
  if (pages.length > MAX_PAGES) return NextResponse.json({ error: `한 번에 ${MAX_PAGES}쪽까지 봅니다.` }, { status: 400 });
  const clean: LocatePage[] = [];
  let size = 0;
  for (const p of pages) {
    const w = Number(p.width), h = Number(p.height);
    if (typeof p.image !== 'string' || !(w > 0) || !(h > 0)) return NextResponse.json({ error: '쪽 그림이 잘못됐습니다.' }, { status: 400 });
    size += p.image.length;
    clean.push({ image: p.image, width: Math.round(w), height: Math.round(h) });
  }
  if (size > MAX_BASE64) return NextResponse.json({ error: '서류가 너무 큽니다.' }, { status: 413 });

  try {
    return NextResponse.json(await locateEdits(clean, prompt));
  } catch (err) {
    if (err instanceof IssuedDocument || err instanceof Declined) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[retouch] 판독 실패', err);
    return NextResponse.json({ error: '고칠 자리를 찾지 못했습니다 — 다시 눌러 주세요.' }, { status: 502 });
  }
}

import { NextResponse } from 'next/server';
import { solarGate } from '@/lib/solar/api-gate';
import { modeOf, pickedOf } from '@/lib/solar/check-query';
import { InputError, runCheck } from '@/lib/solar/run';

/** GET /api/solar/check?q=&mode= — 주소 하나를 검토한다(필지 · 건물 · 용도지역 · 계통 · 조례). DB 에 쓰지 않는다 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const { denied } = await solarGate();
  if (denied) return denied;
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const mode = modeOf(url.searchParams);
  if (q.length < 2) return NextResponse.json({ error: '주소를 넣어 주세요.' }, { status: 400 });
  // 여러 필지를 한 부지로 늘어놓으면 길어진다(lib/solar/parcels — 열 필지까지)
  if (q.length > 500) return NextResponse.json({ error: '주소가 너무 깁니다.' }, { status: 400 });

  // 자동완성에서 고른 후보 — 좌표가 있으면 그 자리로 본다
  const picked = pickedOf(url.searchParams);

  try {
    return NextResponse.json(await runCheck(q, mode, picked));
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[solar-check]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `검토하지 못했습니다 — ${msg}` }, { status: 502 });
  }
}

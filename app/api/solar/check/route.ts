import { NextResponse } from 'next/server';
import { solarGate } from '@/lib/solar/api-gate';
import { InputError, runCheck } from '@/lib/solar/run';
import type { Mode, Suggestion } from '@/lib/solar/types';

/** GET /api/solar/check?q=&mode= — 주소 하나를 검토한다(필지 · 건물 · 용도지역 · 계통 · 조례). DB 에 쓰지 않는다 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const { denied } = await solarGate();
  if (denied) return denied;
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const mode: Mode = url.searchParams.get('mode') === 'ground' ? 'ground' : 'roof';
  if (q.length < 2) return NextResponse.json({ error: '주소를 넣어 주세요.' }, { status: 400 });
  if (q.length > 200) return NextResponse.json({ error: '주소가 너무 깁니다.' }, { status: 400 });

  // 자동완성에서 고른 후보 — 좌표가 있으면 그 자리로 본다
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const picked: Suggestion | null =
    Number.isFinite(lat) && Number.isFinite(lng) && lat > 33 && lat < 39 && lng > 124 && lng < 132
      ? {
          kind: url.searchParams.get('kind') === 'place' ? 'place' : 'address',
          name: url.searchParams.get('name') || null,
          road: url.searchParams.get('road') || null,
          parcel: url.searchParams.get('parcel') || null,
          category: null,
          lat,
          lng,
        }
      : null;

  try {
    return NextResponse.json(await runCheck(q, mode, picked));
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[solar-check]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `검토하지 못했습니다 — ${msg}` }, { status: 502 });
  }
}

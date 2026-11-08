import { NextResponse } from 'next/server';
import { solarGate } from '@/lib/solar/api-gate';
import { solarApiKey } from '@/lib/solar/api-key';
import { traceRoofs, type Trace } from '@/lib/solar/roof-trace';
import { hasVworld, parcelByPnu } from '@/lib/solar/sources/vworld';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/solar/roofs?pnu= — AI 지붕 따기. 부를 때마다 돈이 든다(사진 한 장 + 판단 — 비용은 [llm] solar-roofs 한 줄).
 * 같은 필지는 하루 동안 기억해 다시 안 부르고, 한 계정이 하루 20번까지만 받는다. 둘 다 서버 메모리라 함수가 새로 뜨면
 * 비워진다 — 한백만 쓰는 동안은 이것으로 충분하다.
 */
const cache = new Map<string, { at: number; trace: Trace }>();
const calls = new Map<string, { day: string; n: number }>();
const DAY_MS = 24 * 60 * 60 * 1000;
const PER_ACCOUNT_PER_DAY = 20;

export async function GET(req: Request) {
  const { session, denied } = await solarGate();
  if (denied) return denied;
  const pnu = new URL(req.url).searchParams.get('pnu') ?? '';
  if (!/^\d{19}$/.test(pnu)) return NextResponse.json({ error: '필지번호가 이상합니다.' }, { status: 400 });

  // 키가 없으면 세지 않고 돌려보낸다 — 부르지도 않은 것을 하루 한도에서 깎지 않게
  if (!solarApiKey()) return NextResponse.json({ error: 'AI 키(ANTHROPIC_SOLAR_API_KEY)가 아직 없습니다.' }, { status: 503 });
  if (!hasVworld()) return NextResponse.json({ error: '항공사진 키(VWORLD_KEY)가 아직 없습니다.' }, { status: 503 });

  const hit = cache.get(pnu);
  if (hit && Date.now() - hit.at < DAY_MS) return NextResponse.json({ ...hit.trace, cached: true });

  const who = session.id;
  const day = new Date().toISOString().slice(0, 10);
  const used = calls.get(who);
  const n = used?.day === day ? used.n : 0;
  if (n >= PER_ACCOUNT_PER_DAY) return NextResponse.json({ error: `오늘 AI로 패널배치하기를 ${PER_ACCOUNT_PER_DAY}번 다 썼습니다.` }, { status: 429 });

  try {
    const parcel = await parcelByPnu(pnu);
    if (!parcel) return NextResponse.json({ error: '필지를 찾지 못했습니다.' }, { status: 404 });
    calls.set(who, { day, n: n + 1 });
    const trace = await traceRoofs(parcel.polygons);
    cache.set(pnu, { at: Date.now(), trace });
    return NextResponse.json(trace);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[solar-roofs] AI 지붕', pnu, msg);
    return NextResponse.json({ error: `지붕을 찾지 못했습니다 — ${msg}` }, { status: 502 });
  }
}

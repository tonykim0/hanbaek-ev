import { NextResponse } from 'next/server';
import { solarGate } from '@/lib/solar/api-gate';
import { solarApiKey } from '@/lib/solar/api-key';
import { finishTrace, recentTrace, startTrace, tracesSince } from '@/lib/data/solar-roof-traces';
import { today } from '@/lib/date';
import { traceRoofs, type Trace } from '@/lib/solar/roof-trace';
import { pnusOfKey } from '@/lib/solar/parcels';
import { hasVworld, parcelByPnu } from '@/lib/solar/sources/vworld';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * GET /api/solar/roofs?pnu= — AI 지붕 따기. 여러 필지를 한 부지로 묶었으면 필지번호를 쉼표로 잇는다(lib/solar/parcels traceKeyOf —
 * 차례대로라 같은 부지는 같은 열쇠다) — 필지들의 도형을 한 장의 사진에 두르고 한 번 딴다. 부를 때마다 돈이 든다(사진 한 장 + 판단 — 비용은 [llm] solar-roofs 한 줄).
 * 같은 필지는 하루 동안 저장해 둔 결과를 돌려주고, 한 계정이 하루(한국 날짜) 20번까지만 부른다 — 둘 다 DB 다(lib/data/solar-roof-traces,
 * 2026-11-08 — 그전에는 서버 메모리라 함수가 새로 뜨면 비어 같은 필지를 또 AI 에 보냈다).
 * 같은 필지를 동시에 두 번 부르면(단추를 두 번 · 저절로와 단추) 이 서버에서는 AI 를 한 번만 부르고 둘이 같은 결과를 받는다.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const PER_ACCOUNT_PER_DAY = 20;
const inflight = new Map<string, Promise<Trace>>();

/** 사람에게 그대로 보일 거절 — 상태와 문구 */
class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 한 번 따기 — 오늘 한도 → 필지 → 줄 세우기(실패해도 한 번으로 센다) → AI → 결과 적기. key 는 필지번호(여럿이면 쉼표) */
async function trace(key: string, pnus: string[], userId: string): Promise<Trace> {
  const kstMidnight = new Date(`${today()}T00:00:00+09:00`);
  if ((await tracesSince(userId, kstMidnight)) >= PER_ACCOUNT_PER_DAY) {
    throw new Refused(429, `오늘 AI로 패널배치하기를 ${PER_ACCOUNT_PER_DAY}번 다 썼습니다.`);
  }
  const parcels = await Promise.all(pnus.map(parcelByPnu));
  if (parcels.some((p) => !p)) throw new Refused(404, '필지를 찾지 못했습니다.');
  const id = await startTrace(key, userId);
  const result = await traceRoofs(parcels.flatMap((p) => p!.polygons), parcels.length);
  await finishTrace(id, result);
  return result;
}

export async function GET(req: Request) {
  const { session, denied } = await solarGate();
  if (denied) return denied;
  const pnus = pnusOfKey(new URL(req.url).searchParams.get('pnu') ?? '');
  if (!pnus) return NextResponse.json({ error: '필지번호가 이상합니다.' }, { status: 400 });
  const pnu = pnus.join(',');

  // 키가 없으면 세지 않고 돌려보낸다 — 부르지도 않은 것을 하루 한도에서 깎지 않게
  if (!solarApiKey()) return NextResponse.json({ error: 'AI 키(ANTHROPIC_SOLAR_API_KEY)가 아직 없습니다.' }, { status: 503 });
  if (!hasVworld()) return NextResponse.json({ error: '항공사진 키(VWORLD_KEY)가 아직 없습니다.' }, { status: 503 });

  try {
    const hit = await recentTrace(pnu, new Date(Date.now() - DAY_MS));
    if (hit) return NextResponse.json({ ...hit, cached: true });

    // 저장해 둔 것을 본 뒤 기다림 없이 — 같은 필지가 이미 돌고 있으면 그것에 붙는다
    let job = inflight.get(pnu);
    const joined = !!job;
    if (!job) {
      job = trace(pnu, pnus, session.id).finally(() => inflight.delete(pnu));
      inflight.set(pnu, job);
    }
    const result = await job;
    return NextResponse.json(joined ? { ...result, cached: true } : result);
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[solar-roofs] AI 지붕', pnu, msg);
    return NextResponse.json({ error: `지붕을 찾지 못했습니다 — ${msg}` }, { status: 502 });
  }
}

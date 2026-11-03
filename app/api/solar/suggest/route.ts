import { NextResponse } from 'next/server';
import { solarGate } from '@/lib/solar/api-gate';
import { suggest, type SuggestResult } from '@/lib/solar/suggest';

/** GET /api/solar/suggest?q= — 검색창 후보(주소 · 장소) */
export const dynamic = 'force-dynamic';

/** 같은 글자를 여러 사람이 치므로 잠깐 들고 있는다 — 하루 한도를 아낀다. 실패는 담지 않는다. */
const cache = new Map<string, { at: number; result: SuggestResult }>();
const TTL_MS = 10 * 60_000;
const MAX = 500;

export async function GET(req: Request) {
  const { denied } = await solarGate();
  if (denied) return denied;
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 100) return NextResponse.json({ items: [], error: null });

  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.result);

  const result = await suggest(q);
  if (result.error) {
    console.error('[solar-suggest]', result.error);
  } else {
    if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
    cache.set(q, { at: Date.now(), result });
  }
  return NextResponse.json(result);
}

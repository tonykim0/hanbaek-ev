/**
 * 응답을 보낸 뒤에 돌 일 — Vercel 함수가 그 일이 끝날 때까지(최대 maxDuration) 살아 있게 한다. [서버 전용]
 *
 * Vercel 은 요청마다 「@vercel/request-context」 자리에 waitUntil 을 둔다(@vercel/functions 의 waitUntil 이 하는 일
 * 그대로 — 그 패키지는 딸린 것이 많아 들이지 않았다). 그 자리가 없으면(로컬 next dev·시험) 그냥 돌게 둔다 — 서버가
 * 살아 있으니 끝난다. 실패는 삼키지 않고 [background] 로 남긴다(감시가 본다).
 */
type Ctx = { waitUntil?: (p: Promise<unknown>) => void };

export function background(work: Promise<unknown>, what: string): Promise<void> {
  const guarded = work.then(() => undefined, (err) => { console.error(`[background] ${what}`, err); });
  const ctx = (globalThis as Record<symbol, { get?: () => Ctx } | undefined>)[Symbol.for('@vercel/request-context')]?.get?.();
  ctx?.waitUntil?.(guarded);
  // 돌려주는 것은 시험이 끝을 기다리는 데만 쓴다 — 라우트는 기다리지 않는다
  return guarded;
}

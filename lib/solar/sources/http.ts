/** 바깥 API 한 번 — 시간 제한을 두고, 실패는 이유가 보이는 Error 로 바꾼다. */
export class SourceError extends Error {
  constructor(
    public source: string,
    message: string,
    /** 응답은 왔는데 200 이 아닐 때의 HTTP 상태 — 「기록 없음(404)」과 고장을 가르려고 */
    public status?: number,
    /** 답이 없었다(시간 초과 · 연결 실패) — 그 순간만 몰린 것일 수 있어 한 번 더 물을 만하다(onceMoreOnTimeout) */
    public timedOut = false,
  ) {
    super(`[${source}] ${message}`);
  }
}

/** 잠깐 쉬기 — 바깥 자료가 헛 응답을 줄 때 한 번 더 묻기 전에 */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 시간 초과면 잠깐 쉬고 한 번 더 — 다른 실패는 그대로 던진다. 한전이 한 번 10초 안에 답하지 않아 계통 칸과 모햇 제안서 8쪽의
 * 한전 여유용량 표가 통째로 빠진 일이 있었다(2026-11-24 운영).
 */
export async function onceMoreOnTimeout<T>(f: () => Promise<T>, pauseMs = 500): Promise<T> {
  try {
    return await f();
  } catch (err) {
    if (!(err instanceof SourceError && err.timedOut)) throw err;
    await sleep(pauseMs);
    return f();
  }
}

export async function getJson<T = unknown>(
  source: string,
  url: string,
  timeoutMs = 10_000,
  headers?: Record<string, string>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store', headers });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    // 연결 실패(fetch 의 TypeError — 연결 시간 초과 · 끊김)도 그 순간만의 일일 수 있어 같이 한 번 더 묻는다(운영 2026-11-24 「fetch failed」)
    const noAnswer = timedOut || err instanceof TypeError;
    throw new SourceError(source, timedOut ? `응답 없음 (${timeoutMs / 1000}초)` : String(err), undefined, noAnswer);
  }
  const text = await res.text();
  if (!res.ok) throw new SourceError(source, `HTTP ${res.status} ${text.slice(0, 200)}`, res.status);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError(source, `JSON 아님: ${text.slice(0, 200)}`);
  }
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  return u.toString();
}

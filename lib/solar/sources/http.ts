/** 바깥 API 한 번 — 시간 제한을 두고, 실패는 이유가 보이는 Error 로 바꾼다. */
/** 잠깐 쉬기 — 바깥 자료가 헛 응답을 줄 때 한 번 더 묻기 전에 */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class SourceError extends Error {
  constructor(
    public source: string,
    message: string,
    /** 응답은 왔는데 200 이 아닐 때의 HTTP 상태 — 「기록 없음(404)」과 고장을 가르려고 */
    public status?: number,
  ) {
    super(`[${source}] ${message}`);
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
    const why = err instanceof Error && err.name === 'TimeoutError' ? `응답 없음 (${timeoutMs / 1000}초)` : String(err);
    throw new SourceError(source, why);
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

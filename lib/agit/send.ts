/**
 * 아지트 그룹에 글 올리기 (서버 전용) — 웹훅에 {"text": …, "task": {"assignees": […]}} 를 보낸다. 아지트가 그 그룹에 웹훅 이름으로
 * 요청 글을 세우고 담당자를 붙인다(몸은 lib/agit/post agitPayloadOf · 가이드는 그 머리말).
 * (2026-11-07 실측: 한백 그룹 웹훅에 한 줄을 보내 200 · 다른 팀 코드도 같은 모양 — github.com/WRKR-KEA/backend-tms)
 *
 * 받으면 아지트가 그 글의 id · 주소를 돌려준다(2026-11-08 실측 — {"status":"ok","id":365222313,"url":"https://team-hanbaek.agit.io/g/…/wall/…"})
 * — 주소는 *.agit.io 의 https 일 때만 받아 카드의 「아지트에서 보기」에 단다.
 * 아지트가 거절하면 그 답의 앞 200자를 까닭에 붙인다 — 담당자 ID 가 틀렸을 때 무엇이 틀렸는지 아지트만 안다(HTML 이면 안 붙인다).
 *
 * ★주소는 agitWebhookOf 를 통과한 것만 부른다★ — 저장할 때 한 번(라우트), 보낼 때 한 번 더 본다.
 * 오래 매달리지 않는다(10초) — 넘으면 「못 올림」으로 남기고 한백이 다시 누른다. 그 사이 실제로는 올라갔을 수 있다 —
 * 그래서 못 올림 줄에는 「아지트에서 확인하고 다시 올리세요」를 적는다(store/agit).
 */
import { agitWebhookOf, type agitPayloadOf } from './post';

export type AgitSendResult = { ok: true; agitId?: string; agitUrl?: string } | { ok: false; error: string };

/** 아지트가 돌려준 글 주소 — https 의 agit.io · *.agit.io 만(다른 곳으로 가는 고리를 화면에 달지 않는다) */
export function agitPostUrlOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return undefined;
    return host === 'agit.io' || host.endsWith('.agit.io') ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const AGIT_TIMEOUT_MS = 10_000;

/** 거절한 답의 까닭 — 짧은 글일 때만(HTML 오류 쪽은 사람에게 읽히지 않는다) */
async function reasonOf(res: Response): Promise<string> {
  const raw = (await res.text().catch(() => '')).trim();
  if (!raw || raw.startsWith('<')) return '';
  return ` — ${raw.replace(/\s+/g, ' ').slice(0, 200)}`;
}

export async function sendToAgit(
  hook: string,
  payload: ReturnType<typeof agitPayloadOf>,
  fetcher: typeof fetch = fetch
): Promise<AgitSendResult> {
  const url = agitWebhookOf(hook);
  if (!url) return { ok: false, error: '아지트 웹훅 주소가 아닙니다 — 다시 연결해 주세요.' };
  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(AGIT_TIMEOUT_MS),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { id?: unknown; url?: unknown } | null;
      const id = typeof json?.id === 'number' || typeof json?.id === 'string' ? String(json.id) : undefined;
      const url = agitPostUrlOf(json?.url);
      return { ok: true, ...(id ? { agitId: id } : {}), ...(url ? { agitUrl: url } : {}) };
    }
    if (res.status === 404) return { ok: false, error: '아지트가 이 웹훅을 모릅니다(404) — 그룹에서 웹훅을 지웠으면 새 주소로 다시 연결해 주세요.' };
    return { ok: false, error: `아지트가 받지 않았습니다(${res.status})${(await reasonOf(res)) || '.'}` };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error('[agit] 웹훅 요청 실패', timeout ? 'timeout' : e instanceof Error ? e.message : String(e));
    return {
      ok: false,
      error: timeout
        ? `아지트가 ${AGIT_TIMEOUT_MS / 1000}초 안에 답하지 않았습니다 — 올라갔을 수 있으니 아지트에서 확인하고 다시 올려 주세요.`
        : '아지트에 닿지 못했습니다 — 잠시 뒤 다시 올려 주세요.',
    };
  }
}

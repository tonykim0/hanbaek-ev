/**
 * 옛 공개 저장소 → 새 비공개 저장소 — 같은 경로로 옮긴다. 서버 전용 · 한 번 쓰고 걷는다(2026-11-14).
 *
 * 왜 같은 경로인가: DB 의 수천 곳(jsonb 의 files · 메일 · 아지트 글 · 저장본 사진)에 적힌 주소를 고치지 않고 경로만
 * 뽑아 새 저장소에서 찾는다(lib/blob/path 머리말). 그래서 옮기기는 「같은 경로에 같은 바이트」 하나만 지키면 된다.
 *
 * 차례 둘(app/api/cron/blob-copy 가 5분마다 부른다):
 *   mirror — 콘솔이 아직 옛 저장소에 쓰는 동안. 새 저장소를 옛 저장소와 똑같이 맞춘다(없는 것 · 크기가 다른 것을
 *            옮기고, 옛 저장소에서 지워진 것은 새 저장소에서도 지운다).
 *   finish — 콘솔이 새 저장소로 넘어간 뒤. 넘어가기 직전 1분 사이에 옛 저장소에 올라온 것만 마저 옮기고, 다 옮기면
 *            표지(_migration/)를 남겨 다시는 안 돈다 — 계속 돌면 새 저장소에서 지운 파일을 옛 저장소에서 되살린다.
 *            그래서 이 차례는 지우지 않는다.
 *
 * 옛 파일은 공개 주소라 받을 때 열쇠가 필요 없다 — 열쇠는 목록을 읽는 데만 쓴다.
 */
import { del, head, list, put } from '@vercel/blob';

const MARK = '_migration/blob-copy-done.txt';
const BIG = 32 * 1024 * 1024;

type Entry = { url: string; size: number };

async function listAll(token: string): Promise<Map<string, Entry>> {
  const out = new Map<string, Entry>();
  let cursor: string | undefined;
  do {
    const page = await list({ token, cursor, limit: 1000 });
    for (const b of page.blobs) {
      // 폴더 자리표(끝이 /) · 옮기기 표지는 견주지 않는다
      if (b.pathname.endsWith('/') || b.pathname.startsWith('_migration/')) continue;
      out.set(b.pathname, { url: b.url, size: b.size });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export type SyncResult = {
  mode: 'mirror' | 'finish';
  /** 표지가 이미 있어 아무것도 안 했다 */
  done: boolean;
  source: number;
  copied: number;
  removed: number;
  remaining: number;
  failed: string[];
};

export async function syncStores(opts: {
  fromToken: string;
  toToken: string;
  mode: 'mirror' | 'finish';
  /** 이 시각(ms)이 지나면 새 일을 시작하지 않는다 */
  deadline: number;
  concurrency?: number;
}): Promise<SyncResult> {
  const { fromToken, toToken, mode, deadline } = opts;
  const res: SyncResult = { mode, done: false, source: 0, copied: 0, removed: 0, remaining: 0, failed: [] };
  if (mode === 'finish') {
    const marked = await head(MARK, { token: toToken }).then(() => true, () => false);
    if (marked) return { ...res, done: true };
  }

  const [from, to] = await Promise.all([listAll(fromToken), listAll(toToken)]);
  res.source = from.size;
  const todo = [...from].filter(([p, e]) => to.get(p)?.size !== e.size);

  let i = 0;
  const worker = async () => {
    while (i < todo.length && Date.now() < deadline) {
      const [path, e] = todo[i++];
      try {
        const r = await fetch(e.url, { cache: 'no-store' });
        if (!r.ok || !r.body) throw new Error(`옛 파일을 받지 못함 ${r.status}`);
        await put(path, r.body, {
          access: 'private',
          token: toToken,
          contentType: r.headers.get('content-type') ?? undefined,
          addRandomSuffix: false,
          allowOverwrite: true,
          multipart: e.size > BIG,
        });
        res.copied += 1;
      } catch (err) {
        res.failed.push(`${path} — ${err instanceof Error ? err.message.slice(0, 120) : '알 수 없음'}`);
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, worker));
  res.remaining = todo.length - res.copied;

  if (mode === 'mirror' && Date.now() < deadline) {
    const extra = [...to.keys()].filter((p) => !from.has(p));
    for (let k = 0; k < extra.length; k += 100) {
      await del(extra.slice(k, k + 100).map((p) => to.get(p)!.url), { token: toToken });
    }
    res.removed = extra.length;
  }

  if (mode === 'finish' && res.remaining === 0) {
    await put(MARK, `옛 공개 저장소에서 다 옮김 ${new Date().toISOString()} · ${res.source}개`, {
      access: 'private', token: toToken, contentType: 'text/plain', addRandomSuffix: false, allowOverwrite: true,
    });
  }
  return res;
}

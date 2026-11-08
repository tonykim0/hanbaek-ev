/**
 * 여러 장을 차례로 올린다 — 한 장이 실패해도 나머지를 올리고, 실패한 장의 까닭을 모은다. [브라우저 · 시험]
 * 한꺼번에 던지지 않고 차례로 하는 것은 진행 글(「올리는 중 2/5 · 40%」)이 한 줄이어서다.
 * 태양광 현장 첨부파일 · 상담 접수 · 자료실이 같이 쓴다.
 *
 * @param one        한 장 올리기 — 실패하면 그 까닭(한글)을 던진다
 * @param onProgress i 번째(0부터) / 모두 n 장 · 그 장의 %
 */
export async function uploadEach<F extends { name: string }, R>(
  files: readonly F[],
  one: (file: F, onPct: (pct: number) => void) => Promise<R>,
  onProgress: (i: number, n: number, pct: number) => void,
): Promise<{ ok: R[]; failed: string[] }> {
  const ok: R[] = [];
  const failed: string[] = [];
  for (const [i, f] of files.entries()) {
    try {
      ok.push(await one(f, (pct) => onProgress(i, files.length, pct)));
    } catch (err) {
      failed.push(err instanceof Error ? err.message : `${f.name} — 올리지 못했습니다`);
    }
  }
  return { ok, failed };
}

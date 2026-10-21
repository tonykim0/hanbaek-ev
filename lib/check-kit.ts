/**
 * 서류 대조가 같이 쓰는 것 — 칸의 파일을 받아 오는 길과 「자동 대조」라는 이름. [서버 전용]
 *
 * 기설치 대조(lib/preinstall-run)와 건축물대장 대조(lib/parking-run)가 같은 일을 한다: 칸의 파일을 받아 판독에 보내고,
 * 접수 단계에서는 응답 뒤에 저절로 돈다. 두 벌로 적으면 한쪽만 고쳐진다.
 */
import type { Actor } from '@/lib/data/repository';
import type { DocFile } from '@/types/project';

/** 칸 안에서 이름이 겹치면 판독의 답을 파일에 되짚을 수 없다 — 뒤에 번호를 붙인다 */
export function named<T extends Pick<DocFile, 'name' | 'url'>>(files: T[]): (T & { name: string })[] {
  const seen = new Map<string, number>();
  return files.map((f) => {
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    return { ...f, name: n === 1 ? f.name : f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`) };
  });
}

/** 판독에게 보여 주는 이름 — 자모로 풀린 이름(NFD)을 붙은 꼴로 */
export const shownName = (name: string): string => name.normalize('NFC');

/**
 * 판독이 답한 이름(originalName)을 보낸 파일 이름 중 하나로 되짚는다 — 못 찾으면 null.
 *
 * ★한글 이름은 NFC 로 맞춰 견준다★ — 맥에서 올린 파일은 이름이 자모로 풀린 꼴(NFD)로 저장되는 일이 많은데, 판독은 붙은
 * 꼴(NFC)로 답한다. 글자 그대로 견주면 같은 이름이 달라서, 판독이 읽어 답한 파일을 「못 읽은 파일」로 버렸다(창동서울가든
 * 2026-10-21 — 파일 넷을 한 번에 보내 답이 넷 분량으로 왔는데 설치신청서 하나만 남았다. 콘솔이 만든 신청서만 이름이 붙은
 * 꼴이었다). 접수 판독(lib/claude-chunked · intake-auto · pdf-sort)은 이미 NFC 로 견준다. 띄어쓰기는 빼고 견준다(파일명
 * 분류 lib/doc-category-map 과 같다). 같은 이름이 먼저, 없으면 한쪽이 다른 쪽을 품는 이름이다(판독이 확장자를 떼고 답한다).
 */
export function nameOfAnswer(names: string[], answer: string | null): string | null {
  const key = (s: string) => s.normalize('NFC').replace(/\s+/g, '');
  const a = answer ? key(answer) : '';
  if (!a) return null;
  return names.find((n) => key(n) === a)
    ?? names.find((n) => key(n).includes(a) || a.includes(key(n)))
    ?? null;
}

export async function fetchFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`파일을 읽지 못했습니다 (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** 여럿을 받는다 — 한 장을 못 받아도 대조를 멈추지 않고 그 장을 「못 읽음」으로 돌려준다 */
export async function fetchAll<T extends { name: string; url: string }>(
  files: T[]
): Promise<{ got: (T & { buffer: Buffer })[]; failed: string[] }> {
  const got: (T & { buffer: Buffer })[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try { got.push({ ...f, buffer: await fetchFile(f.url) }); } catch { failed.push(f.name); }
  }
  return { got, failed };
}

/** 저절로 돈 대조를 남기는 이름 — 감사 기록·「대조한 사람」에 사람 대신 선다 */
export const AUTO: Actor = { id: 'system', name: '자동 대조', role: 'admin', org: null };

/** 연달아 올라오는 파일(여러 장)을 기다리는 시간 — 마지막 올림 하나만 돈다 */
export const SETTLE_MS = 8_000;

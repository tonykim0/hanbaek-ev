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

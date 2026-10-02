/**
 * 실사보고서 임시 저장본의 사진 — Blob 쪽 일. [서버 전용]
 *
 * ★클라이언트가 준 사진 주소를 믿지 않는다★ (lib/intake-stage 와 같은 원칙). 저장할 때 들어온 사진
 * 자리가 ①이 계정·이 저장본의 폴더(draftPrefix)이고 ②우리 저장소에 실제로 있어야 받는다 — 주소는
 * 우리 저장소에서 찾은 것으로 바꿔 적는다. 이미 저장돼 있던 자리는 다시 찾지 않는다.
 */
import { del, list } from '@vercel/blob';
import { ourBlob } from '@/lib/intake-stage';
import { BadRequest } from '@/lib/api/errors';
import { draftPrefix, mapPhotoRefs, photoRefsOf, type PhotoRef } from './draft-shape';

const token = () => process.env.BLOB_READ_WRITE_TOKEN;

/** 들어온 값의 사진 자리를 확인하고 우리 주소로 바꾼 값 */
export async function vetPhotos(data: unknown, before: unknown, ownerId: string, draftId: string): Promise<unknown> {
  const prefix = draftPrefix(ownerId, draftId);
  const known = new Map(photoRefsOf(before).map((r) => [r.path, r.url]));
  const fresh = new Map<string, string>();
  for (const r of photoRefsOf(data)) {
    if (!r.path.startsWith(prefix) || r.path.includes('..')) throw new BadRequest('이 저장본의 사진이 아닙니다.');
    if (known.has(r.path) || fresh.has(r.path)) continue;
    try {
      fresh.set(r.path, (await ourBlob(r.path)).url);
    } catch {
      throw new BadRequest('올린 사진을 찾을 수 없습니다 — 다시 저장해 주세요.');
    }
  }
  return mapPhotoRefs(data, (r) => ({ ...r, url: known.get(r.path) ?? fresh.get(r.path)! }));
}

/** 지우지 못한 파일 — 저장은 된 것이라 막지 않고 로그로 남긴다(감시가 [survey-drafts] 를 본다) */
const lost = (what: string) => (e: unknown) => console.error(`[survey-drafts] ${what} — 파일이 남았습니다`, e);

/** 빠진 사진 지우기 — 실패해도 저장은 된 것이다(파일 하나 남는 편이 낫다) */
export async function dropPhotos(refs: PhotoRef[]): Promise<void> {
  for (let i = 0; i < refs.length; i += 25) {
    await del(refs.slice(i, i + 25).map((r) => r.url), { token: token() }).catch(lost('빠진 사진 지우기'));
  }
}

/** 저장본 폴더째 지우기 — 올리고 저장 안 한 사진까지 같이 걷힌다. 실패해도 던지지 않는다(저장본은 이미 지워졌다) */
export async function dropDraftFolder(ownerId: string, draftId: string): Promise<void> {
  const prefix = draftPrefix(ownerId, draftId);
  try {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000, token: token() });
      const urls = page.blobs.map((b) => b.url);
      for (let i = 0; i < urls.length; i += 25) await del(urls.slice(i, i + 25), { token: token() }).catch(lost(prefix));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (e) {
    lost(prefix)(e);
  }
}

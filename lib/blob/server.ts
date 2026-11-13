/**
 * 비공개 파일 저장소 — 서버 전용. ★콘솔에서 @vercel/blob 을 부르는 곳은 여기 한 곳이다★(브라우저 올리기의
 * '@vercel/blob/client' put · 옮기기 lib/blob/sync 빼고 — test/conventions/blob.test.ts 가 본다).
 *
 * ★파일은 비공개 저장소에 있다★ (2026-11-14 사용자 「그래 비공개로 전환해줘」 — lib/blob/path 머리말). 맨 주소는
 * 403 이라 서버는 SDK 로 읽고(readBlob · openBlob · headBlob), 브라우저는 파일 문(/api/files)이 넘긴 5분짜리
 * 서명 주소로, 콘솔 밖(Claude API · 메일 받는 사람)은 파일 하나만 여는 고정 링크(fileLink)로 받는다.
 *
 * ★열쇠는 PRIVATE_BLOB_READ_WRITE_TOKEN 이다 — SDK 의 기본 이름(BLOB_READ_WRITE_TOKEN)이 아니다★. 옮기는 동안
 * 기본 이름은 옛 공개 저장소의 열쇠로 남아 있고(옮기는 크론이 그것으로 목록을 읽는다), 옛 저장소를 지우면 그 이름도
 * 지운다. 여기 함수는 전부 그 열쇠를 넘긴다 — SDK 를 따로 부르면 옛 저장소로 간다. 운영 · 미리보기 · 로컬이 각자의
 * 비공개 저장소를 가리킨다(운영 hanbaek-files · 그 밖 hanbaek-dev-files, 둘 다 서울).
 *
 * ★SDK 에는 주소 대신 경로를 넘긴다★ — DB 에는 옛 공개 저장소의 주소가 그대로 남아 있다. 주소를 넘기면 SDK 가 그
 * 주소의 저장소를 찾아가려 할 수 있다. 경로는 저장소와 무관하다(옮길 때 같은 경로로 복사했다).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { copy, del, get, head, issueSignedToken, list, presignUrl, put, type PutBlobResult } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { CONSOLE_URL } from '@/lib/portal-intake';
import { BLOB_ACCESS, blobPathOf } from './path';

export { BLOB_ACCESS };

/** 비공개 저장소의 열쇠 — 없으면 멈춘다(옛 공개 저장소로 조용히 새지 않게) */
export function blobToken(): string {
  const t = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error('[blob] PRIVATE_BLOB_READ_WRITE_TOKEN 이 없습니다 — 비공개 파일 저장소에 붙을 수 없습니다.');
  return t;
}

/** 저장소가 붙어 있는가 — 자료실처럼 저장소를 직접 나열하는 화면이 「저장소 없음」을 가를 때 */
export const hasBlobStore = () => !!process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

/** 경로를 못 뽑는 주소 · 저장소에 없는 파일 */
export class BlobMissing extends Error {}

/** 주소(옛 · 새 저장소 · 파일 문)든 경로든 경로로 — 못 뽑으면 BlobMissing */
export function pathOf(urlOrPath: string): string {
  const path = /^https?:\/\/|^\/api\/files\//.test(urlOrPath) ? blobPathOf(urlOrPath) : urlOrPath;
  if (!path || path.startsWith('/') || path.split('/').includes('..')) {
    throw new BlobMissing(`우리 저장소의 파일 주소가 아닙니다: ${urlOrPath.slice(0, 80)}`);
  }
  return path;
}

// ── 읽기 ────────────────────────────────────────────────────────────────────────

/** 파일을 흐름으로 — 큰 파일을 통째로 들지 않고 넘길 때. 없으면 BlobMissing */
export async function openBlob(urlOrPath: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string; size: number; pathname: string }> {
  const path = pathOf(urlOrPath);
  const r = await get(path, { access: BLOB_ACCESS, token: blobToken() });
  if (!r || r.statusCode !== 200 || !r.stream) throw new BlobMissing(`저장소에 없는 파일입니다: ${path}`);
  return { stream: r.stream, contentType: r.blob.contentType, size: r.blob.size, pathname: r.blob.pathname };
}

/** 파일의 바이트 — 없으면 BlobMissing */
export async function readBlob(urlOrPath: string): Promise<Buffer> {
  const r = await openBlob(urlOrPath);
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

/** 파일의 정보(크기 · 형식 · 지금 저장소의 주소) — 없으면 null */
export async function headBlob(urlOrPath: string) {
  try {
    return await head(pathOf(urlOrPath), { token: blobToken() });
  } catch {
    return null;
  }
}

/** 파일의 정보 — 없으면 던진다(SDK head 와 같다 · 「그 자리가 비었나」를 try 로 가르는 곳) */
export async function statBlob(urlOrPath: string) {
  return head(pathOf(urlOrPath), { token: blobToken() });
}

/** 한 접두사 아래 전부 — 저장소 목록(자료실 · 임시 자리 청소 · 묶음 찾기) */
export async function listBlobs(prefix: string, opts?: { limit?: number }) {
  const out: Awaited<ReturnType<typeof list>>['blobs'] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: opts?.limit ?? 1000, token: blobToken() });
    out.push(...page.blobs);
    cursor = opts?.limit ? undefined : page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// ── 쓰기 ────────────────────────────────────────────────────────────────────────

type PutOpts = { contentType?: string; addRandomSuffix?: boolean; allowOverwrite?: boolean; multipart?: boolean };

/** 서버가 올린다 — 돌려준 url 을 DB 에 적는다(새 비공개 저장소의 주소) */
export async function putBlob(path: string, body: Parameters<typeof put>[1], opts?: PutOpts): Promise<PutBlobResult> {
  return put(path, body, { access: BLOB_ACCESS, token: blobToken(), ...opts });
}

/** 같은 저장소 안에서 복사 — copy 는 형식을 옮겨 주지 않으므로 contentType 을 준다 */
export async function copyBlob(fromUrlOrPath: string, toPath: string, opts?: { contentType?: string; addRandomSuffix?: boolean; allowOverwrite?: boolean }) {
  return copy(pathOf(fromUrlOrPath), toPath, { access: BLOB_ACCESS, token: blobToken(), ...opts });
}

/** 지운다 — 주소 · 경로 하나 또는 여럿. 못 지워도 던지지 않는 것은 dropBlob */
export async function deleteBlobs(urlsOrPaths: string | string[]): Promise<void> {
  const paths = (Array.isArray(urlsOrPaths) ? urlsOrPaths : [urlsOrPaths]).map(pathOf);
  for (let i = 0; i < paths.length; i += 25) await del(paths.slice(i, i + 25), { token: blobToken() });
}

/** 지운다 — 실패는 삼킨다(이미 없는 파일 · 정리용) */
export async function dropBlob(urlOrPath: string): Promise<void> {
  await deleteBlobs(urlOrPath).catch(() => {});
}

/**
 * 브라우저가 바로 올릴 표 — 경로 · 형식 · 크기를 서버가 정한다(라우트가 권한을 본 뒤에 부른다).
 * 브라우저는 '@vercel/blob/client' 의 put(경로, 파일, { access: BLOB_ACCESS, token }) 으로 올린다.
 */
export async function clientUploadToken(opts: Omit<Parameters<typeof generateClientTokenFromReadWriteToken>[0], 'token'>): Promise<string> {
  return generateClientTokenFromReadWriteToken({ ...opts, token: blobToken() });
}

// ── 콘솔 밖에서 받는 주소 ─────────────────────────────────────────────────────────

let signer: { delegationToken: string; clientSigningToken: string; validUntil: number } | null = null;

/** 한 시간짜리 서명 열쇠 — 모자라면 새로 받는다(주소마다 API 를 부르지 않는다 — 서명은 계산이다) */
async function signingKey(minValidUntil: number) {
  if (!signer || signer.validUntil < minValidUntil + 5 * 60_000) {
    signer = await issueSignedToken({ token: blobToken(), pathname: '*', operations: ['get'], validUntil: Date.now() + 60 * 60_000 });
  }
  return signer;
}

/**
 * 서명 주소 — `ttlMs` 동안만(기본 5분, 최대 50분) 열린다. 경로를 바꾸면 거절된다. `download` 면 받기(첨부)로.
 * 같은 파일이라도 부를 때마다 주소가 다르다 — 고정 주소가 필요하면 fileLink.
 */
export async function signedGetUrl(urlOrPath: string, opts?: { ttlMs?: number; download?: boolean }): Promise<string> {
  const path = pathOf(urlOrPath);
  const until = Date.now() + Math.min(opts?.ttlMs ?? 5 * 60_000, 50 * 60_000);
  const key = await signingKey(until);
  const { presignedUrl } = await presignUrl(key, { operation: 'get', pathname: path, access: BLOB_ACCESS, validUntil: until });
  return opts?.download ? `${presignedUrl}&download=1` : presignedUrl;
}

/*
 * ★고정 링크★ — 파일 하나만 여는, 바뀌지 않는 주소(`/api/file-link/<서명>/<경로>`). 로그인 없이 열린다.
 * 쓰는 곳 둘: Claude API 에 넘기는 파일(`source: { type: 'url' }` — 대화마다 지난 파일을 다시 싣는데 주소가 바뀌면
 * 프롬프트 캐시가 깨진다, lib/agents/brain) · 메일 본문의 큰 묶음 링크(받는 사람은 콘솔 계정이 없다 — 공개 저장소
 * 때 맨 주소를 적던 자리). 서명 열쇠는 그 저장소의 열쇠에서 뽑는다 — 미리보기(개발 저장소)는 운영 파일의 링크를
 * 못 만든다. 열쇠를 갈면 그전 링크가 다 닫힌다.
 */
/** 고정 링크의 서명 — 경로마다 늘 같다(시험이 링크를 지을 때도 이것) */
export function linkSig(path: string): string {
  return createHmac('sha256', `file-link\n${blobToken()}`).update(path).digest('base64url').slice(0, 32);
}

/** 고정 링크의 서명이 맞는가 */
export function verifyFileLink(sig: string, path: string): boolean {
  const want = Buffer.from(linkSig(path));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * 파일 하나만 여는 고정 링크 — 운영에서만 콘솔 주소로 만든다. 미리보기 · 로컬은 바깥(Claude · 메일)에서 닿지 않아
 * (배포 보호 · localhost) 50분짜리 서명 주소를 준다 — 시험에서는 캐시가 깨져도 된다.
 */
export async function fileLink(urlOrPath: string): Promise<string> {
  const path = pathOf(urlOrPath);
  if (process.env.VERCEL_ENV !== 'production') return signedGetUrl(path, { ttlMs: 50 * 60_000 });
  return `${CONSOLE_URL}/api/file-link/${linkSig(path)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

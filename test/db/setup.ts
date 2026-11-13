/**
 * 경계 시험의 바닥.
 *
 * 1. 개발 DB 가 맞는지 확인하고 아니면 멈춘다 — 프로덕션에 시험 현장을 만들면 사고다
 *    (어느 DB 에 붙었는지 헷갈려 프로덕션 대신 개발 DB 를 고친 실사고가 반대 방향으로 있었다, CLAUDE.md).
 * 2. Next 밖에서 라우트가 돌게 두 모듈을 흉내 낸다:
 *    · react.cache — Next 가 번들한 React 에만 있다. 여기서는 통과 함수다.
 *    · next/headers — cookies() 가 시험의 쿠키 통(cookie-jar)을 읽는다. 세션은 kit.signIn 으로 넣는다.
 * 3. 파일이 끝나면 커넥션을 닫는다 — 안 닫으면 러너가 idle_timeout 까지 매달린다.
 */
import { afterAll, beforeAll, vi } from 'vitest';
import { loadEnvFile } from '@/lib/env-file';

loadEnvFile();

const DEV_REF = 'impavoeuvywtdkeweyqd';   // 개발·시험 Supabase 프로젝트 (CLAUDE.md 「어느 Supabase 프로젝트가 프로덕션인가」)
const PROD_REF = 'fsngrxdmucwlqnduzrhw';  // 프로덕션 — 여기 붙으면 무조건 멈춘다
const url = process.env.DATABASE_URL ?? '';
if (!url) throw new Error('DATABASE_URL 이 없습니다 — .env.local 에 개발 DB 접속 문자열이 있어야 경계 시험이 돈다.');
if (url.includes(PROD_REF) || !url.includes(DEV_REF)) {
  throw new Error(`DATABASE_URL 이 개발 DB(${DEV_REF})가 아닙니다 — 경계 시험은 개발 DB 에만 돈다. 지금 값은 프로덕션이거나 모르는 곳이다.`);
}
if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET 이 없습니다 — 세션 쿠키를 만들 수 없다.');

vi.mock('react', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react')>();
  return { ...mod, cache: <T>(fn: T) => fn };
});

vi.mock('next/headers', async () => {
  const { jar } = await import('./cookie-jar');
  return {
    cookies: () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      has: (name: string) => jar.has(name),
    }),
    headers: () => new Headers(),
  };
});

/*
 * 파일 읽기는 global fetch 로 돌린다 — 시험들은 fetch 를 흉내 내 파일을 준다(test.local · x.public.blob… 주소).
 * 운영은 비공개 저장소를 SDK 로 읽는다(lib/blob/server, 2026-11-14) — 시험이 실제 개발 저장소를 읽거나, 흉내 낸 주소가
 * 「우리 저장소가 아님」으로 걸리지 않게 읽기 셋만 바꾼다. 올리기 표(clientUploadToken)는 그대로 — 열쇠가 있을 때만 도는 시험이 본다.
 * 고정 링크(fileLink)는 주소를 그대로 돌려준다 — 에이전트 대화를 짓는 시험이 서명 열쇠를 받으러 가지 않게.
 */
vi.mock('@/lib/blob/server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/blob/server')>();
  const readBlob = async (url: string) => {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new real.BlobMissing(`시험: 파일을 받지 못함 ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  const headBlob = async (url: string) => {
    const r = await fetch(url, { method: 'HEAD' }).catch(() => null);
    if (!r?.ok) return null;
    return { url, pathname: url, size: Number(r.headers.get('content-length') ?? 0), contentType: r.headers.get('content-type') ?? '' } as unknown as Awaited<ReturnType<typeof real.headBlob>>;
  };
  return { ...real, readBlob, headBlob, fileLink: async (url: string) => url };
});

beforeAll(async () => {
  // 죽은 실행이 남긴 시험 현장을 걷는다 — 한 시간 넘은 것만(옆 세션의 진행 중인 시험은 건드리지 않는다)
  const { sweepStaleFixtures } = await import('./kit');
  await sweepStaleFixtures().catch((e: unknown) => console.warn('[test/db] 지난 시험 현장 정리 실패:', (e as Error).message));
});

afterAll(async () => {
  const sql = (globalThis as { __hbSql?: { end: (o?: { timeout?: number }) => Promise<void> } }).__hbSql;
  await sql?.end({ timeout: 5 });
});

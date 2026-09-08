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

beforeAll(async () => {
  // 죽은 실행이 남긴 시험 현장을 걷는다 — 한 시간 넘은 것만(옆 세션의 진행 중인 시험은 건드리지 않는다)
  const { sweepStaleFixtures } = await import('./kit');
  await sweepStaleFixtures().catch((e: unknown) => console.warn('[test/db] 지난 시험 현장 정리 실패:', (e as Error).message));
});

afterAll(async () => {
  const sql = (globalThis as { __hbSql?: { end: (o?: { timeout?: number }) => Promise<void> } }).__hbSql;
  await sql?.end({ timeout: 5 });
});

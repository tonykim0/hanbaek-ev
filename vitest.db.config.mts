/**
 * 경계 시험 러너 — 라우트·저장소를 ★개발 DB★에 대고 돈다 (하네스 3번, 2026-09-08).
 *
 * 순수 함수 그물(vitest.config.mts, 0.5초)이 못 잡는 층이 있었다: 감사(2026-09-04) 높음 9건은
 * 전부 「서버가 검증하지 않았다」「권한을 안 봤다」「동시에 붙으면 한 장이 사라진다」 — 라우트와
 * 저장소의 경계다. 여기서는 Next 를 띄우지 않고 라우트 핸들러를 함수로 부른다. 세션은
 * next/headers 를 흉내 내 쿠키를 넣고(test/db/setup.ts), 데이터는 실제 Postgres 다.
 *
 *   npm run test:db        ← .env.local 의 DATABASE_URL 이 개발 DB 여야 돈다(setup 이 확인하고 아니면 멈춘다)
 *
 * 파일을 순서대로 돈다(fileParallelism false) — 커넥션 수를 아끼고, 같은 개발 DB 를 쓰는
 * 옆 세션의 시험과 덜 겹치게. 시험 현장은 이름에 실행 표지를 박고 끝나면 지운다(test/db/kit.ts).
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(process.cwd()) },
  },
  test: {
    include: ['test/db/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/db/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

/**
 * 파일은 비공개 저장소다(2026-11-14, lib/blob/path 머리말) — 그것이 깨지는 길 셋을 막는다.
 *
 *  ① SDK 를 아무 데서나 부르면 열쇠를 빠뜨린다 — 빠뜨린 호출은 SDK 기본 이름(BLOB_READ_WRITE_TOKEN)으로 ★옛 공개
 *     저장소★에 간다(옮기는 동안 그 이름이 옛 저장소다). 그래서 '@vercel/blob' 은 lib/blob 의 두 파일만 부른다.
 *     브라우저 올리기는 '@vercel/blob/client' 의 put 만 쓴다(열쇠는 서버가 준 표다).
 *  ② 공개로 올리면 비공개 저장소가 거절한다 — 'public' 을 적는 자리가 남으면 그 올리기가 깨진다.
 *  ③ 옛 열쇠 이름은 옮기는 크론만 읽는다 — 다른 데서 읽으면 옛 저장소를 계속 쓴다.
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { findSources } from './fs';

const sources = [...findSources('lib'), ...findSources('app'), ...findSources('components')];
const text = (f: string) => readFileSync(f, 'utf8');

const SDK_OK = new Set(['lib/blob/server.ts', 'lib/blob/sync.ts']);
const OLD_TOKEN_OK = new Set(['app/api/cron/blob-copy/route.ts']);

describe('비공개 파일 저장소', () => {
  it('파일을 찾았다', () => expect(sources.length).toBeGreaterThan(300));

  it("① '@vercel/blob' 은 lib/blob/server · sync 만 부른다", () => {
    const bad = sources.filter((f) => !SDK_OK.has(f) && /from '@vercel\/blob'|import\('@vercel\/blob'\)/.test(text(f)));
    expect(bad, '열쇠를 빠뜨리면 옛 공개 저장소로 간다 — lib/blob/server 의 함수를 쓴다').toEqual([]);
  });

  it("① 브라우저 올리기는 '@vercel/blob/client' 의 put 만", () => {
    const bad = sources.filter((f) => f !== 'lib/blob/server.ts')
      .filter((f) => /@vercel\/blob\/client/.test(text(f)))
      .filter((f) => [...text(f).matchAll(/(?:import\s*\{([^}]*)\}\s*from\s*'@vercel\/blob\/client'|const\s*\{([^}]*)\}\s*=\s*await import\('@vercel\/blob\/client'\))/g)]
        .some((m) => (m[1] ?? m[2]).split(',').map((x) => x.trim()).some((n) => n && n !== 'put')));
    expect(bad).toEqual([]);
  });

  it("② access: 'public' 으로 올리는 자리가 없다", () => {
    const bad = sources.filter((f) => /access:\s*'public'/.test(text(f)));
    expect(bad, '비공개 저장소는 공개 올리기를 거절한다 — BLOB_ACCESS').toEqual([]);
  });

  it('③ 옛 열쇠 이름(BLOB_READ_WRITE_TOKEN)은 옮기는 크론만 읽는다', () => {
    const bad = sources.filter((f) => !OLD_TOKEN_OK.has(f) && /process\.env\.BLOB_READ_WRITE_TOKEN/.test(text(f)));
    expect(bad).toEqual([]);
  });
});

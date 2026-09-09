/**
 * 설정 파일의 불변식 — 한 줄 지워지면 조용히 나빠지는 것들.
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('설정 불변식', () => {
  it('함수 지역은 icn1(서울) — DB 와 같은 도시가 아니면 질의마다 태평양을 건넌다 (CLAUDE.md 코드 규칙)', () => {
    expect(json('vercel.json').regions).toEqual(['icn1']);
  });

  it('하네스의 러너 셋이 package.json 에 있다', () => {
    const s = json('package.json').scripts;
    expect(s.test).toBe('vitest run');
    expect(s['test:db']).toContain('vitest.db.config.mts');
    expect(s.lint).toBeTruthy();
  });

  it('워크트리 준비 — .worktreeinclude 가 .env.local 을, .gitignore 가 워크트리 폴더와 node_modules 링크를 안다', () => {
    const inc = readFileSync('.worktreeinclude', 'utf8');
    expect(inc).toMatch(/^\.env\.local$/m);
    const ig = readFileSync('.gitignore', 'utf8');
    expect(ig).toMatch(/^\.claude\/worktrees\/$/m);
    expect(ig, 'node_modules/ (디렉터리만) 로 두면 워크트리의 링크가 커밋에 딸려 들어간다').toMatch(/^node_modules$/m);
  });
});

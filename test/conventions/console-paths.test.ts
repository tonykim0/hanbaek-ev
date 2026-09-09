/**
 * 콘솔 화면 폴더와 미들웨어의 경로 목록(lib/routes-map.ts CONSOLE_PATHS)은 1:1 이다.
 *
 * 목록에 없는 화면은 포털 주소에서 404 가 안 되고 로그인 문도 안 걸린다 — 감사(2026-09-04 L21)가
 * /finance·/scan 이 그렇게 열려 있는 것을 찾았다. 화면을 만들고 목록에 안 적는 실수를 여기서 잡는다.
 */
import { describe, expect, it } from 'vitest';
import { CONSOLE_PATHS, OPEN_IN_CONSOLE } from '@/lib/routes-map';
import { findFiles, urlSegmentsOf } from './fs';

const CONSOLE = 'app/(console)';
const tops = [...new Set(findFiles(CONSOLE, 'page.tsx').map((p) => `/${urlSegmentsOf(p, CONSOLE)[0]}`))].sort();

describe('콘솔 경로 목록', () => {
  it('화면 폴더의 첫 경로는 전부 CONSOLE_PATHS 에 있다', () => {
    for (const top of tops) {
      expect(CONSOLE_PATHS as readonly string[], `${top}: app/(console) 에 화면이 있는데 lib/routes-map.ts CONSOLE_PATHS 에 없다 — 포털에서 열리고 로그인 없이 들어간다`).toContain(top);
    }
  });

  it('CONSOLE_PATHS 의 경로는 전부 화면이 있다 — 죽은 항목이 없다', () => {
    for (const path of CONSOLE_PATHS) {
      if ((OPEN_IN_CONSOLE as readonly string[]).includes(path)) continue;   // /login 은 콘솔 그룹 밖에 있다
      expect(tops, `${path}: 목록에는 있는데 app/(console) 에 화면이 없다`).toContain(path);
    }
  });

  it('감사 L21 — /finance 와 /scan 이 목록에 있다', () => {
    expect(CONSOLE_PATHS).toContain('/finance');
    expect(CONSOLE_PATHS).toContain('/scan');
  });
});

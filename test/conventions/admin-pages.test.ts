/**
 * 한백 전용 화면의 두 문 — (admin) 라우트 그룹의 레이아웃과 미들웨어가 같은 지도를 본다.
 *
 * 「`/admin` 아래 새 화면은 `(write)` 안에 만든다 — 바로 밑에 만들면 열람 전용도 보게 된다」(CLAUDE.md).
 * 폴더 위치가 곧 권한이라, 폴더를 잘못 만들면 아무 코드도 안 틀린 채 문이 열린다. 여기서 폴더 트리와
 * lib/routes-map.ts 의 목록을 맞춰 본다: /admin 바로 밑의 화면은 ADMIN_READABLE 에 적힌 것만이고,
 * (admin) 그룹의 화면은 전부 미들웨어의 한백 전용·관리자 전용 목록 안에 있어야 한다.
 */
import { describe, expect, it } from 'vitest';
import { ADMIN_ONLY, ADMIN_READABLE, HANBAEK_ONLY } from '@/lib/routes-map';
import { findFiles, urlSegmentsOf } from './fs';

const ADMIN_GROUP = 'app/(console)/(admin)';
const pages = findFiles(ADMIN_GROUP, 'page.tsx');

describe('(admin) 라우트 그룹', () => {
  it('화면을 찾았다', () => {
    expect(pages.length).toBeGreaterThan(3);
  });

  it('/admin 아래 화면은 (write) 안에 있다 — 바깥은 ADMIN_READABLE 에 적힌 것만', () => {
    for (const p of pages) {
      const segs = urlSegmentsOf(p, ADMIN_GROUP);
      if (segs[0] !== 'admin') continue;
      if (p.includes('/(write)/')) continue;
      const url = `/${segs.join('/')}`;
      expect(ADMIN_READABLE as readonly string[], `${p}: /admin 바로 밑의 화면은 열람 전용도 본다 — (write) 안으로 옮기거나, 정말 열 것이면 lib/routes-map.ts ADMIN_READABLE 에 적는다`).toContain(url);
    }
  });

  it('ADMIN_READABLE 의 화면은 실제로 있다', () => {
    for (const url of ADMIN_READABLE) {
      const found = pages.some((p) => `/${urlSegmentsOf(p, ADMIN_GROUP).join('/')}` === url && !p.includes('/(write)/'));
      expect(found, `${url} 화면이 (write) 밖에 없다 — 목록에서 지운다`).toBe(true);
    }
  });

  it('(admin) 그룹의 화면은 전부 미들웨어의 한백 전용·관리자 전용 목록에 있다 — 엣지에서 한 번 더 걸리게', () => {
    const guarded = [...ADMIN_ONLY, ...HANBAEK_ONLY] as readonly string[];
    for (const p of pages) {
      const top = `/${urlSegmentsOf(p, ADMIN_GROUP)[0]}`;
      expect(guarded, `${p}: 첫 경로 ${top} 이 lib/routes-map.ts 의 ADMIN_ONLY·HANBAEK_ONLY 어디에도 없다`).toContain(top);
    }
  });
});

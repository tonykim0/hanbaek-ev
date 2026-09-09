/** 관례 시험이 파일 트리를 읽는 데 쓰는 것 — 저장소 루트 기준 상대 경로를 돌려준다 */
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

export const ROOT = process.cwd();

export function findFiles(dir: string, name: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e === name) out.push(relative(ROOT, p));
    }
  };
  walk(join(ROOT, dir));
  return out.sort();
}

/** app/(console)/(admin)/admin/(write)/accounts/page.tsx → ['admin', 'accounts'] — 라우트 그룹 (…) 은 주소에 없다 */
export function urlSegmentsOf(pagePath: string, under: string): string[] {
  return pagePath
    .slice(under.length + 1)
    .split('/')
    .filter((seg) => seg && !seg.startsWith('(') && seg !== 'page.tsx');
}

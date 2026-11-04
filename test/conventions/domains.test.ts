/**
 * 운영 주소는 hanbaek-re.vercel.app 하나다(2026-11-03 — 신재생: 전기차 · 태양광). 옛 주소 둘(hanbaek-ev · hanbaek-form)은
 * next.config 가 경로를 붙여 넘긴다. 여기서 보는 것: 옛 주소마다 넘기는 규칙이 있고 · 새 주소는 넘기지 않으며(돌고 도는
 * 이동이 없다) · 영구(308)가 아니고 · 화면·공지에 옛 콘솔 주소가 남지 않는다(누르면 한 번 더 돌아간다).
 */
import { readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import nextConfig from '@/next.config.mjs';
import { findSources } from './fs';

const NEW_ORIGIN = 'https://hanbaek-re.vercel.app';
const OLD_HOSTS = ['hanbaek-ev.vercel.app', 'hanbaek-form.vercel.app'];

type Rule = { source: string; destination: string; permanent: boolean; has?: { type: string; value?: string }[] };
const rules = async () => ((await nextConfig.redirects?.()) ?? []) as Rule[];
const hostOf = (r: Rule) => r.has?.find((h) => h.type === 'host')?.value;

describe('운영 주소 — hanbaek-re', () => {
  it.each(OLD_HOSTS)('%s 로 오는 요청은 경로를 그대로 붙여 새 주소로 넘긴다 — 크론 경로만 빼고', async (host) => {
    const rule = (await rules()).find((r) => hostOf(r) === host);
    expect(rule, `${host} 를 넘기는 규칙이 없다`).toBeDefined();
    // Next 가 넘기기에 쓰는 바로 그 맞춤(getPathMatch)으로 본다 — 경로 전체가 :path 하나에 잡혀 새 주소 뒤에 붙는다
    const match = getPathMatch(rule!.source, { strict: true, removeUnnamedParams: true });
    const to = (path: string) => {
      const m = match(path);
      return m ? rule!.destination.replace(':path', String(m.path ?? '')) : null;
    };
    expect(to('/')).toBe(`${NEW_ORIGIN}/`);
    expect(to('/projects/HB-2026-1')).toBe(`${NEW_ORIGIN}/projects/HB-2026-1`);
    expect(to('/api/projects/HB-2026-1/notes')).toBe(`${NEW_ORIGIN}/api/projects/HB-2026-1/notes`);
    expect(to('/notices/files/legacy-charger-history-template.xlsx')).toBe(`${NEW_ORIGIN}/notices/files/legacy-charger-history-template.xlsx`);
    // 크론은 넘기기(3xx)를 따라가지 않는다 — 옛 주소로 불려도 그 자리에서 돈다(next.config.mjs NOT_CRON)
    expect(to('/api/cron/agents')).toBeNull();
  });

  it('영구 이동(308)이 아니다 — 브라우저가 오래 기억해 되돌릴 수 없게 된다', async () => {
    for (const r of await rules()) expect(r.permanent, `${r.source} → ${r.destination}`).toBe(false);
  });

  it('새 주소는 넘기지 않는다 — 주소를 가리지 않는 규칙은 같은 주소 안의 경로로만 보낸다', async () => {
    const all = await rules();
    expect(all.some((r) => hostOf(r) === new URL(NEW_ORIGIN).host)).toBe(false);
    for (const r of all.filter((x) => !hostOf(x))) expect(r.destination.startsWith('/'), `${r.source} → ${r.destination}`).toBe(true);
  });

  it('화면·공지에 옛 콘솔 주소를 적지 않는다', () => {
    const html = readdirSync('public', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.html')).map((f) => `public/${f}`);
    expect(html.length).toBeGreaterThan(0);
    const files = [...findSources('app'), ...findSources('components'), ...findSources('lib'), ...html];
    const stale = files.filter((f) => readFileSync(f, 'utf8').includes('hanbaek-ev.vercel.app'));
    expect(stale).toEqual([]);
  });
});

/**
 * 사업 색 — 전기차 그린 · 태양광 귤색(2026-11-04, 한백 「태양광사업관리 페이지에서 버튼이 초록색 — 태양광에 맞춘 디자인시스템」).
 * 색은 둘로 갈린다: 사업 색(tailwind brand — app/globals.css 의 [data-biz] 변수)은 조작에, 상태 색(ok · 빨강 · 노랑 · 하늘)은 뜻에.
 *
 * 여기서 보는 것:
 *  ① 두 사업이 tailwind 가 읽는 변수를 다 채운다 — 하나라도 비면 그 사업에서 그 색이 조용히 사라진다.
 *  ② 대비 — 채운 자리의 글자(on-fill)와 흰 바탕 위 글자 단계(600~900)가 4.5 이상. 귤색은 밝아 짝을 잘못 고르기 쉽다.
 *  ③ 태양광 틀 아래에서 그려지는 파일이 사업 색 바탕에 흰 글자를 손으로 적지 않는다 — 전기차에서만 맞는 짝이다
 *     (귤색 채움 위 흰 글자 1.7). 채운 자리는 bg-brand-fill text-brand-on-fill.
 *  ④ 상태 초록(ok)을 사업 색으로 칠하지 않는다 — 태양광에서 「통과」가 귤색이 되면 「봐야 함」(노랑)과 섞인다.
 *  ⑤ 껍데기가 사업을 data-biz 로 단다 — 그것이 없으면 태양광 화면이 통째로 전기차 색이다.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, normalize } from 'path';
import { describe, expect, it } from 'vitest';
import { SHARED_PATHS, SOLAR_ROOT } from '@/lib/biz';
import { findFiles, urlSegmentsOf } from './fs';

type Rgb = [number, number, number];

const css = readFileSync('app/globals.css', 'utf8');

/** 한 블록 안의 「--이름: R G B;」 */
function varsOf(block: RegExp): Map<string, Rgb> {
  const m = css.match(block);
  if (!m) throw new Error(`globals.css 에 ${block} 블록이 없다`);
  const out = new Map<string, Rgb>();
  for (const [, name, r, g, b] of m[1].matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    out.set(name, [Number(r), Number(g), Number(b)]);
  }
  return out;
}

const BIZ: Record<'ev' | 'solar', Map<string, Rgb>> = {
  ev: varsOf(/:root,\s*\[data-biz='ev'\]\s*\{([^}]*)\}/),
  solar: varsOf(/\[data-biz='solar'\]\s*\{([^}]*)\}/),
};

/** WCAG 상대 휘도 · 대비 */
const lum = (c: Rgb) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const WHITE: Rgb = [255, 255, 255];

const get = (b: keyof typeof BIZ, name: string): Rgb => {
  const v = BIZ[b].get(name);
  if (!v) throw new Error(`${b}: --${name} 없음`);
  return v;
};

/**
 * 태양광 틀 아래에서 그려지는 파일 — /solar 화면 · 같이 쓰는 화면(lib/biz SHARED_PATHS — 마지막 사업의 틀을 따른다) ·
 * 껍데기, 그리고 그것들이 부르는 components 를 끝까지 따라간 것.
 */
function solarRendered(): string[] {
  const under = 'app/(console)';
  const url = (page: string) => `/${urlSegmentsOf(page, under).join('/')}`;
  const roots = [SOLAR_ROOT, ...SHARED_PATHS];
  const pages = findFiles(under, 'page.tsx').filter((p) => roots.some((r) => url(p) === r || url(p).startsWith(`${r}/`)));
  const seen = new Set<string>();
  const todo = [...pages, 'components/ConsoleShell.tsx'];
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? normalize(join(dirname(from), spec)) : null;
    if (!base || !base.startsWith('components')) return null;
    return [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((f) => existsSync(f)) ?? null;
  };
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const [, spec] of readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
      const hit = resolve(f, spec);
      if (hit && !seen.has(hit)) todo.push(hit);
    }
  }
  return [...seen].sort();
}

/** 글자 하나가 든 따옴표 조각 — 한 줄에 삼항의 두 갈래가 같이 있어도 갈래끼리 섞지 않는다 */
function chunkAround(line: string, at: number, len: number): string {
  const stop = /['"`{}]/;
  let a = at;
  while (a > 0 && !stop.test(line[a - 1])) a--;
  let b = at + len;
  while (b < line.length && !stop.test(line[b])) b++;
  return line.slice(a, b);
}

describe('사업 색 — 전기차 그린 · 태양광 귤색', () => {
  it('두 사업이 tailwind 가 읽는 변수를 다 채운다', () => {
    const used = [...readFileSync('tailwind.config.js', 'utf8').matchAll(/biz\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThanOrEqual(14);
    for (const b of ['ev', 'solar'] as const) {
      const missing = used.filter((v) => !BIZ[b].has(v));
      expect(missing, `${b} 에 없는 변수`).toEqual([]);
    }
    expect([...BIZ.solar.keys()].sort()).toEqual([...BIZ.ev.keys()].sort());
  });

  it.each(['ev', 'solar'] as const)('%s — 채운 자리의 글자와 흰 바탕 위 글자 단계(600~900)가 대비 4.5 이상', (b) => {
    const on = get(b, 'brand-on-fill');
    expect(contrast(on, get(b, 'brand-fill')), 'on-fill / fill').toBeGreaterThanOrEqual(4.5);
    expect(contrast(on, get(b, 'brand-fill-hover')), 'on-fill / fill-hover').toBeGreaterThanOrEqual(4.5);
    for (const step of [600, 700, 800, 900]) {
      expect(contrast(get(b, `brand-${step}`), WHITE), `brand-${step} / 흰 바탕`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('태양광 귤색은 흰 글자가 안 읽힌다 — 그래서 채운 자리의 글자가 진한 색이다', () => {
    expect(contrast(get('solar', 'brand-fill'), WHITE)).toBeLessThan(3);
    expect(lum(get('solar', 'brand-on-fill'))).toBeLessThan(0.05);
  });

  const files = solarRendered();

  it('태양광 틀 아래 파일을 찾았다 — /solar 화면 · 같이 쓰는 화면 · 부품', () => {
    for (const f of ['components/ui.tsx', 'components/solar/SiteForm.tsx', 'components/solar/Checker.tsx', 'components/AccountAdmin.tsx', 'components/NoticeBoard.tsx']) {
      expect(files, f).toContain(f);
    }
  });

  it('사업 색 바탕에 흰 글자를 손으로 적지 않는다 — fill · on-fill 을 쓴다', () => {
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/\btext-white\b/g)) {
          if (/\bbg-brand-\d{2,3}(?![\d/])/.test(chunkAround(line, m.index ?? 0, m[0].length))) bad.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('상태 초록(ok)은 사업 색으로 칠하지 않는다 — tailwind 의 ok', () => {
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*ok:\s*['"{]/.test(line) && /brand-/.test(line)) bad.push(`${f}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('껍데기가 사업을 data-biz 로 단다 — 첫 그림(뿌리 상자)과 <html>(body 로 나가는 창)', () => {
    const shell = readFileSync('components/ConsoleShell.tsx', 'utf8');
    expect(shell).toMatch(/data-biz=\{biz\}/);
    expect(shell).toMatch(/documentElement\.dataset\.biz = biz/);
  });
});

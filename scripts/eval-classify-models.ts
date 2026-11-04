/**
 * 접수 분류 모델 견주기 — 같은 접수 묶음을 모델마다 분류시켜 답을 맞춰 본다 (손으로 부르는 시험 — 돈이 든다).
 *
 *   npx tsx scripts/eval-classify-models.ts <폴더목록.json> [결과.json] [모델:강도,모델:강도,…]
 *
 * 폴더목록.json — 접수 묶음 하나가 든 폴더(이 Mac 의 실제 계약서류 · 저장소에 넣지 않는다): ["…/3510.역삼아이파크 계약서류", …]
 * 첫 모델이 기준(지금 쓰는 것)이다. 접수 ZIP 과 같은 길로 보낸다 — 폴더의 PDF 를 바로 세우고(방향 판정 한 번),
 * 같은 묶음을 모델마다 lib/claude classifyAndExtract 로. 견주는 것은 파일마다의 칸(category)과 화면에 채워지는 값이다.
 *
 * ★왜★ 분류는 접수 ZIP · PDF 분할이 쓰는 자리라 접수가 몰리면 가장 크게 커진다(2026-11-04 비용 검토). npm run check 에 넣지 않는다.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

const [listPath, outPath = 'eval-classify-results.json', modelArg] = process.argv.slice(2);
if (!listPath) throw new Error('폴더 목록(json)을 주세요');
const PICKS = (modelArg ?? 'claude-sonnet-4-6,claude-sonnet-5-5:low,claude-haiku-5-5:low').split(',').map((x) => {
  const [model, effort] = x.split(':');
  return { model, effort: effort as 'low' | 'medium' | 'high' | undefined };
});
const label = (p: { model: string; effort?: string }) => `${p.model.replace('claude-', '')}${p.effort ? `:${p.effort}` : ''}`;
const folders = JSON.parse(readFileSync(listPath, 'utf8')) as string[];

/** 화면에 채워지는 값 — 이 값들과 파일마다의 칸을 견준다 */
const FIELDS = ['현장명', '주소', 'CPO', '계약대수', '계약기간', '총주차면수', '건축물유형', '전력인입', '소재지', '사업구분', '현장담당자', '대표자', '현장연락처', '설치위치'] as const;
const squash = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, '') : Array.isArray(v) ? [...v].sort().join(',') : v);

async function main() {
  const { classifyAndExtract } = await import('../lib/claude');
  const { uprightPdfFiles } = await import('../lib/pdf-orient');
  const out: unknown[] = [];
  const score = new Map<string, { cat: number; cats: number; field: number; fields: number; fail: number }>();
  for (const dir of folders) {
    const names = readdirSync(dir).filter((f) => /\.pdf$/i.test(f) && statSync(join(dir, f)).size < 15e6);
    if (names.length === 0) continue;
    const pdfs = await uprightPdfFiles(
      names.map((n) => ({ name: n, buffer: readFileSync(join(dir, n)), hash: '', mimeType: 'application/pdf' })), 'eval'
    );
    const answers: Record<string, unknown> = {};
    for (const p of PICKS) {
      try {
        answers[label(p)] = await classifyAndExtract(pdfs, 'eval', p);
      } catch (e) {
        answers[label(p)] = { error: String((e as Error).message ?? e).slice(0, 200) };
      }
    }
    const ref = answers[label(PICKS[0])] as Record<string, unknown> & { files?: { originalName: string; category: string }[] };
    const catOf = (a: unknown) => new Map(((a as typeof ref)?.files ?? []).map((f) => [f.originalName, f.category]));
    const refCat = catOf(ref);
    console.log(`\n${dir.split('/').pop()} — ${names.length}개`);
    for (const p of PICKS.slice(1)) {
      const a = answers[label(p)] as typeof ref;
      const s = score.get(label(p)) ?? { cat: 0, cats: 0, field: 0, fields: 0, fail: 0 };
      if (!a || 'error' in a || !ref || 'error' in ref) { s.fail++; score.set(label(p), s); console.log(`  ${label(p)} 실패/기준 실패`); continue; }
      const cat = catOf(a);
      const lines: string[] = [];
      for (const [n, c] of refCat) { s.cats++; if (cat.get(n) === c) s.cat++; else lines.push(`칸 ${n}: ${c} → ${cat.get(n) ?? '(없음)'}`); }
      for (const f of FIELDS) {
        s.fields++;
        if (JSON.stringify(squash(ref[f])) === JSON.stringify(squash(a[f]))) s.field++;
        else lines.push(`${f}: ${JSON.stringify(ref[f])} → ${JSON.stringify(a[f])}`);
      }
      score.set(label(p), s);
      console.log(`  ${label(p)} ${lines.length ? `✗${lines.length}` : '✓'}`);
      for (const l of lines) console.log(`    ${l}`);
    }
    out.push({ dir, names, answers });
    writeFileSync(outPath, JSON.stringify(out, null, 2));
  }
  console.log('\n모델별 — 기준과 같은 칸 · 같은 값 · 실패');
  for (const [m, s] of score) console.log(`  ${m.padEnd(20)} 칸 ${s.cat}/${s.cats} · 값 ${s.field}/${s.fields} · 실패 ${s.fail}`);
}

main().catch((e) => { console.error('[eval-classify]', e); process.exit(1); });

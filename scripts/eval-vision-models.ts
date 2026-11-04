/**
 * 판독 모델 견주기 — 같은 서류를 모델마다 읽혀 답을 맞춰 본다 (손으로 부르는 시험 — API 를 부르므로 돈이 든다).
 *
 *   npx tsx scripts/eval-vision-models.ts <표본.json> [결과.json] [모델,모델,…]
 *
 * 표본.json — 실제 서류 경로(이 Mac 의 파일 · 저장소에 넣지 않는다):
 *   [{ "route": "parking-check", "files": [{ "path": "…/건축물대장.pdf", "slot": "bldgreg" }, …] },
 *    { "route": "consult-dup", "files": [{ "path": "…/결과서.pdf" }] },
 *    { "route": "cpo-seal", "cpo": "현대엔지니어링", "files": [{ "path": "…/계약서.pdf" }] },
 *    { "route": "contract-date" | "rep-name" | "apply-facts", "files": [{ "path": "…" }] },
 *    { "route": "preinstall-check" | "preinstall-scan", "files": [{ "path": "…" }] },
 *    { "route": "reissue", "files": [{ "path": "…/계약서류.pdf" }] },             ← 재발행(lib/claude-import) — 값 칸만 견준다
 *    { "route": "partner-doc", "kind": "bizCert" | "bankbook", "files": [{ "path": "…" }] }]
 *
 * 첫 모델이 기준이다(지금 쓰는 것). 나머지 모델의 답이 기준과 다른 칸을 줄마다 찍는다 — 누가 맞는지는 사람이 서류를 열어
 * 가린다(기준도 틀릴 수 있다). 서류는 한 번만 바로 세우고(방향 판정) 모든 모델에 같은 묶음을 보낸다 — 입력이 같아야 견준다.
 *
 * ★왜 스크립트로 남기는가★ 모델을 바꾸면 판독이 조용히 나빠질 수 있다. 2026-11-04 비용 검토에서 이 자리(lib/vision-ask)가
 * 판독비의 대부분이었고, Opus 5.5 → Sonnet 5.5 는 절반, Haiku 5.5 는 1/40 값이다. 모델을 바꾸기 전에, 그리고 새 모델이 나오면
 * 이걸 다시 돌린다. npm run check 에 넣지 않는다(돈이 든다).
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { loadEnvFile } from '../lib/env-file';

loadEnvFile();

type Route =
  | 'parking-check' | 'consult-dup' | 'cpo-seal' | 'contract-date' | 'rep-name' | 'apply-facts'
  | 'preinstall-check' | 'preinstall-scan' | 'reissue' | 'partner-doc';
interface Sample { route: Route; cpo?: string; kind?: string; files: { path: string; slot?: string }[] }

const [manifest, outPath = 'eval-vision-results.json', modelArg] = process.argv.slice(2);
if (!manifest) throw new Error('표본 목록(json)을 주세요');
/** 「모델」 또는 「모델:강도」 — 강도는 판독 갈래(askPdfJson)에만 실린다 */
const MODELS = (modelArg ?? 'claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5').split(',');
const pickOf = (m: string) => {
  const [model, effort] = m.split(':');
  return { model, effort: effort as 'low' | 'medium' | 'high' | undefined };
};
const samples = JSON.parse(readFileSync(manifest, 'utf8')) as Sample[];

/** 견줄 때 공백·순서 차이는 같은 답으로 본다 */
function norm(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (Array.isArray(v)) return v.map(norm).map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'url').sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, norm(x)]));
  }
  return v;
}

/** 두 답에서 다른 칸 — 「경로: 기준 → 이 모델」 */
function diff(a: unknown, b: unknown, at = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((k) => diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k));
  }
  return [`${at || '(전체)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
}

async function main() {
  const { askPdfJson, preparePdfs } = await import('../lib/vision-ask');
  const { splitPdf } = await import('../lib/pdf-split');
  const { parkingPrompt, parkingReadsOf } = await import('../lib/parking-read');
  const { evidencePrompt, actsOf, scanPrompt, scansOf } = await import('../lib/legacy-evidence');
  const { sealPrompt, sealReadOf } = await import('../lib/cpo-seal');
  const { CONSULT_DUP_PROMPT, consultDupOf } = await import('../lib/consult-dup');
  const fr = await import('../lib/fact-read');
  const { extractFormFromPdf } = await import('../lib/claude-import');
  const { readPartnerDoc } = await import('../lib/claude-partner-doc');
  type Slot = Parameters<typeof parkingPrompt>[0][number]['slot'];

  /** 판독 갈래마다: 앞 몇 쪽만 · 물음 · 답 다듬기 */
  const SPEC: Record<Exclude<Route, 'reissue' | 'partner-doc'>, { pages?: number; tag: string; ask: (names: { name: string; slot: Slot }[], s: Sample) => string; parse: (raw: unknown, names: { name: string; slot: Slot }[]) => unknown }> = {
    'parking-check': { tag: 'parking-check', ask: (n) => parkingPrompt(n), parse: (r, n) => parkingReadsOf(r, n) },
    'consult-dup': { tag: 'consult-dup', ask: () => CONSULT_DUP_PROMPT, parse: (r) => consultDupOf(r) },
    'cpo-seal': { pages: 6, tag: 'cpo-seal', ask: (_n, s) => sealPrompt(s.cpo as Parameters<typeof sealPrompt>[0]), parse: (r) => ({ seal: sealReadOf(r).seal }) },
    'contract-date': { pages: 6, tag: 'contract-date', ask: () => fr.CONTRACT_PROMPT, parse: (r) => fr.contractReadOf(r) },
    'rep-name': { pages: 2, tag: 'rep-name', ask: () => fr.REP_NAME_PROMPT, parse: (r) => fr.repNameValuesOf(r) },
    'apply-facts': { pages: 2, tag: 'apply-facts', ask: () => fr.APPLY_PROMPT, parse: (r) => fr.applyReadOf(r) },
    'preinstall-check': { tag: 'preinstall-check', ask: (n) => evidencePrompt(n.map((x) => x.name)), parse: (r, n) => actsOf(r, n.map((x) => x.name)) },
    'preinstall-scan': { tag: 'preinstall-check', ask: (n) => scanPrompt(n.map((x) => x.name)), parse: (r, n) => scansOf(r, n.map((x) => x.name)) },
  };

  const results: { i: number; route: Route; files: string[]; answers: Record<string, unknown>; diffs: Record<string, string[]> }[] = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= samples.length) return;
      const s = samples[i];
      if (s.route === 'reissue' || s.route === 'partner-doc') {
        // 이 둘은 방향 판정·보내기를 자기 안에서 한다 — 모델마다 통째로 부른다
        const f = s.files[0];
        const buf = readFileSync(f.path);
        const answers: Record<string, unknown> = {};
        for (const m of MODELS) {
          try {
            answers[m] = norm(s.route === 'reissue'
              ? (await extractFormFromPdf({ pdf: buf, fileName: basename(f.path), model: pickOf(m).model })).fields
              : (await readPartnerDoc({ file: buf, mediaType: 'application/pdf', kind: s.kind as 'bizCert', model: pickOf(m).model })).fields);
          } catch (e) {
            answers[m] = { error: String((e as Error).message ?? e) };
          }
        }
        const diffs = Object.fromEntries(MODELS.slice(1).map((m) => [m, diff(answers[MODELS[0]], answers[m])]));
        results.push({ i, route: s.route, files: [basename(f.path)], answers, diffs });
        console.log(`#${i} ${s.route} [${basename(f.path)}] ${MODELS.slice(1).map((m) => `${m.replace('claude-', '')} ${diffs[m].length ? `✗${diffs[m].length}` : '✓'}`).join(' · ')}`);
        for (const m of MODELS.slice(1)) for (const d of diffs[m]) console.log(`    ${m.replace('claude-', '')}  ${d}`);
        continue;
      }
      const spec = SPEC[s.route];
      const raw = await Promise.all(s.files.map(async (f) => {
        const buf = readFileSync(f.path);
        return {
          name: basename(f.path),
          buffer: spec.pages && /\.pdf$/i.test(f.path)
            ? await splitPdf(buf, Array.from({ length: spec.pages }, (_, k) => k + 1)) : buf,
        };
      }));
      const { batches } = await preparePdfs(raw, spec.tag);
      if (batches.length !== 1) { console.log(`#${i} ${s.route} 묶음 ${batches.length}개 — 건너뜀`); continue; }
      const batch = batches[0];
      const named = batch.map((f) => ({
        name: f.name, slot: (s.files.find((x) => basename(x.path) === f.name)?.slot ?? 'bldgreg') as Slot,
      }));
      const answers: Record<string, unknown> = {};
      for (const m of MODELS) {
        try {
          answers[m] = norm(spec.parse(await askPdfJson(batch, spec.ask(named, s), spec.tag, pickOf(m)), named));
        } catch (e) {
          answers[m] = { error: String((e as Error).message ?? e) };
        }
      }
      const ref = answers[MODELS[0]];
      const diffs = Object.fromEntries(MODELS.slice(1).map((m) => [m, diff(ref, answers[m])]));
      results.push({ i, route: s.route, files: named.map((n) => n.name), answers, diffs });
      const tag = MODELS.slice(1).map((m) => `${m.replace('claude-', '')} ${diffs[m].length ? `✗${diffs[m].length}` : '✓'}`).join(' · ');
      console.log(`#${i} ${s.route} [${named.map((n) => n.name).join(' | ')}] ${tag}`);
      for (const m of MODELS.slice(1)) for (const d of diffs[m]) console.log(`    ${m.replace('claude-', '')}  ${d}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  results.sort((a, b) => a.i - b.i);
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  // 갈래 × 모델: 기준과 같은 답의 수
  const routes = [...new Set(results.map((r) => r.route))];
  console.log('\n갈래별 — 기준과 같은 답 / 표본');
  for (const r of routes) {
    const rows = results.filter((x) => x.route === r);
    console.log(`  ${r.padEnd(16)} ${MODELS.slice(1).map((m) => `${m.replace('claude-', '')} ${rows.filter((x) => x.diffs[m].length === 0).length}/${rows.length}`).join(' · ')}`);
  }
}

main().catch((e) => { console.error('[eval-vision]', e); process.exit(1); });

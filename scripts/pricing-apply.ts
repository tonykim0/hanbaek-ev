/**
 * 단가 케이스 반영 — 운영사 정책이 바뀌면 새 시기의 케이스를 넣고, 그 시기에 들어온 현장의 라인을 옮긴다.
 *
 *   npx tsx scripts/pricing-apply.ts --spec <파일.json>                    할 일만 보여준다
 *   npx tsx scripts/pricing-apply.ts --spec <파일.json> --apply            실제로 한다
 *   … --env ~/hanbaek-backups/.env.prod-db                                  운영 DB (기본은 .env.local = 개발)
 *
 * ★금액을 저장소에 두지 않는다★ — 운영사 영업정책은 대외비다(나이스 정책서 머리 「외부 유출을 엄격히 금합니다」).
 * 저장소가 공개라 케이스 정의를 이 파일에 적지 않고 JSON 으로 받는다 — 스크래치에 두고 반영한 뒤 지운다.
 * 반영한 뒤의 근거는 DB 의 케이스 행과 감사기록이다. (나이스 하반기 정의 lib/pricing-policy-nice-h2.ts 는 이 규칙
 * 전에 들어간 것이다.) 운영사 담당 에이전트는 단가표를 읽기만 한다 — 정책이 바뀌면 한백이 원자료를 주고
 * Claude Code 가 이 스크립트로 넣는다(CLAUDE.md 「운영사 담당 다섯의 기본 업무」).
 *
 * 하는 일 둘:
 *  ① cases — 새 케이스를 넣는다. 저장소 addPricingRule 이라 화면 「케이스 추가」와 같은 문 · 같은 감사기록이다.
 *     같은 칸 · 같은 적용 시작의 케이스가 이미 있으면 값이 같을 때 지나가고, 다르면 ★아무것도 쓰기 전에 멈춘다★.
 *  ② moves — 라인을 새 케이스로 옮긴다. 지급조건이 확정된 현장은 해제 → 단가 지정 → 정산 규칙(새 케이스의 기성
 *     단계) → 다시 확정 차례다 — 한백이 화면에서 누르는 차례 그대로라 감사기록이 넷 다 남는다. 라인의 지금
 *     케이스가 spec 의 from 과 다르면(그새 누가 바꿨으면) 그 현장은 건드리지 않는다.
 *
 * Spec:
 *   { "actor": "나이스 10/6 정책 반영",
 *     "cases": [{ "key": "sub-y10", ...NewPricingRule }],
 *     "moves": [{ "projectId": "HB-2026-241", "lineId": "HB-2026-241-L1", "from": "<지금 케이스 id>",
 *                 "to": "<cases 의 key 또는 케이스 id>" }] }
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from '../lib/env-file';

const argOf = (name: string): string | null => {
  const at = process.argv.indexOf(name);
  if (at < 0) return null;
  const v = process.argv[at + 1];
  if (!v || v.startsWith('--')) throw new Error(`${name} 뒤에 값이 없습니다.`);
  return v;
};
const ENV_FILE = argOf('--env') ?? '.env.local';
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
const SPEC_FILE = argOf('--spec');
if (!SPEC_FILE || !existsSync(SPEC_FILE)) throw new Error('--spec <파일.json> 이 필요합니다.');
const APPLY = process.argv.includes('--apply');

import { pgRepository as repo } from '../lib/data/pg-store';
import { checkPricingRule, duplicateOf, normalizePricingRule } from '../lib/pricing-match';
import { stepUnits } from '../lib/settlement';
import type { Actor, Viewer } from '../lib/auth/types';
import type { NewPricingRule, PricingRule, ProjectDetail } from '../types/project';

interface SpecCase extends NewPricingRule { key: string }
interface SpecMove { projectId: string; lineId: string; from: string; to: string }
interface Spec { actor: string; cases: SpecCase[]; moves: SpecMove[] }

const spec = JSON.parse(readFileSync(SPEC_FILE, 'utf8')) as Spec;
const ACTOR: Actor = { id: 'script', name: spec.actor, role: 'admin', org: null };
const HANBAEK: Viewer = { role: 'admin', org: null };

const won = (n: number) => n.toLocaleString('ko-KR');
const receiveOf = (r: Pick<NewPricingRule, 'salesUnit' | 'consUnit' | 'margin'>) => r.salesUnit + r.consUnit + r.margin;
const splitOf = (r: Pick<NewPricingRule, 'salesUnit' | 'consUnit' | 'margin'>) =>
  `받는 ${won(receiveOf(r))} = 영업 ${won(r.salesUnit)} + 시공 ${won(r.consUnit)} + 마진 ${won(r.margin)}`;

/** 같은 칸 · 같은 시작의 케이스가 이미 있을 때 — 넣으려던 값과 같은가. 다르면 사람이 볼 일이다 */
function sameCase(a: PricingRule, b: NewPricingRule): boolean {
  return a.salesUnit === b.salesUnit && a.consUnit === b.consUnit && a.margin === b.margin
    && a.caseName === b.caseName && (a.note ?? null) === (b.note ?? null);
}

async function main() {
  let host = '알 수 없음';
  try { host = new URL(process.env.DATABASE_URL ?? '').host; } catch { /* 호스트만 찍는다 — 못 읽으면 비워 둔다 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '— 반영' : '— 미리보기'}\n`);

  // ── ① 케이스 ─────────────────────────────────────────────────────────
  const existing = await repo.listPricingRules(ACTOR);
  const byId = new Map(existing.map((r) => [r.id, r]));
  const plan: Array<{ c: SpecCase; rule: NewPricingRule; have: PricingRule | null }> = [];
  for (const c of spec.cases) {
    const { key: _key, ...input } = c;
    const rule = normalizePricingRule(input);
    const bad = checkPricingRule(rule);
    if (bad.length > 0) throw new Error(`${c.key} — ${bad.join(' / ')}`);
    const dup = duplicateOf(rule, existing);
    if (dup && !sameCase(dup, rule)) {
      throw new Error(`${c.key} — 같은 칸 · 같은 시작에 다른 값의 케이스가 있습니다: ${dup.id} (${splitOf(dup)}). 아무것도 쓰지 않았습니다.`);
    }
    plan.push({ c, rule, have: dup });
  }

  console.log('■ 케이스');
  for (const { c, rule, have } of plan) {
    const first = stepUnits(rule.settlementSteps, receiveOf(rule));
    console.log(`  ${have ? '이미 있음' : APPLY ? '추가' : '넣을 것'}  ${rule.caseName}`);
    console.log(`      ${splitOf(rule)} · 기성 ${first.map(won).join(' → ')}${rule.note ? ` · 부기 「${rule.note}」` : ''}  [${c.key}${have ? ` = ${have.id}` : ''}]`);
  }

  // ── ② 옮길 라인 — 지금 값을 다시 읽어 견준다 ─────────────────────────
  const details = new Map<string, ProjectDetail>();
  for (const m of spec.moves) {
    if (details.has(m.projectId)) continue;
    const d = await repo.getProject(m.projectId, HANBAEK);
    if (!d) throw new Error(`${m.projectId} 현장을 찾을 수 없습니다.`);
    details.set(m.projectId, d);
  }
  const caseOfTo = (to: string): NewPricingRule | PricingRule | null =>
    plan.find((p) => p.c.key === to)?.rule ?? byId.get(to) ?? null;

  console.log('\n■ 라인');
  const skip = new Set<string>();
  for (const m of spec.moves) {
    const d = details.get(m.projectId)!;
    const line = d.lines.find((l) => l.id === m.lineId);
    const to = caseOfTo(m.to);
    const from = byId.get(m.from) ?? null;
    if (!line || !to || !from) {
      console.log(`  ✗ ${m.projectId} ${m.lineId} — ${!line ? '라인 없음' : !to ? `옮길 케이스 ${m.to} 없음` : `지금 케이스 ${m.from} 없음`} · 건너뜀`);
      skip.add(m.projectId);
      continue;
    }
    if (line.pricingRuleId !== m.from) {
      console.log(`  ✗ ${m.projectId} ${d.project.name} — 지금 케이스가 ${line.pricingRuleId}(spec 은 ${m.from}) · 건너뜀`);
      skip.add(m.projectId);
      continue;
    }
    const q = line.qty;
    const dRecv = (receiveOf(to) - receiveOf(from)) * q;
    const dSales = (to.salesUnit - from.salesUnit) * q;
    const dCons = (to.consUnit - from.consUnit) * q;
    console.log(`  ${m.projectId} ${d.project.name} · ${line.termYears}년 ${q}기`);
    console.log(`      ${from.caseName}  →  ${'caseName' in to ? to.caseName : m.to}`);
    console.log(`      받는 단가 ${won(receiveOf(from))} → ${won(receiveOf(to))} (기성 ${dRecv >= 0 ? '+' : ''}${won(dRecv)}) · 영업비 ${dSales >= 0 ? '+' : ''}${won(dSales)} · 시공비 ${dCons >= 0 ? '+' : ''}${won(dCons)} · 지급조건 확정 ${d.project.payoutTermsConfirmedAt ?? '전'}`);
  }

  if (!APPLY) {
    console.log('\n— 미리보기 — 실제로 하려면 --apply');
    return;
  }

  // ── 반영 ─────────────────────────────────────────────────────────────
  const idOfKey = new Map<string, string>();
  for (const { c, rule, have } of plan) {
    idOfKey.set(c.key, have ? have.id : await repo.addPricingRule(rule, ACTOR));
  }
  const after = new Map((await repo.listPricingRules(ACTOR)).map((r) => [r.id, r]));
  const idOf = (to: string) => idOfKey.get(to) ?? to;

  console.log('\n■ 반영');
  const failed: string[] = [];
  for (const [projectId, d] of details) {
    if (skip.has(projectId)) continue;
    const moves = spec.moves.filter((m) => m.projectId === projectId);
    const targets = moves.map((m) => after.get(idOf(m.to)));
    if (targets.some((t) => !t)) { failed.push(`${projectId} 옮길 케이스를 찾지 못함`); continue; }
    const settles = new Set(targets.map((t) => t!.defaultSettlementRuleId));
    if (settles.size !== 1) { failed.push(`${projectId} 라인마다 기성 단계가 달라 정산 규칙을 하나로 못 정함`); continue; }
    const settle = [...settles][0];
    const wasLocked = d.project.payoutTermsConfirmedAt !== null;
    try {
      if (wasLocked) await repo.setPayoutTermsConfirmed(projectId, false, ACTOR);
      for (const m of moves) await repo.setLinePricing(m.lineId, idOf(m.to), ACTOR);
      await repo.setSettlementRule(projectId, settle, ACTOR);
      if (wasLocked) await repo.setPayoutTermsConfirmed(projectId, true, ACTOR);
      console.log(`  ✓ ${projectId} ${d.project.name}`);
    } catch (err) {
      /* 반쯤 간 현장을 풀린 채 두지 않는다 — 잠겨 있던 현장이면 다시 잠그고 사람에게 넘긴다 */
      if (wasLocked) await repo.setPayoutTermsConfirmed(projectId, true, ACTOR).catch(() => undefined);
      failed.push(`${projectId} ${d.project.name} — ${(err as Error).message}`);
    }
  }

  // 다시 읽어 확인한다 — 화면이 보는 것과 같은 조립(getProject)으로
  console.log('\n■ 다시 읽음');
  for (const projectId of details.keys()) {
    const d = await repo.getProject(projectId, HANBAEK);
    if (!d) continue;
    for (const l of d.lines) {
      const r = l.pricingRuleId ? after.get(l.pricingRuleId) : null;
      console.log(`  ${projectId} ${d.project.name} · ${l.termYears}년 ${l.qty}기 · ${r ? `${r.caseName} (${splitOf(r)})` : '단가 미지정'} · 정산 규칙 ${d.project.settlementRuleId} · 지급조건 확정 ${d.project.payoutTermsConfirmedAt ?? '전'}`);
    }
  }
  if (failed.length > 0) {
    console.log(`\n★못 한 것 ${failed.length}건★`);
    for (const f of failed) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

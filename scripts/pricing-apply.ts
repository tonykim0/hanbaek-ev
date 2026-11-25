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
 * 하는 일 셋 — ★이 차례로 한다★(앞의 것이 뒤의 판정을 바꾼다):
 *  ① fixes — 있는 케이스를 고친다: 영업 · 시공 · 마진 나눔(한백이 마진을 다시 정할 때)과 설치위치 · 부기 · 이름.
 *     ★받는 단가가 바뀌면 멈춘다★ — 기성(운영사에게 받는 돈)은 정책이 정하고, 나눔은 한백이 정한다. 현장이 붙어
 *     있어도 고친다(한백 2026-09-04 「개정이란 없어 — 수정하는 게 맞아」, store/pricing updatePricingRule) — 붙은
 *     현장이 지급조건 확정이면 잠깐 풀고 고친 뒤 다시 확정한다. 붙은 현장의 계획이 그대로 따라온다(그것이 의도다).
 *     설치위치를 바꾸면 이름도 축에서 다시 짓는다(caseNameOf — 케이스 폼과 같은 이름). 붙은 현장의 설치위치가 반대면
 *     (실외 현장이 붙은 케이스를 실내로) 멈춘다. ★같은 시기에 실내 · 실외 케이스를 나란히 세우려면 여기서 지금
 *     케이스를 실내로 먼저 정한다★ — 구분 없는 케이스는 실외 칸도 덮어 ②가 중복으로 멈춘다.
 *  ② cases — 새 케이스를 넣는다. 저장소 addPricingRule 이라 화면 「케이스 추가」와 같은 문 · 같은 감사기록이다.
 *     like 를 주면 그 케이스(① 뒤의 모습)의 칸 · 글 · 기성 단계를 받아 적은 칸만 바꾼다. 이름을 안 적으면 축에서 짓는다.
 *     같은 칸 · 같은 적용 시작의 케이스가 이미 있으면 값이 같을 때 지나가고, 다르면 ★아무것도 쓰기 전에 멈춘다★.
 *     ★받는 단가가 같고 나눔(영업 · 시공 · 마진)만 다르면 나눔 갈래로 나란히 선다★(lib/pricing-match isSplitSibling —
 *     2026-11-25 현대 자체투자 — 마진이 다른 둘) — 갈래끼리 기성 단계가 같아야 하고, 같은 spec 안의 케이스끼리도 견준다.
 *  ③ moves — 라인을 새 케이스로 옮긴다. 지급조건이 확정된 현장은 해제 → 단가 지정 → 정산 규칙(새 케이스의 기성
 *     단계) → 다시 확정 차례다 — 한백이 화면에서 누르는 차례 그대로라 감사기록이 넷 다 남는다. 라인의 지금
 *     케이스가 spec 의 from 과 다르면(그새 누가 바꿨으면) 그 현장은 건드리지 않는다.
 *
 * Spec (셋 다 빼도 된다 · 고치기의 칸은 바꿀 것만):
 *   { "actor": "나이스 10/6 정책 반영",
 *     "fixes": [{ "id": "<케이스 id>", "salesUnit": 0, "consUnit": 0, "margin": 0,
 *                 "installLoc": "실내" | "실외" | null, "note": "…" | null, "caseName": "…" }],
 *     "cases": [{ "key": "sub-y10", "like": "<케이스 id>", ...NewPricingRule (like 가 있으면 바꿀 칸만) }],
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
import { caseNameOf, checkPricingRule, duplicateOf, normalizePricingRule, splitSiblingsOf } from '../lib/pricing-match';
import { settlementStepsKeyOf, stepUnits } from '../lib/settlement';
import type { Actor, Viewer } from '../lib/auth/types';
import type { CaseLoc, LineAxes, NewPricingRule, PricingRule, ProjectDetail, SettlementStepRule } from '../types/project';

type SpecCase = Partial<NewPricingRule> & { key: string; like?: string };
interface SpecMove { projectId: string; lineId: string; from: string; to: string }
interface SpecFix {
  id: string;
  salesUnit?: number; consUnit?: number; margin?: number;
  installLoc?: CaseLoc | null; note?: string | null; caseName?: string;
}
interface Spec { actor: string; cases: SpecCase[]; moves: SpecMove[]; fixes: SpecFix[] }

const raw = JSON.parse(readFileSync(SPEC_FILE, 'utf8')) as Partial<Spec> & { actor: string };
const spec: Spec = { actor: raw.actor, cases: raw.cases ?? [], moves: raw.moves ?? [], fixes: raw.fixes ?? [] };
const ACTOR: Actor = { id: 'script', name: spec.actor, role: 'admin', org: null };
const HANBAEK: Viewer = { role: 'admin', org: null };

const won = (n: number) => n.toLocaleString('ko-KR');
const signed = (n: number) => `${n >= 0 ? '+' : ''}${won(n)}`;
const receiveOf = (r: Pick<NewPricingRule, 'salesUnit' | 'consUnit' | 'margin'>) => r.salesUnit + r.consUnit + r.margin;
const splitOf = (r: Pick<NewPricingRule, 'salesUnit' | 'consUnit' | 'margin'>) =>
  `받는 ${won(receiveOf(r))} = 영업 ${won(r.salesUnit)} + 시공 ${won(r.consUnit)} + 마진 ${won(r.margin)}`;
const locOf = (loc: PricingRule['installLoc'] | undefined) => loc ?? '구분 없음';

/** 같은 칸 · 같은 시작의 케이스가 이미 있을 때 — 넣으려던 값과 같은가. 다르면 사람이 볼 일이다 */
function sameCase(a: PricingRule, b: NewPricingRule): boolean {
  return a.salesUnit === b.salesUnit && a.consUnit === b.consUnit && a.margin === b.margin
    && a.caseName === b.caseName && (a.note ?? null) === (b.note ?? null) && a.installLoc === (b.installLoc ?? null);
}

async function main() {
  let host = '알 수 없음';
  try { host = new URL(process.env.DATABASE_URL ?? '').host; } catch { /* 호스트만 찍는다 — 못 읽으면 비워 둔다 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '— 반영' : '— 미리보기'}\n`);

  const existing = await repo.listPricingRules(ACTOR);
  const byId = new Map(existing.map((r) => [r.id, r]));
  const settles = new Map((await repo.listSettlementRules(ACTOR)).map((s) => [s.id, s]));
  const stepsOf = (r: PricingRule): SettlementStepRule[] => {
    if (!r.defaultSettlementRuleId) return [];
    const s = settles.get(r.defaultSettlementRuleId);
    if (!s) throw new Error(`${r.id} — 기성 단계 ${r.defaultSettlementRuleId} 를 찾지 못했습니다.`);
    return s.steps;
  };
  /** 저장된 케이스를 「넣을 때의 모양」으로 — 고치기 · like 의 바탕. 기성 단계도 같이 넘긴다(같은 정산 규칙을 다시 찾는다) */
  const inputOf = (r: PricingRule): NewPricingRule => {
    const { id: _id, active: _active, defaultSettlementRuleId: _settle, ...rest } = r;
    return { ...rest, settlementSteps: stepsOf(r) };
  };

  // ── ① 고치기 — 받는 단가가 그대로인지 · 붙은 현장의 설치위치와 맞는지 보고, 붙은 현장과 그 현장의 지급을 찍는다 ──
  const fixPlan: Array<{ cur: PricingRule; input: NewPricingRule; refs: LineAxes[] }> = [];
  const fixSites = new Map<string, ProjectDetail>();
  const axes = spec.fixes.length > 0 ? await repo.listLineAxes(ACTOR) : [];
  const unchanged: PricingRule[] = [];
  for (const f of spec.fixes) {
    const cur = byId.get(f.id);
    if (!cur) throw new Error(`${f.id} — 없는 케이스입니다. 아무것도 쓰지 않았습니다.`);
    const money = { salesUnit: f.salesUnit ?? cur.salesUnit, consUnit: f.consUnit ?? cur.consUnit, margin: f.margin ?? cur.margin };
    if (![money.salesUnit, money.consUnit, money.margin].every(Number.isInteger)) throw new Error(`${f.id} — 금액은 원 단위 정수입니다.`);
    if (receiveOf(money) !== receiveOf(cur)) {
      throw new Error(`${f.id} — 받는 단가가 ${won(receiveOf(cur))} → ${won(receiveOf(money))} 로 바뀝니다. 나눔만 고치는 자리라 멈춥니다. 아무것도 쓰지 않았습니다.`);
    }
    const installLoc = f.installLoc === undefined ? cur.installLoc : f.installLoc;
    const draft: NewPricingRule = { ...inputOf(cur), ...money, installLoc, note: f.note === undefined ? cur.note : f.note };
    /* 이름은 축에서 유도된다 — 설치위치가 바뀌면 다시 짓고, 아니면 지금 이름 그대로(적었으면 그것) */
    const input = normalizePricingRule({
      ...draft, caseName: f.caseName ?? (installLoc !== cur.installLoc ? caseNameOf(draft) : cur.caseName),
    });
    const bad = checkPricingRule(input);
    if (bad.length > 0) throw new Error(`${f.id} — ${bad.join(' / ')}`);
    const changed = input.salesUnit !== cur.salesUnit || input.consUnit !== cur.consUnit || input.margin !== cur.margin
      || input.installLoc !== cur.installLoc || (input.note ?? null) !== (cur.note ?? null) || input.caseName !== cur.caseName;
    if (!changed) { unchanged.push(cur); continue; }
    const refs = axes.filter((a) => a.pricingRuleId === f.id);
    /* 「실내·실외」 · 미지정 현장은 어느 쪽 케이스든 붙는다 — 반대로 정해진 현장만 어긋남이다 */
    const clash = input.installLoc
      ? refs.filter((a) => (a.installLoc === '실내' || a.installLoc === '실외') && a.installLoc !== input.installLoc)
      : [];
    if (clash.length > 0) {
      throw new Error(`${f.id} — 설치위치를 ${input.installLoc} 로 정하면 붙은 현장과 어긋납니다: ${clash.map((a) => `${a.projectId} ${a.projectName}(${a.installLoc})`).join(' · ')}. 그 라인을 먼저 옮기세요. 아무것도 쓰지 않았습니다.`);
    }
    fixPlan.push({ cur, input, refs });
    for (const r of refs) {
      if (fixSites.has(r.projectId)) continue;
      const d = await repo.getProject(r.projectId, HANBAEK);
      if (d) fixSites.set(r.projectId, d);
    }
  }
  /* ① 뒤의 케이스 목록 — ②의 like · 중복 판정과 ③의 견줌은 이것을 본다 */
  const afterFix: PricingRule[] = existing.map((r) => {
    const p = fixPlan.find((x) => x.cur.id === r.id);
    if (!p) return r;
    const { settlementSteps: _steps, ...rest } = p.input;
    return { ...r, ...rest, installLoc: p.input.installLoc ?? null };
  });
  const afterFixById = new Map(afterFix.map((r) => [r.id, r]));
  // 저장소도 같은 판정을 하지만 하나를 고친 뒤에 멈추면 반쯤 간다 — 쓰기 전에 다 본다
  for (const { cur } of fixPlan) {
    const me = afterFixById.get(cur.id)!;
    if (!me.active) continue;
    const dup = duplicateOf(me, afterFix.filter((r) => r.id !== cur.id));
    if (dup) throw new Error(`${cur.id} — 고치면 ${dup.id}(${dup.caseName}) 와 같은 칸 · 같은 시작이 됩니다. 아무것도 쓰지 않았습니다.`);
  }

  if (spec.fixes.length > 0) {
    console.log('■ 고치기');
    for (const cur of unchanged) console.log(`  바뀌는 것 없음 — 지나감  ${cur.caseName}  [${cur.id}]`);
    for (const { cur, input, refs } of fixPlan) {
      console.log(`  ${cur.caseName}  [${cur.id}]`);
      if (input.caseName !== cur.caseName) console.log(`   →  이름 ${input.caseName}`);
      if (input.installLoc !== cur.installLoc) console.log(`      설치위치 ${locOf(cur.installLoc)} → ${locOf(input.installLoc)}`);
      if ((input.note ?? null) !== (cur.note ?? null)) console.log(`      부기 「${cur.note ?? ''}」 → 「${input.note ?? ''}」`);
      if (input.salesUnit !== cur.salesUnit || input.consUnit !== cur.consUnit || input.margin !== cur.margin) {
        console.log(`      ${splitOf(cur)}`);
        console.log(`   →  ${splitOf(input)}`);
      }
      if (refs.length === 0) console.log('      붙은 현장 0곳');
      for (const r of refs) {
        const d = fixSites.get(r.projectId);
        const dSales = (input.salesUnit - cur.salesUnit) * r.qty;
        const dCons = (input.consUnit - cur.consUnit) * r.qty;
        const paid = d?.payoutEntries ?? [];
        const money = dSales !== 0 || dCons !== 0
          ? ` · 영업비 ${signed(dSales)}${dCons !== 0 ? ` · 시공비 ${signed(dCons)}` : ''}`
          : '';
        console.log(`      ${r.projectId} ${r.projectName} · ${r.termYears}년 ${r.qty}기 · 설치위치 ${r.installLoc ?? '미지정'}${money} · 지급조건 확정 ${d?.project.payoutTermsConfirmedAt ?? '전'}`);
        if (money) {
          console.log(`          원장 ${paid.length === 0 ? '0건' : paid.map((e) => `${e.kind} ${e.category}${e.step && !e.category.includes(`${e.step}차`) ? ` ${e.step}차` : ''} ${won(e.amount)} (${e.at})`).join(' · ')}`);
        }
      }
    }
  }

  // ── ② 케이스 ─────────────────────────────────────────────────────────
  const plan: Array<{ c: SpecCase; rule: NewPricingRule; have: PricingRule | null; siblings: PricingRule[] }> = [];
  /*
   * 이 spec 이 넣을 케이스도 다음 케이스의 견줌에 든다 — 같은 칸에 나눔 갈래 둘을 한 번에 넣는 일이 있다
   * (2026-11-25 현대엔지니어링 자체투자 11/18 — 받는 단가 하나에 마진 둘). 그전에는 spec 안끼리는 안 봐서
   * 둘째를 넣다 저장소가 멈추면 첫째만 들어간 채 반쯤 갔다.
   */
  const planned: PricingRule[] = [];
  const plannedSteps = new Map<string, SettlementStepRule[]>();
  const stepsKeyOf = (r: PricingRule) => settlementStepsKeyOf(plannedSteps.get(r.id) ?? stepsOf(r));
  for (const c of spec.cases) {
    const { key: _key, like, ...fields } = c;
    let base: Partial<NewPricingRule> = {};
    if (like) {
      const src = afterFixById.get(like);
      if (!src) throw new Error(`${c.key} — like 케이스 ${like} 가 없습니다.`);
      /* 이름은 받지 않는다 — 축에서 다시 짓는다(실외 케이스가 실내 이름을 달고 서지 않게) */
      const { caseName: _name, ...rest } = inputOf(src);
      base = rest;
      /* 고정 금액 기성 단계는 받는 단가가 다르면 그대로 옮길 수 없다 — 사람이 단계를 적는다 */
      const recv = receiveOf({ ...rest, ...fields } as NewPricingRule);
      if (!fields.settlementSteps && recv !== receiveOf(src) && rest.settlementSteps.some((s) => s.basis.kind === '고정')) {
        throw new Error(`${c.key} — ${like} 의 기성 단계에 고정 금액이 있어 받는 단가 ${won(recv)} 에 그대로 못 옮깁니다. settlementSteps 를 적어 주세요.`);
      }
    }
    const merged = { ...base, ...fields } as NewPricingRule;
    const norm = normalizePricingRule({ ...merged, caseName: merged.caseName ?? '' });
    const rule = merged.caseName ? norm : { ...norm, caseName: caseNameOf(norm) };
    const bad = checkPricingRule(rule);
    if (bad.length > 0) throw new Error(`${c.key} — ${bad.join(' / ')}`);
    const pool = [...afterFix, ...planned];
    const dup = duplicateOf(rule, pool);
    if (dup && plannedSteps.has(dup.id)) {
      throw new Error(`${c.key} — 이 spec 의 ${dup.id} 와 같은 칸 · 같은 시작에 겹칩니다(나눔이 같거나 받는 단가가 다름). 아무것도 쓰지 않았습니다.`);
    }
    if (dup && !sameCase(dup, rule)) {
      throw new Error(`${c.key} — 같은 칸 · 같은 시작에 다른 값의 케이스가 있습니다: ${dup.id} ${dup.caseName} (${splitOf(dup)}). 아무것도 쓰지 않았습니다.`);
    }
    /* 나눔 갈래는 기성 단계가 같아야 한다 — 저장소도 본다(store/pricing assertSiblingSettle) · 반쯤 쓰기 전에 여기서 */
    const siblings = splitSiblingsOf(rule, pool);
    const off = siblings.find((s) => stepsKeyOf(s) !== settlementStepsKeyOf(rule.settlementSteps));
    if (off) {
      throw new Error(`${c.key} — 나눔 갈래 ${off.id}(${off.caseName}) 와 기성 단계가 다릅니다 — 받는 차례는 운영사 정책 하나입니다. 아무것도 쓰지 않았습니다.`);
    }
    plan.push({ c, rule, have: dup, siblings });
    if (!dup) {
      const id = `(${c.key})`;
      planned.push({ ...rule, id, active: true, defaultSettlementRuleId: '', installLoc: rule.installLoc ?? null });
      plannedSteps.set(id, rule.settlementSteps);
    }
  }

  if (plan.length > 0) {
    console.log('\n■ 케이스');
    for (const { c, rule, have, siblings } of plan) {
      const first = stepUnits(rule.settlementSteps, receiveOf(rule));
      console.log(`  ${have ? '이미 있음' : APPLY ? '추가' : '넣을 것'}  ${rule.caseName}`);
      console.log(`      ${splitOf(rule)} · 기성 ${first.map(won).join(' → ')} · 설치위치 ${locOf(rule.installLoc)}${rule.note ? ` · 부기 「${rule.note}」` : ''}  [${c.key}${have ? ` = ${have.id}` : ''}]`);
      if (siblings.length > 0) console.log(`      나눔 갈래 ${siblings.map((s) => `${s.id} (${splitOf(s)})`).join(' · ')}`);
    }
  }

  // ── ③ 옮길 라인 — 지금 값을 다시 읽어 견준다 ─────────────────────────
  const details = new Map<string, ProjectDetail>();
  for (const m of spec.moves) {
    if (details.has(m.projectId)) continue;
    const d = await repo.getProject(m.projectId, HANBAEK);
    if (!d) throw new Error(`${m.projectId} 현장을 찾을 수 없습니다.`);
    details.set(m.projectId, d);
  }
  const caseOfTo = (to: string): NewPricingRule | PricingRule | null =>
    plan.find((p) => p.c.key === to)?.rule ?? afterFixById.get(to) ?? null;

  const skip = new Set<string>();
  if (spec.moves.length > 0) console.log('\n■ 라인');
  for (const m of spec.moves) {
    const d = details.get(m.projectId)!;
    const line = d.lines.find((l) => l.id === m.lineId);
    const to = caseOfTo(m.to);
    const from = afterFixById.get(m.from) ?? null;
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
    const toLoc = to.installLoc ?? null;
    const siteLoc = d.project.installLoc;
    console.log(`  ${m.projectId} ${d.project.name} · ${line.termYears}년 ${q}기 · ${line.powerType} · 설치위치 ${siteLoc ?? '미지정'}`);
    console.log(`      ${from.caseName}  →  ${to.caseName}`);
    console.log(`      받는 단가 ${won(receiveOf(from))} → ${won(receiveOf(to))} (기성 ${signed((receiveOf(to) - receiveOf(from)) * q)}) · 영업비 ${signed((to.salesUnit - from.salesUnit) * q)} · 시공비 ${signed((to.consUnit - from.consUnit) * q)} · 지급조건 확정 ${d.project.payoutTermsConfirmedAt ?? '전'}`);
    if (toLoc && (siteLoc === '실내' || siteLoc === '실외') && siteLoc !== toLoc) {
      console.log(`      ★설치위치 어긋남★ 현장은 ${siteLoc}인데 케이스는 ${toLoc} — 건너뜀`);
      skip.add(m.projectId);
    }
  }

  if (!APPLY) {
    console.log('\n— 미리보기 — 실제로 하려면 --apply');
    return;
  }

  // ── 반영 ─────────────────────────────────────────────────────────────
  console.log('\n■ 반영');
  const failed: string[] = [];

  // ① 고치기 — 붙은 현장 중 잠긴 곳을 다 풀고, 고치고, 무엇이 깨져도 다시 잠근다
  if (fixPlan.length > 0) {
    const locked = [...fixSites.values()].filter((d) => d.project.payoutTermsConfirmedAt !== null);
    const unlocked: string[] = [];
    try {
      for (const d of locked) {
        await repo.setPayoutTermsConfirmed(d.project.id, false, ACTOR);
        unlocked.push(d.project.id);
      }
      for (const { cur, input } of fixPlan) {
        await repo.updatePricingRule(cur.id, input, ACTOR);
        console.log(`  ✓ 고침 ${input.caseName} — ${splitOf(input)} · 설치위치 ${locOf(input.installLoc)}`);
      }
    } catch (err) {
      failed.push(`고치기 — ${(err as Error).message}`);
    } finally {
      for (const id of unlocked) {
        await repo.setPayoutTermsConfirmed(id, true, ACTOR)
          .catch((e) => failed.push(`${id} 다시 확정 못 함 — ${(e as Error).message}`));
      }
    }
    if (failed.length > 0) {
      /* ①이 덜 됐는데 ②로 가면 구분 없는 케이스와 겹쳐 멈추거나, 틀린 칸에 새 케이스가 선다 */
      console.log(`\n★못 한 것 ${failed.length}건 — 케이스 · 라인은 하지 않았다★`);
      for (const f of failed) console.log(`  ${f}`);
      process.exitCode = 1;
      return;
    }
  }

  // ② 케이스
  const idOfKey = new Map<string, string>();
  for (const { c, rule, have } of plan) {
    const id = have ? have.id : await repo.addPricingRule(rule, ACTOR);
    idOfKey.set(c.key, id);
    if (!have) console.log(`  ✓ 추가 ${rule.caseName}  [${id}]`);
  }
  const after = new Map((await repo.listPricingRules(ACTOR)).map((r) => [r.id, r]));
  const idOf = (to: string) => idOfKey.get(to) ?? to;

  // ③ 라인
  for (const [projectId, d] of details) {
    if (skip.has(projectId)) continue;
    const moves = spec.moves.filter((m) => m.projectId === projectId);
    const targets = moves.map((m) => after.get(idOf(m.to)));
    if (targets.some((t) => !t)) { failed.push(`${projectId} 옮길 케이스를 찾지 못함`); continue; }
    const settleIds = new Set(targets.map((t) => t!.defaultSettlementRuleId));
    if (settleIds.size !== 1) { failed.push(`${projectId} 라인마다 기성 단계가 달라 정산 규칙을 하나로 못 정함`); continue; }
    const settle = [...settleIds][0];
    const wasLocked = d.project.payoutTermsConfirmedAt !== null;
    try {
      if (wasLocked) await repo.setPayoutTermsConfirmed(projectId, false, ACTOR);
      for (const m of moves) await repo.setLinePricing(m.lineId, idOf(m.to), ACTOR);
      await repo.setSettlementRule(projectId, settle, ACTOR);
      if (wasLocked) await repo.setPayoutTermsConfirmed(projectId, true, ACTOR);
      console.log(`  ✓ 옮김 ${projectId} ${d.project.name}`);
    } catch (err) {
      /* 반쯤 간 현장을 풀린 채 두지 않는다 — 잠겨 있던 현장이면 다시 잠그고 사람에게 넘긴다 */
      if (wasLocked) await repo.setPayoutTermsConfirmed(projectId, true, ACTOR).catch(() => undefined);
      failed.push(`${projectId} ${d.project.name} — ${(err as Error).message}`);
    }
  }

  // 다시 읽어 확인한다 — 케이스는 목록에서, 현장은 화면이 보는 것과 같은 조립(getProject)으로
  console.log('\n■ 다시 읽음');
  for (const id of [...fixPlan.map((p) => p.cur.id), ...idOfKey.values()]) {
    const r = after.get(id);
    console.log(`  케이스 ${id} — ${r ? `${r.caseName} · ${splitOf(r)} · 설치위치 ${locOf(r.installLoc)}${r.note ? ` · 부기 「${r.note}」` : ''}` : '없음'}`);
  }
  for (const [projectId, d] of fixSites) if (!details.has(projectId)) details.set(projectId, d);
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

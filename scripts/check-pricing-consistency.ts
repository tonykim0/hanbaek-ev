/**
 * 단가표가 스스로 일치하는가 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-pricing-consistency.ts --env <파일>
 *
 * 한백 물음 2026-09-18 「지금 단가표와 케이스는 모두 일치해?」. 네 가지를 잰다.
 *
 *  ① 케이스의 기본 정산 규칙 합이 받는 단가와 같은가 (checkSettlementSteps — 케이스를 만들 때
 *     쓰는 그 검사 그대로). 「고정」 단계만으로 짜인 규칙은 단가를 고쳐도 안 따라오므로 여기서 벌어진다.
 *  ② 기본 정산 규칙이 아예 없는 케이스 — 그 케이스를 붙인 현장은 기성 차수가 안 선다.
 *  ③ 케이스 이름이 축과 어긋나는가 — 이름은 저장된 글자라 축을 고쳐도 안 따라온다.
 *     매트릭스 줄은 살아 있는 축으로 그리고 케이스 목록은 이름을 그대로 보여주므로,
 *     둘이 갈리면 같은 케이스가 한 화면에서 두 얼굴이 된다.
 *  ④ 막힌 라인 / 닿을 수 없는 활성 케이스 — 전 운영사로 본다(check-blocked-lines 와 같은 판정).
 *
 * 현장별 「기성 계획 vs 받는 단가」는 scripts/check-settlement-drift.ts 가 따로 잰다 — 이쪽은
 * ★케이스 자체★가 일치하는가고, 저쪽은 ★그 케이스를 붙인 현장★이 일치하는가다.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) throw new Error('--env 뒤에 파일 이름이 없습니다.');
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { pgRepository } from '../lib/data/pg-store';
import { checkSettlementSteps, turnkeyUnit } from '../lib/settlement';
import { matchingRules } from '../lib/pricing-match';
import { normalizeRepl, replTypesOf } from '../types/project';
import type { Actor } from '../lib/auth/types';
import type { CpoName, PricingRule } from '../types/project';

const ACTOR: Actor = { id: 'script', name: '단가 일치 점검', role: 'admin', org: null };

/** 이름에 적힌 연수 — 「7년」·「7·10년」·「7년/10년」을 다 받는다 */
function termsInName(name: string): Set<number> {
  const out = new Set<number>();
  for (const m of name.matchAll(/(\d+(?:\s*[·/]\s*\d+)*)\s*년/g)) {
    for (const part of m[1].split(/[·/]/)) {
      const n = Number(part.trim());
      if (Number.isInteger(n)) out.add(n);
    }
  }
  return out;
}

/*
 * ★한백이 보고 「그대로 두라」 한 것들★ (2026-09-18, 어긋남 18건을 하나씩 본 자리).
 * 어긋난 것이 아니라 뜻이 있는 표기다 — 검사가 계속 울면 진짜 어긋남이 묻힌다.
 */
const ALLOW = new Map<string, string>([
  ['everon-y5-mother-new-apt', '올해 정책변경이 없어 시기를 안 적는다'],
  ['everon-y5-kepco-new-apt', '올해 정책변경이 없어 시기를 안 적는다'],
  ['everon-y7-mother-new-apt', '올해 정책변경이 없어 시기를 안 적는다'],
  ['everon-y7-kepco-new-apt', '올해 정책변경이 없어 시기를 안 적는다'],
  ['everon-y10-mother-new-apt', '올해 정책변경이 없어 시기를 안 적는다'],
  ['everon-y10-kepco-new-apt', '올해 정책변경이 없어 시기를 안 적는다'],
  ['pl-h1-gconly-y7-mother-new-apt', '딱 그 한 가지라 축을 따로 안 적는다'],
]);

/**
 * 「(상반기)」·「(하반기)」도 적용 시작 표기로 받는다 — 현대엔지니어링은 날짜가 아니라
 * 반기로 부른다(한백 2026-09-18 「상반기 하반기로 구분해줘」). 반기가 실제 시작 달과
 * 맞을 때만 인정한다 — 하반기 케이스에 「(상반기)」가 적혀 있으면 그것은 진짜 어긋남이다.
 */
function halfMatches(caseName: string, startDate: string): boolean {
  const m = /(\d{1,2})\s*월/.exec(startDate);
  if (!m) return false;
  const half = Number(m[1]) <= 6 ? '상반기' : '하반기';
  return caseName.includes(`(${half})`);
}

/** 이름이 축과 어긋나는 자리들 — 확실한 것만 본다(이름 꼴은 손으로 적은 것이 섞여 있다) */
function nameGaps(r: PricingRule): string[] {
  const gaps: string[] = [];
  if (!r.caseName.startsWith(r.cpo)) gaps.push(`운영사(${r.cpo})로 시작하지 않는다`);
  if (!r.caseName.includes(r.startDate) && !halfMatches(r.caseName, r.startDate)) {
    gaps.push(`적용 시작(${r.startDate})이 이름에 없다`);
  }

  const inName = termsInName(r.caseName);
  const missing = r.termYears.filter((t) => !inName.has(t));
  /* 이름에만 있는 연수는 축에 없는 해를 말하는 것이다 — 더 위험하다 */
  const extra = [...inName].filter((t) => !r.termYears.includes(t) && [5, 7, 10].includes(t));
  if (missing.length > 0) gaps.push(`축의 연수 ${missing.join('·')}년이 이름에 없다`);
  if (extra.length > 0) gaps.push(`이름의 연수 ${extra.join('·')}년이 축에 없다`);

  /* 「모자분리/한전불입」처럼 둘 다 적은 이름은 통과시킨다 — 옛 겸용 표기다 */
  const bothPower = r.caseName.includes('모자분리') && r.caseName.includes('한전불입');
  if (!bothPower && !r.caseName.includes(r.powerType)) {
    gaps.push(`수전방식(${r.powerType})이 이름에 없다`);
  }
  return gaps;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  const [rules, axes, settleRules] = await Promise.all([
    pgRepository.listPricingRules(ACTOR),
    pgRepository.listLineAxes(ACTOR),
    pgRepository.listSettlementRules(ACTOR),
  ]);
  const byId = new Map(settleRules.map((s) => [s.id, s]));
  const live = rules.filter((r) => r.active);
  console.log(`케이스 ${rules.length}건 (사용 ${live.length} · 중지 ${rules.length - live.length}) · 라인 ${axes.length}건\n`);

  let bad = 0;

  // ① 기본 정산 규칙의 합이 받는 단가와 같은가
  const sumOff: string[] = [];
  const noRule: string[] = [];
  for (const r of live) {
    const total = turnkeyUnit(r);
    if (total === null) continue;
    if (!r.defaultSettlementRuleId) { noRule.push(`   · ${r.id}  ${r.caseName}`); continue; }
    const rule = byId.get(r.defaultSettlementRuleId);
    if (!rule) { noRule.push(`   · ${r.id}  기본 규칙 ${r.defaultSettlementRuleId} 가 표에 없다`); continue; }
    const errs = checkSettlementSteps(rule.steps, total);
    if (errs.length > 0) sumOff.push(`   · ${r.id}  [${rule.name}]\n     ${errs.join(' / ')}`);
  }
  console.log(`① 기본 정산 규칙 합 ↔ 받는 단가 — 어긋남 ${sumOff.length}건`);
  for (const s of sumOff) console.log(s);
  bad += sumOff.length;

  console.log(`\n② 기본 정산 규칙이 없는 케이스 — ${noRule.length}건`);
  for (const s of noRule) console.log(s);

  // ③ 이름 ↔ 축
  const nameOff: string[] = [];
  const allowed: string[] = [];
  for (const r of live) {
    const gaps = nameGaps(r);
    if (gaps.length === 0) continue;
    const why = ALLOW.get(r.id);
    if (why) allowed.push(`   · ${r.id} — ${why}`);
    else nameOff.push(`   · ${r.id}\n     이름 「${r.caseName}」\n     ${gaps.join(' / ')}`);
  }
  console.log(`\n③ 케이스 이름 ↔ 축 — 어긋남 ${nameOff.length}건`);
  for (const s of nameOff) console.log(s);
  bad += nameOff.length;
  if (allowed.length > 0) {
    console.log(`   (한백이 보고 그대로 두기로 한 것 ${allowed.length}건)`);
    for (const s of allowed) console.log(s);
  }

  // ④ 막힌 라인 · 닿을 수 없는 케이스
  const blocked = axes.filter((l) => {
    if (l.pricingRuleId) return false;
    return matchingRules(
      { cpo: l.cpo, bizType: l.bizType, replType: l.projectReplType, bldgType: l.bldgType },
      { termYears: l.termYears, powerType: l.powerType, replType: l.lineReplType },
      rules
    ).exact.length === 0;
  });
  const stranded = live.filter((r) =>
    !replTypesOf(r.cpo as CpoName).includes(r.replType)
    || normalizeRepl(r.cpo as CpoName, r.replType) !== r.replType);
  console.log(`\n④ 막힌 라인 ${blocked.length}건 · 새 라인이 닿을 수 없는 활성 케이스 ${stranded.length}건`);
  for (const l of blocked) console.log(`   · 막힘: ${l.projectName} · ${l.cpo} · ${l.termYears}년`);
  for (const r of stranded) console.log(`   · 못 닿음: ${r.id} (${r.replType})`);
  bad += blocked.length + stranded.length;

  console.log(bad === 0 ? '\n★전부 일치한다★' : `\n★맞춰야 할 것 ${bad}건★`);
  process.exit(0);
}

void main();

/**
 * 플러그링크 2026년 9월 1일 정책의 마이그레이션 SQL 을 찍는다 (0058 생성기).
 *
 *   npx tsx scripts/print-pl-2609-sql.ts > migrations/0058_pl-2609-policy.sql
 *
 * 값·근거는 lib/pricing-policy-pl-2609.ts 한 곳이다. 여기서는 SQL 모양만 만든다.
 * 정산 규칙(settlement_rules)을 먼저 심고 그 뒤에 케이스를 넣는다 — 케이스가 규칙을
 * 참조하므로 순서가 뒤집히면 FK 위반으로 파일 전체가 롤백된다(러너는 파일 단위 트랜잭션).
 */
import { pl2609Rules, PL_2609_START } from '../lib/pricing-policy-pl-2609';
import { checkPricingRule } from '../lib/pricing-match';
import { settlementRuleIdOf, settlementRuleNameOf, settlementStepsKeyOf, turnkeyUnit } from '../lib/settlement';
import type { NewPricingRule, SettlementStepRule } from '../types/project';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));
const j = (v: unknown | null) => (v === null ? 'null' : `'${JSON.stringify(v)}'::jsonb`);

const rules = pl2609Rules();

/* 값 검사 — 걸리면 SQL 을 안 찍고 죽는다. 케이스는 참조되면 불변이라 저장 전이 유일한 방어다 */
const bad = rules.flatMap((r) => checkPricingRule(r).map((m) => `${r.caseName}: ${m}`));
if (bad.length > 0) {
  console.error('검증 실패 — SQL 을 찍지 않습니다:\n' + bad.join('\n'));
  process.exit(1);
}
/* 이 벌은 여섯이다 — 손으로 적은 id 가 하나라도 겹치면 on conflict 로 조용히 사라진다 */
if (rules.length !== 6 || new Set(rules.map((r) => r.id)).size !== 6) {
  console.error(`케이스가 여섯이 아닙니다 (${rules.length}개, 고유 id ${new Set(rules.map((r) => r.id)).size}개)`);
  process.exit(1);
}

/* 정산 규칙 — 단계가 같으면 한 행을 같이 쓴다. 연동 둘은 7/1 벌이 심은 st-1p2t3w8 로 모인다 */
const settles = new Map<string, SettlementStepRule[]>();
for (const r of rules) settles.set(settlementRuleIdOf(r.settlementSteps), r.settlementSteps);

console.log('-- 플러그링크 2026년 9월 1일 정책 — 보조금 +50만(마진 30만) · 연동 120/140만 (한백 지시 2026-09-06)');
console.log('-- lib/pricing-policy-pl-2609.ts 에서 생성 — 손으로 고치지 마세요');
console.log(`--
-- ★여섯 개뿐이다★ — 「보조금 4 + 연동 2 만 변경하고 나머지는 그대로」(한백). 자체투자와
-- 상업시설 보조금은 금액이 안 바뀌어 새로 세우지 않는다. 9월 이후 그 계약은 「2026년 7월 1일
-- ~ 8월 31일」 케이스를 그대로 쓴다 — 금액은 맞고 화면의 기간만 어긋난다.
--
-- 옛 벌은 걷지 않는다 — 케이스는 참조되면 불변이고, 계약일이 8월 31일 이전인 현장은 그 단가가
-- 정본이다. 시기가 갈리는 것은 적용 시작이 한다(lib/pricing-match startKey → 2026-09-01).
--
-- 분해: 받는 단가 = 영업비 + 시공비 + 마진. 보조금은 시공 95만 고정 · 마진 30만(20→30 인상) ·
-- 나머지 영업비. 연동은 시공 0 · 마진 20만 · 나머지 영업비.
--
-- 멱등: insert 는 on conflict (id) do nothing 이다. 두 번째 실행은 아무것도 안 바꾼다.`);
console.log('');

console.log('-- ── 1. 정산 규칙 — 케이스가 참조하므로 먼저 심는다 ──');
for (const [id, steps] of settles) {
  console.log(`-- ${settlementStepsKeyOf(steps)}`);
  console.log(`insert into settlement_rules (id, name, steps, note, active)
values ('${id}', ${q(settlementRuleNameOf(steps))}, '${JSON.stringify(steps)}'::jsonb, null, true)
on conflict (id) do nothing;\n`);
}

console.log('-- ── 2. 케이스 여섯 ──');
for (const r of rules) {
  const turnkey = turnkeyUnit(r) as number;
  console.log(`-- ${r.caseName} (받는 단가 ${turnkey / 10_000}만 = 영업 ${(r.salesUnit as number) / 10_000} + 시공 ${(r.consUnit as number) / 10_000} + 마진 ${(r.margin as number) / 10_000})`);
  console.log(insertSql(r, r.id, settlementRuleIdOf(r.settlementSteps)));
}

console.log(`-- ── 3. 검산 — 조용한 실패를 막는다 ──
--
-- 검사는 이 파일이 쓴 여섯·다섯에만 겨눈다. 「플러그링크 9월 케이스 전부」로 세면 뒤에 사람이
-- 화면에서 만든 케이스 하나가 프로덕션 배포를 통째로 막는다(러너는 실패하면 빌드를 죽인다).
--
-- ★합이 아니라 분해를 본다★ — 받는 단가만 견주면 이번 지시의 핵심인 「마진 20 → 30만」이
-- 틀려도 통과한다. 영업 175 / 시공 95 / 마진 20 도 합은 290만이다: 대당 10만이 한백 몫에서
-- 영업비로 조용히 넘어가고, 지급이 한 번 돌면 지급조건이 잠겨 케이스도 못 고친다.
do $$
declare bad int;
begin
  select count(*) into bad
    from (values
${rules.map((r) => `      ('${r.id}', ${r.salesUnit}, ${r.consUnit}, ${r.margin}, '${settlementRuleIdOf(r.settlementSteps)}')`).join(',\n')}
    ) as want(id, sales_unit, cons_unit, margin, rule)
    left join pricing_rules p on p.id = want.id
   where p.id is null
      or p.sales_unit is distinct from want.sales_unit
      or p.cons_unit is distinct from want.cons_unit
      or p.margin is distinct from want.margin
      or p.default_settlement_rule_id is distinct from want.rule
      or not p.active;
  if bad > 0 then
    raise exception '9월 벌 %건이 안 들어갔거나 분해·기성이 다릅니다 — 원장이 빈 DB 에 다시 도는 중이고 그 사이 사람이 /pricing 에서 고쳤다면 화면 값이 정본이다(이 파일이 아니라)', bad;
  end if;

  -- 규칙 다섯의 단계가 이 파일이 넣으려던 것과 같은가.
  -- id 는 단계의 해시라 보통 같다. 겹치는 순간 insert 가 조용히 건너뛰고 남의 단계를 든
  -- 규칙이 케이스에 걸리는데, 그때 틀리는 것은 화면에도 로그에도 안 나오는 돈이다.
  -- (연동 둘이 쓰는 st-1p2t3w8 은 0053 이 심은 행이라 이 파일의 insert 가 0행이다 — 그래서
  --  더욱 여기서 봐야 한다. FK 는 「그 id 의 행이 있다」까지만 보장한다.)
  select count(*) into bad
    from (values
${[...settles].map(([id, steps]) => `      ('${id}', '${JSON.stringify(steps)}'::jsonb)`).join(',\n')}
    ) as want(id, steps)
    join settlement_rules r on r.id = want.id
   where r.steps <> want.steps;
  if bad > 0 then
    raise exception '정산 규칙 %건의 단계가 이 파일과 다릅니다 — 해시가 겹쳤을 수 있습니다', bad;
  end if;
end $$;`);

function insertSql(r: NewPricingRule, id: string, settleId: string): string {
  return `insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  '${id}', ${q(r.caseName)}, ${q(r.cpo)}, ${q(r.bizType)}, ${q(r.powerType)},
  '${JSON.stringify(r.termYears)}'::jsonb, ${j(r.bldgTypes)}, ${q(r.replType)}, ${q(r.channel)},
  ${r.bizYear}, ${q(r.startDate)}, ${r.salesUnit}, ${r.consUnit}, ${r.margin},
  '${settleId}',
  ${q(r.supervisionBearer)}, ${q(r.safetyFeeBearer)}, ${q(r.note)}, true,
  ${q(r.supplyItems)}, ${j(r.promo)}, ${j(r.promoExtend)}, ${n(r.chargeRate)},
  ${q(r.installTerms)}, ${q(r.otherSupport)}, ${q(r.coexistTerms)}, ${q(r.miscTerms)}
) on conflict (id) do nothing;\n`;
}

console.error(`검산(찍힌 SQL 밖) — 적용 시작 ${PL_2609_START} · 케이스 ${rules.length} · 새 규칙 후보 ${settles.size}`);
for (const r of rules) {
  console.error(`  ${r.id.padEnd(28)} ${String((turnkeyUnit(r) as number) / 10_000).padStart(4)}만  ${settlementRuleNameOf(r.settlementSteps)}`);
}

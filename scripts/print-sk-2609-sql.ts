/**
 * SK일렉링크 2026-09-01 정책 케이스의 마이그레이션 SQL 을 찍는다.
 *
 *   npx tsx scripts/print-sk-2609-sql.ts [--with-kepco-fix] > migrations/00NN_sk-2609-policy.sql
 *
 * 값·근거는 lib/pricing-policy-sk-2609.ts. 찍기 전에 저장소와 같은 검증을 돌린다.
 *
 * ★조용히 실패하지 않는다★ (감사 H4 — pl-2609 SQL 이 `on conflict do nothing` 으로 11건 중 5건을
 * 소리 없이 건너뛸 뻔했다). 여기서는 둘로 막는다:
 *   ① id 는 손 이름(sk-2609-…)이라 어느 축과도 겹칠 수 없다 — DB 의 taken 을 읽을 필요가 없다.
 *   ② insert 는 `on conflict (id) do update` — 다시 돌려도 같은 값이 앉는다(멱등)이고, 건너뛰지 않는다.
 *      맨 끝의 검산 블록이 여덟 id 의 금액을 다시 읽어 하나라도 다르면 ★예외를 던져 빌드를 깨뜨린다★.
 *
 * --with-kepco-fix: 7/20 한전불입 케이스(sk-h2-y10-kepco-new)의 시공비 120 → 100 정정 update 를
 *   함께 찍는다. ★참조 라인에 소급되는 변경★이라 scripts/check-sk-cases.ts 로 참조·잠금을 본 뒤에만
 *   켠다(잠긴 현장이 참조하면 저장소 규칙대로 그 확정을 먼저 풀어야 한다).
 */
import { SK_H2_KEPCO_FIX, SK_LUMP_STEPS, SK_SUB_STEPS, sk2609Rules } from '../lib/pricing-policy-sk-2609';
import { checkPricingRule } from '../lib/pricing-match';
import { settlementStepsKeyOf } from '../lib/settlement';
import { SETTLEMENT_RULE_BY_ID } from '../lib/data/seed/settlement-rules';
import type { SettlementStepRule } from '../types/project';

const q = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v === null ? 'null' : String(v));
const j = (v: unknown | null) => (v === null ? 'null' : `'${JSON.stringify(v)}'::jsonb`);

const WITH_KEPCO_FIX = process.argv.includes('--with-kepco-fix');

const rules = sk2609Rules();
const bad = rules.flatMap((r) => checkPricingRule(r).map((m) => `${r.caseName}: ${m}`));
if (bad.length > 0) {
  console.error('검증 실패 — SQL 을 찍지 않습니다:\n' + bad.join('\n'));
  process.exit(1);
}

/*
 * 정산 규칙 — 새로 만들지 않는다. 보조는 sk-2step(착공 80만 → 잔액), 자투·연동은 lump-100
 * (준공 100%)과 같은 모양이라 그 id 를 그대로 가리킨다. 모양이 어긋나면 여기서 멈춘다 —
 * 해시 id 로 같은 규칙이 두 얼굴로 쌓이는 것을 막는다(print-link-h2-sql 과 같은 판단).
 */
function settleIdOf(steps: SettlementStepRule[]): string {
  const key = settlementStepsKeyOf(steps);
  for (const id of ['sk-2step', 'lump-100']) {
    const rule = SETTLEMENT_RULE_BY_ID.get(id);
    if (rule && settlementStepsKeyOf(rule.steps) === key) return id;
  }
  throw new Error(`정산 단계가 기존 규칙(sk-2step · lump-100)과 다릅니다 — ${key}`);
}
if (settleIdOf(SK_SUB_STEPS) !== 'sk-2step' || settleIdOf(SK_LUMP_STEPS) !== 'lump-100') {
  throw new Error('정산 규칙 매핑이 어긋납니다.');
}

console.log('-- SK일렉링크 2026-09-01 정책 (한백 지시 2026-09-10 · 적용 9/1 계약분)');
console.log('-- lib/pricing-policy-sk-2609.ts 에서 생성 — 손으로 고치지 마세요');
console.log('-- 7/20 케이스는 그대로 둔다(7/20~8/31 계약분이 참조) — 새 케이스 8건, 후보 목록은 늦게 시작한 것이 위다\n');

for (const r of rules) {
  const settle = settleIdOf(r.settlementSteps);
  console.log(`-- ${r.caseName} (총 ${r.total / 10_000}만 = 영업 ${r.salesUnit / 10_000} + 시공 ${r.consUnit / 10_000} + 마진 ${r.margin / 10_000} · 정산 ${settle})`);
  console.log(`insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  '${r.id}', ${q(r.caseName)}, ${q(r.cpo)}, ${q(r.bizType)}, ${q(r.powerType)},
  '${JSON.stringify(r.termYears)}'::jsonb, ${j(r.bldgTypes)}, ${q(r.replType)}, ${q(r.channel)},
  ${r.bizYear}, ${q(r.startDate)}, ${r.salesUnit}, ${r.consUnit}, ${r.margin},
  '${settle}',
  ${q(r.supervisionBearer)}, ${q(r.safetyFeeBearer)}, ${q(r.note)}, true,
  ${q(r.supplyItems)}, ${j(r.promo)}, ${j(r.promoExtend)}, ${n(r.chargeRate)},
  ${q(r.installTerms)}, ${q(r.otherSupport)}, ${q(r.coexistTerms)}, ${q(r.miscTerms)}
) on conflict (id) do update set
  case_name = excluded.case_name, cpo = excluded.cpo, biz_type = excluded.biz_type,
  power_type = excluded.power_type, term_years = excluded.term_years, bldg_types = excluded.bldg_types,
  repl_type = excluded.repl_type, channel = excluded.channel, biz_year = excluded.biz_year,
  start_date = excluded.start_date, sales_unit = excluded.sales_unit, cons_unit = excluded.cons_unit,
  margin = excluded.margin, default_settlement_rule_id = excluded.default_settlement_rule_id,
  supervision_bearer = excluded.supervision_bearer, safety_fee_bearer = excluded.safety_fee_bearer,
  note = excluded.note, active = true,
  supply_items = excluded.supply_items, promo = excluded.promo, promo_extend = excluded.promo_extend,
  charge_rate = excluded.charge_rate, install_terms = excluded.install_terms,
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;\n`);
}

if (WITH_KEPCO_FIX) {
  const { id, before, after } = SK_H2_KEPCO_FIX;
  console.log(`-- 7/20 한전불입 시공비 정정 — 120 → 100 (한백 확인 2026-09-10). 협력사 몫 220 은 그대로, 영업·시공 나눔만 바뀐다.
-- ★참조 라인에 소급된다★ — check-sk-cases.ts 로 참조·잠금을 본 뒤에 켠 것이다. 옛 값일 때만 고친다(멱등).
update pricing_rules
   set sales_unit = ${after.salesUnit}, cons_unit = ${after.consUnit}
 where id = '${id}' and sales_unit = ${before.salesUnit} and cons_unit = ${before.consUnit};\n`);
}

/*
 * 검산 — 여덟 id 의 금액이 정의와 다르면 예외를 던진다(빌드가 깨진다 = 배포가 멈춘다).
 * 「적용 N건」 만 보는 러너로는 조용한 실패를 못 잡는다 — 값을 다시 읽어 견준다.
 */
const expectRows = rules
  .map((r) => `('${r.id}', ${r.salesUnit}, ${r.consUnit}, ${r.margin})`)
  .join(',\n      ');
console.log(`-- 검산: 여덟 케이스의 금액이 정의와 같아야 한다 — 하나라도 다르면 마이그레이션이 실패한다
do $$
declare
  bad text;
begin
  select string_agg(e.id, ', ') into bad
    from (values
      ${expectRows}
    ) as e(id, sales, cons, margin)
    left join pricing_rules r on r.id = e.id
   where r.id is null or r.sales_unit <> e.sales or r.cons_unit <> e.cons or r.margin <> e.margin or not r.active;
  if bad is not null then
    raise exception 'SK 2609 케이스 금액 검산 실패: %', bad;
  end if;
end $$;`);

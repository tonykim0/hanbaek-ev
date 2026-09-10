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

/*
 * 두 마이그레이션으로 나뉜다 — 0069 는 9/1 케이스 8건(--기본), 0070 은 7/20 한전불입 정정만
 * (--kepco-fix-only). 한 파일에 같이 넣지 않은 이유: 8건은 먼저 확정됐고 정정은 참조 현장을 본 뒤
 * 한백이 따로 결정했다 — 결정이 갈린 것은 파일도 갈라야 「무엇이 언제 들어갔나」가 읽힌다.
 * --with-kepco-fix 는 둘을 한 번에 찍는 확인용이다.
 */
const WITH_KEPCO_FIX = process.argv.includes('--with-kepco-fix') || process.argv.includes('--kepco-fix-only');
const KEPCO_FIX_ONLY = process.argv.includes('--kepco-fix-only');

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

if (KEPCO_FIX_ONLY) {
  console.log('-- SK 하반기(7/20) 한전불입 케이스 시공비 정정 — 120 → 100 (한백 확인 2026-09-10)');
  console.log('-- lib/pricing-policy-sk-2609.ts(SK_H2_KEPCO_FIX) 에서 생성 — 손으로 고치지 마세요\n');
} else {
  console.log('-- SK일렉링크 2026-09-01 정책 (한백 지시 2026-09-10 · 적용 9/1 계약분)');
  console.log('-- lib/pricing-policy-sk-2609.ts 에서 생성 — 손으로 고치지 마세요');
  console.log('-- 7/20 케이스는 그대로 둔다(7/20~8/31 계약분이 참조) — 새 케이스 8건, 후보 목록은 늦게 시작한 것이 위다\n');
}

for (const r of KEPCO_FIX_ONLY ? [] : rules) {
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
  /*
   * 정정 한 줄에 셋이 같이 간다 — 값 · 감사기록 · 현장 메모.
   *
   * ★저장소의 문을 우회하는 자리다★ — updatePricingRule 은 잠긴(지급조건 확정) 현장이 참조하면
   * 거절하는데, 참조 4곳 중 3곳이 잠겨 있다. 한백이 실측을 보고 결정했다(2026-09-10): 네 현장
   * 모두 영업사 = 시공사(턴키)라 회사 몫은 한 푼도 안 바뀌고 영업비·시공비 칸 사이를 옮기는
   * 것뿐이다 — 잠금이 지키려던 「돈이 나간 뒤 계획이 바뀌는 사고」가 여기서는 일어나지 않는다.
   *
   * 그래도 문을 우회했으니 자취를 남긴다: audit_log 한 줄(저장소가 남기는 것과 같은 모양) +
   * 참조 현장마다 협력사 정산관리 메모 맨 위에 날짜 줄(한백 지시 「바뀐 내용에 대해서는 협력사
   * 정산관리 메모에 적어줘」). 메모 줄 꼴은 화면(PayNoteBox)과 같다 — 「YYYY-MM-DD 본문」, 최신이
   * 위. 현장 이름을 SQL 에 박지 않는다 — 배포 전에 라인이 하나 더 붙어도 빠지지 않게 참조로 고른다.
   * 옛 값일 때만 고치고 메모도 그때만 남긴다(다시 돌려도 두 번 안 적힌다 — 멱등).
   */
  const memo = `2026-09-10 SK 하반기 한전불입 케이스 정정 — 시공비 120만 → 100만, 영업비 100만 → 120만(기당). 노션 단가표 입력 오기를 바로잡음(한백 확인). 협력사 합계 220만/기는 그대로, 영업비·시공비 칸 사이 이동. 이미 나간 영업비 1차는 옛 기준이라 2차 잔액이 차액을 흡수함.`;
  console.log(`-- 7/20 한전불입 시공비 정정 — 120 → 100 (한백 확인 2026-09-10). 협력사 몫 220 은 그대로, 영업·시공 나눔만 바뀐다.
-- ★참조 라인에 소급된다★ — check-sk-cases.ts 로 참조·잠금을 본 뒤 한백이 결정했다(네 현장 다 턴키·회사 몫 불변).
-- 옛 값일 때만 고치고, 그때만 감사기록·현장 메모를 남긴다(멱등).
do $$
declare
  fixed int;
begin
  update pricing_rules
     set sales_unit = ${after.salesUnit}, cons_unit = ${after.consUnit}
   where id = '${id}' and sales_unit = ${before.salesUnit} and cons_unit = ${before.consUnit};
  get diagnostics fixed = row_count;
  if fixed = 0 then
    return;   -- 이미 고쳐졌거나 값이 다르다 — 두 번 적지 않는다
  end if;

  -- 감사기록 — 저장소(updatePricingRule)가 남기는 것과 같은 모양
  insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
  values (gen_random_uuid()::text, null, '마이그레이션 0070 (한백 확인 2026-09-10)', '단가 케이스 수정',
          '${id}', '영업 ${before.salesUnit / 10_000}만 · 시공 ${before.consUnit / 10_000}만', '영업 ${after.salesUnit / 10_000}만 · 시공 ${after.consUnit / 10_000}만 — 노션 오기 정정');

  -- 참조 현장의 협력사 정산관리 메모 맨 위에 한 줄 (settlements 행이 없는 현장은 만든다)
  insert into settlements (project_id, pay_note)
  select l.project_id, ${q(memo)}
    from contract_lines l
   where l.pricing_rule_id = '${id}'
  group by l.project_id
  on conflict (project_id) do update
     set pay_note = ${q(memo)} || case when coalesce(settlements.pay_note, '') = '' then '' else E'\\n' || settlements.pay_note end;
end $$;\n`);
}

/*
 * 검산 — 여덟 id 의 금액이 정의와 다르면 예외를 던진다(빌드가 깨진다 = 배포가 멈춘다).
 * 「적용 N건」 만 보는 러너로는 조용한 실패를 못 잡는다 — 값을 다시 읽어 견준다.
 * 정정만 찍는 모드(0070)에서는 뺀다 — 그 파일의 일이 아니다.
 */
if (KEPCO_FIX_ONLY) process.exit(0);
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

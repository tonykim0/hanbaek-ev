-- SK 자체투자 축을 다시 가른다 — 9/1 신규위치 케이스 둘 (한백 지시 2026-09-17)
--
-- 코드 쪽 짝은 types/project.ts 의 SPLITS_SELF_REPL 이다(거기 「왜」를 적었다). 요약하면:
-- 그 집합은 운영사만 보고 시기를 못 보는데, 9/1 정책이 「구분없이」라고 SK 를 빼 버리니
-- 9/1 ★이전★ 계약분까지 같이 눕었다. 7/20~8/31 은 제자리교체 150 과 신규위치 200·210 이
-- 실제로 갈리므로 새 라인이 50~60만 낮게 붙는다(한백이 잡았다).
--
-- 축을 늘 세워 두는 대신, ★값이 같은 시기는 케이스를 두 벌 둔다★ — 9/1 자투는 제자리교체와
-- 신규위치가 같은 220·230 이다. 그래야 고르는 사람이 사실대로 고르고도 막힌 라인이 안 생긴다.
-- 금액·조건은 같은 시기 제자리교체 케이스에서 그대로 들고 온다(id·이름·교체유형만 바꾼다) —
-- 두 벌이 갈라지지 않게 하는 가장 싼 방법이다.
--
-- 이름도 같이 손본다: SK 가 안 가르던 동안 만든 네 건은 「7년 자체투자」로 적혀 있는데,
-- 이제 화면이 「자체투자 (제자리교체)」로 부르므로 케이스 이름과 줄 이름이 어긋난다.

-- ── 9/1 신규위치 7년·10년 — 제자리교체를 그대로 베낀다 ───────────────────────
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
)
select
  replace(r.id, '-inplace-', '-move-'),
  'SK일렉링크 (2026년 9월 1일 ~ 12월 31일) | 전체 | '
    || (r.term_years ->> 0) || '년 자체투자 (신규위치) | 모자분리',
  r.cpo, r.biz_type, r.power_type, r.term_years, r.bldg_types,
  '자체투자 (신규위치)', r.channel,
  r.biz_year, r.start_date, r.sales_unit, r.cons_unit, r.margin, r.default_settlement_rule_id,
  r.supervision_bearer, r.safety_fee_bearer, r.note, true,
  r.supply_items, r.promo, r.promo_extend, r.charge_rate, r.install_terms, r.other_support,
  r.coexist_terms, r.misc_terms
  from pricing_rules r
 where r.id in ('sk-2609-y7-mother-inplace-both', 'sk-2609-y10-mother-inplace-both')
on conflict (id) do update set
  case_name = excluded.case_name, cpo = excluded.cpo, biz_type = excluded.biz_type,
  power_type = excluded.power_type, term_years = excluded.term_years, bldg_types = excluded.bldg_types,
  repl_type = excluded.repl_type, channel = excluded.channel, biz_year = excluded.biz_year,
  start_date = excluded.start_date, sales_unit = excluded.sales_unit, cons_unit = excluded.cons_unit,
  margin = excluded.margin, default_settlement_rule_id = excluded.default_settlement_rule_id,
  supervision_bearer = excluded.supervision_bearer, safety_fee_bearer = excluded.safety_fee_bearer,
  note = excluded.note, active = excluded.active, supply_items = excluded.supply_items,
  promo = excluded.promo, promo_extend = excluded.promo_extend,
  charge_rate = excluded.charge_rate, install_terms = excluded.install_terms,
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms,
  misc_terms = excluded.misc_terms;

-- ── 「자체투자」로만 적힌 이름에 괄호를 되살린다 ─────────────────────────────
-- 옛 글자일 때만 고친다(멱등) — 한백이 화면에서 따로 적었으면 그 글이 이긴다.
update pricing_rules
   set case_name = replace(case_name, '년 자체투자 |', '년 자체투자 (제자리교체) |')
 where id in (
   'sk-h2-y7-mother-inplace-both', 'sk-h2-y10-mother-inplace-both',
   'sk-2609-y7-mother-inplace-both', 'sk-2609-y10-mother-inplace-both'
 )
   and case_name like '%년 자체투자 |%';

-- 검산 — 새 두 건이 실제로 섰고, 제자리교체 짝과 금액이 같아야 한다.
-- ★「select … from 제자리교체」는 원본이 없으면 조용히 0행이 된다★ — 그것을 잡는 자리다.
do $$
declare
  bad text;
begin
  select string_agg(x.id, ', ') into bad
    from (values
      ('sk-2609-y7-mother-move-both',  'sk-2609-y7-mother-inplace-both'),
      ('sk-2609-y10-mother-move-both', 'sk-2609-y10-mother-inplace-both')
    ) as x(id, twin)
    left join pricing_rules m on m.id = x.id
    left join pricing_rules i on i.id = x.twin
   where m.id is null or i.id is null
      or not m.active
      or m.repl_type <> '자체투자 (신규위치)'
      or m.sales_unit <> i.sales_unit or m.cons_unit <> i.cons_unit or m.margin <> i.margin
      or m.term_years <> i.term_years or m.bldg_types <> i.bldg_types
      or m.start_date <> i.start_date or m.power_type <> i.power_type;
  if bad is not null then
    raise exception 'SK 9/1 신규위치 케이스 검산 실패: %', bad;
  end if;
end $$;

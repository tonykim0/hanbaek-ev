-- SK 자체투자 세 가지 (한백 지시 2026-09-17, SK 케이스 21건을 훑다가 나온 것)
--
-- ① 1/26~7/19 「자체투자 신규위치 · 공동주택」 두 칸의 분해를 바꾼다.
--      7년  190만 = 영업 85 + 시공 90 + 마진 15  →  190만 = 영업 ★70★ + 시공 100 + 마진 20
--      10년 200만 = 영업 95 + 시공 90 + 마진 15  →  200만 = 영업  80  + 시공 100 + 마진 20
--    ★받는 총액은 안 움직인다★ (한백 확인 2026-09-17 「7년은 190이야」) — 0076 의 머리말이
--    190/200 은 정책 원문과 한 줄씩 맞는다고 적어 두었고, 그 말이 맞다. 바뀌는 것은 ★속★이다:
--    시공비를 90 → 100 으로 올리고 마진을 15 → 20 으로 올린 만큼 영업비가 내려간다.
--    협력사 몫은 7년 175 → 170만(−5), 10년 185 → 180만(−5). 그만큼 한백 마진이 는다.
--
-- ② 7/20~8/31 「자체투자 신규위치」 두 칸도 같은 손질을 한다 (한백 지시 2026-09-17).
--      7년  200만 = 영업 90 + 시공 90 + 마진 20  →  200만 = 영업 80 + 시공 ★100★ + 마진 20
--      10년 210만 = 영업 100 + 시공 90 + 마진 20 →  210만 = 영업 90 + 시공 ★100★ + 마진 20
--    ★여기는 협력사 몫도 안 움직인다★ — 180 · 190 그대로고 영업비와 시공비 칸 사이 이동뿐이다.
--    받는 총액도, 한백 마진도 그대로다. ①과 달리 마진이 이미 20이었다.
--
-- ③ 7/20~8/31 에 「자체투자 제자리교체」 케이스가 통째로 빠져 있었다 — 그 시기 케이스 다섯은
--    환경부 신규 둘 · 연동 하나 · 자체투자 ★신규위치★ 둘뿐이다. 그런데 SK 는 제자리/신규위치를
--    안 가르는 운영사라(SPLITS_SELF_REPL 에 없다) 새로 들어오는 자체투자 라인은 전부 제자리교체로
--    눕는다 — 그 시기 계약분이 붙을 자리가 없다. 기존 제자리교체와 같은 구조로 채운다(한백 지시).
--      7·10년 150만 = 영업 50 + 시공 90 + 마진 10 · 공동주택 + 상업시설
--
--    ★조건 칸은 같은 시기 자체투자 케이스에서 그대로 들고 온다★ — 설치조건·기타는 그 시기
--    정책서의 글이라 케이스마다 다를 이유가 없다. 긴 한글을 옮겨 적지 않으므로 오타가 안 난다.
--    ★지급자재만 제자리교체의 것을 쓴다★ — 0076 이 밝힌 대로 자재를 가르는 것은 시기가 아니라
--    교체유형이다(제자리교체는 SK 본사가 스탠드·캐노피·분전함을 대준다).

-- ── ① 1/26~7/19 위치변경 공동주택 7년·10년 ──────────────────────────────────
-- 옛 값일 때만 고친다(멱등). 고쳤을 때만 감사기록·현장 메모를 남긴다.
-- 칸마다 값이 다르므로 values 를 붙여 한 문장으로 — 옛 값 셋이 다 맞아야 걸린다.
do $$
declare
  fixed int;
begin
  update pricing_rules r
     set sales_unit = v.sales, cons_unit = v.cons, margin = v.margin
    from (values
      ('sk-h1-y7-mother-move-apt-self',   700000, 1000000, 200000,  850000, 900000, 150000),
      ('sk-h1-y10-mother-move-apt-self',  800000, 1000000, 200000,  950000, 900000, 150000)
    ) as v(id, sales, cons, margin, old_sales, old_cons, old_margin)
   where r.id = v.id
     and r.sales_unit = v.old_sales and r.cons_unit = v.old_cons and r.margin = v.old_margin;
  get diagnostics fixed = row_count;
  if fixed = 0 then
    return;   -- 이미 고쳐졌거나 값이 다르다 — 두 번 적지 않는다
  end if;

  insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
  values (gen_random_uuid()::text, null, '마이그레이션 0078 (한백 지시 2026-09-17)', '단가 케이스 수정',
          'sk-h1-y7/y10-mother-move-apt-self',
          '7년 영업 85·시공 90·마진 15 (총 190) · 10년 영업 95·시공 90·마진 15 (총 200)',
          '7년 영업 70·시공 100·마진 20 (총 190) · 10년 영업 80·시공 100·마진 20 (총 200) — 받는 총액은 그대로');

  insert into settlements (project_id, pay_note)
  select l.project_id, '2026-09-17 SK 상반기 자체투자 위치변경(공동주택) 케이스 조정 — 받는 단가(7년 190만 · 10년 200만)는 그대로이고 속이 바뀜: 기당 시공비 90만 → 100만, 한백 마진 15만 → 20만, 영업비는 그만큼 내려감(7년 85만 → 70만 · 10년 95만 → 80만). 협력사 몫은 기당 5만 줄어듦. 이미 나간 영업비 1차는 옛 기준이라 2차 잔액이 차액을 흡수함.'
    from contract_lines l
   where l.pricing_rule_id in ('sk-h1-y7-mother-move-apt-self', 'sk-h1-y10-mother-move-apt-self')
  group by l.project_id
  on conflict (project_id) do update
     set pay_note = '2026-09-17 SK 상반기 자체투자 위치변경(공동주택) 케이스 조정 — 받는 단가(7년 190만 · 10년 200만)는 그대로이고 속이 바뀜: 기당 시공비 90만 → 100만, 한백 마진 15만 → 20만, 영업비는 그만큼 내려감(7년 85만 → 70만 · 10년 95만 → 80만). 협력사 몫은 기당 5만 줄어듦. 이미 나간 영업비 1차는 옛 기준이라 2차 잔액이 차액을 흡수함.' || case when coalesce(settlements.pay_note, '') = '' then '' else E'\n' || settlements.pay_note end;
end $$;

-- ── ② 7/20~8/31 위치변경 7년·10년 — 영업↔시공 이동만 ────────────────────────
do $$
declare
  fixed int;
begin
  update pricing_rules r
     set sales_unit = v.sales, cons_unit = v.cons
    from (values
      ('sk-h2-y7-mother-move-apt-self',   800000, 1000000,  900000, 900000),
      ('sk-h2-y10-mother-move-apt-self',  900000, 1000000, 1000000, 900000)
    ) as v(id, sales, cons, old_sales, old_cons)
   where r.id = v.id
     and r.sales_unit = v.old_sales and r.cons_unit = v.old_cons;
  get diagnostics fixed = row_count;
  if fixed = 0 then
    return;
  end if;

  insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
  values (gen_random_uuid()::text, null, '마이그레이션 0078 (한백 지시 2026-09-17)', '단가 케이스 수정',
          'sk-h2-y7/y10-mother-move-apt-self',
          '7년 영업 90·시공 90 (총 200) · 10년 영업 100·시공 90 (총 210)',
          '7년 영업 80·시공 100 · 10년 영업 90·시공 100 — 받는 총액·마진·협력사 몫 전부 그대로');

  insert into settlements (project_id, pay_note)
  select l.project_id, '2026-09-17 SK 7/20~8/31 자체투자 위치변경 케이스 조정 — 기당 시공비 90만 → 100만, 영업비는 그만큼 내려감(7년 90만 → 80만 · 10년 100만 → 90만). 받는 단가(200만·210만)·한백 마진(20만)·협력사 합계(180만·190만)는 그대로이고, 영업비와 시공비 칸 사이 이동뿐임. 이미 나간 영업비 1차는 옛 기준이라 2차 잔액이 차액을 흡수함.'
    from contract_lines l
   where l.pricing_rule_id in ('sk-h2-y7-mother-move-apt-self', 'sk-h2-y10-mother-move-apt-self')
  group by l.project_id
  on conflict (project_id) do update
     set pay_note = '2026-09-17 SK 7/20~8/31 자체투자 위치변경 케이스 조정 — 기당 시공비 90만 → 100만, 영업비는 그만큼 내려감(7년 90만 → 80만 · 10년 100만 → 90만). 받는 단가(200만·210만)·한백 마진(20만)·협력사 합계(180만·190만)는 그대로이고, 영업비와 시공비 칸 사이 이동뿐임. 이미 나간 영업비 1차는 옛 기준이라 2차 잔액이 차액을 흡수함.' || case when coalesce(settlements.pay_note, '') = '' then '' else E'\n' || settlements.pay_note end;
end $$;

-- ── ③ 7/20~8/31 자체투자 제자리교체 7년 ──────────────────────────────────────
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
)
select
  'sk-h2-y7-mother-inplace-both',
  'SK일렉링크 (2026년 7월 20일 ~ 8월 31일) | 전체 | 7년 자체투자 | 모자분리',
  cpo, biz_type, power_type,
  '[7]'::jsonb, '["공동주택","상업시설"]'::jsonb, '자체투자 (제자리교체)', channel,
  biz_year, start_date, 500000, 900000, 100000, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, null, true,
  '스탠드 · 캐노피 · 분전함 별도 지급 (SK 본사 지원)',
  promo, promo_extend, charge_rate, install_terms, other_support, coexist_terms, misc_terms
  from pricing_rules where id = 'sk-h2-y7-mother-move-apt-self'
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

-- ── ③ 7/20~8/31 자체투자 제자리교체 10년 ─────────────────────────────────────
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
)
select
  'sk-h2-y10-mother-inplace-both',
  'SK일렉링크 (2026년 7월 20일 ~ 8월 31일) | 전체 | 10년 자체투자 | 모자분리',
  cpo, biz_type, power_type,
  '[10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '자체투자 (제자리교체)', channel,
  biz_year, start_date, 500000, 900000, 100000, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, null, true,
  '스탠드 · 캐노피 · 분전함 별도 지급 (SK 본사 지원)',
  promo, promo_extend, charge_rate, install_terms, other_support, coexist_terms, misc_terms
  from pricing_rules where id = 'sk-h2-y10-mother-move-apt-self'
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

-- 검산 — 네 케이스가 뜻한 값이어야 한다. 하나라도 다르면 빌드가 깨져 배포가 멈춘다.
-- ★새 두 건은 「select … from 옛 케이스」라 원본이 없으면 조용히 0행이 들어간다★ — 그 조용한
-- 실패를 잡는 것이 여기다(감사 H4).
do $$
declare
  bad text;
begin
  select string_agg(e.id, ', ') into bad
    from (values
      ('sk-h1-y7-mother-move-apt-self',   700000, 1000000, 200000),   -- 총 190
      ('sk-h1-y10-mother-move-apt-self',  800000, 1000000, 200000),   -- 총 200
      ('sk-h2-y7-mother-move-apt-self',   800000, 1000000, 200000),   -- 총 200
      ('sk-h2-y10-mother-move-apt-self',  900000, 1000000, 200000),   -- 총 210
      ('sk-h2-y7-mother-inplace-both',    500000,  900000, 100000),   -- 총 150
      ('sk-h2-y10-mother-inplace-both',   500000,  900000, 100000)    -- 총 150
    ) as e(id, sales, cons, margin)
    left join pricing_rules r on r.id = e.id
   where r.id is null or r.sales_unit <> e.sales or r.cons_unit <> e.cons
      or r.margin <> e.margin or not r.active;
  if bad is not null then
    raise exception 'SK 자체투자 케이스 검산 실패: %', bad;
  end if;
end $$;

-- 새 두 건의 시기·축도 검산한다 — 금액만 맞고 시기가 옛 케이스에서 안 따라왔으면 뜻이 없다.
do $$
declare
  bad text;
begin
  select string_agg(r.id, ', ') into bad
    from pricing_rules r
   where r.id in ('sk-h2-y7-mother-inplace-both', 'sk-h2-y10-mother-inplace-both')
     and (r.start_date <> '2026년 7월 20일 ~ 8월 31일'
          or r.repl_type <> '자체투자 (제자리교체)'
          or r.bldg_types <> '["공동주택","상업시설"]'::jsonb);
  if bad is not null then
    raise exception 'SK 7/20 제자리교체 케이스의 시기·축 검산 실패: %', bad;
  end if;
end $$;

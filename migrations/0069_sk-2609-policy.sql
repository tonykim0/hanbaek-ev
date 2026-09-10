-- SK일렉링크 2026-09-01 정책 (한백 지시 2026-09-10 · 적용 9/1 계약분)
-- lib/pricing-policy-sk-2609.ts 에서 생성 — 손으로 고치지 마세요
-- 7/20 케이스는 그대로 둔다(7/20~8/31 계약분이 참조) — 새 케이스 8건, 후보 목록은 늦게 시작한 것이 위다

-- SK일렉링크 (2026년 9월 1일) | 전체 | 7년 신규 | 모자분리 (총 280만 = 영업 150 + 시공 110 + 마진 20 · 정산 sk-2step)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y7-mother-new', 'SK일렉링크 (2026년 9월 1일) | 전체 | 7년 신규 | 모자분리', 'SK일렉링크', '환경부', '모자분리',
  '[7]'::jsonb, '["공동주택","상업시설"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일', 1500000, 1100000, 200000,
  'sk-2step',
  '운영사', '한백 대납(회수)', null, true,
  null, null, null, null,
  '대상: 아파트 · 주거형 오피스텔 · 지식산업센터 · 일반 상업시설·기타 부지(병원·골프장 등) · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 시공 전 사전 설치도면·견적서를 제출해 서면 승인 — 승인되지 않은 시공비는 청구 불가
· 단가는 협약자 등급에 따라 차등 적용될 수 있음(재산정 요청 가능)
· 협약자 귀책 재시공 비용은 협약자 부담 · 당사 시방서 기준 준수
· 대금: 세금계산서 확인 후 익월 25일 현금 지급(공휴일이면 전일)
· 용어(모자분리·상면 등) 정의는 당사 교부 시방서·정책서에 따름'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- SK일렉링크 (2026년 9월 1일) | 전체 | 10년 신규 | 모자분리 (총 290만 = 영업 150 + 시공 110 + 마진 30 · 정산 sk-2step)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y10-mother-new', 'SK일렉링크 (2026년 9월 1일) | 전체 | 10년 신규 | 모자분리', 'SK일렉링크', '환경부', '모자분리',
  '[10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일', 1500000, 1100000, 300000,
  'sk-2step',
  '운영사', '한백 대납(회수)', null, true,
  null, null, null, null,
  '대상: 아파트 · 주거형 오피스텔 · 지식산업센터 · 일반 상업시설·기타 부지(병원·골프장 등) · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 시공 전 사전 설치도면·견적서를 제출해 서면 승인 — 승인되지 않은 시공비는 청구 불가
· 단가는 협약자 등급에 따라 차등 적용될 수 있음(재산정 요청 가능)
· 협약자 귀책 재시공 비용은 협약자 부담 · 당사 시방서 기준 준수
· 대금: 세금계산서 확인 후 익월 25일 현금 지급(공휴일이면 전일)
· 용어(모자분리·상면 등) 정의는 당사 교부 시방서·정책서에 따름'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- SK일렉링크 (2026년 9월 1일) | 전체 | 7년 신규 | 한전불입 (총 250만 = 영업 120 + 시공 110 + 마진 20 · 정산 sk-2step)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y7-kepco-new', 'SK일렉링크 (2026년 9월 1일) | 전체 | 7년 신규 | 한전불입', 'SK일렉링크', '환경부', '한전불입',
  '[7]'::jsonb, '["공동주택","상업시설"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일', 1200000, 1100000, 200000,
  'sk-2step',
  '운영사', '한백 대납(회수)', null, true,
  null, null, null, null,
  '대상: 아파트 · 주거형 오피스텔 · 지식산업센터 · 일반 상업시설·기타 부지(병원·골프장 등) · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 시공 전 사전 설치도면·견적서를 제출해 서면 승인 — 승인되지 않은 시공비는 청구 불가
· 단가는 협약자 등급에 따라 차등 적용될 수 있음(재산정 요청 가능)
· 협약자 귀책 재시공 비용은 협약자 부담 · 당사 시방서 기준 준수
· 대금: 세금계산서 확인 후 익월 25일 현금 지급(공휴일이면 전일)
· 용어(모자분리·상면 등) 정의는 당사 교부 시방서·정책서에 따름'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- SK일렉링크 (2026년 9월 1일) | 전체 | 10년 신규 | 한전불입 (총 260만 = 영업 120 + 시공 110 + 마진 30 · 정산 sk-2step)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y10-kepco-new', 'SK일렉링크 (2026년 9월 1일) | 전체 | 10년 신규 | 한전불입', 'SK일렉링크', '환경부', '한전불입',
  '[10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일', 1200000, 1100000, 300000,
  'sk-2step',
  '운영사', '한백 대납(회수)', null, true,
  null, null, null, null,
  '대상: 아파트 · 주거형 오피스텔 · 지식산업센터 · 일반 상업시설·기타 부지(병원·골프장 등) · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 시공 전 사전 설치도면·견적서를 제출해 서면 승인 — 승인되지 않은 시공비는 청구 불가
· 단가는 협약자 등급에 따라 차등 적용될 수 있음(재산정 요청 가능)
· 협약자 귀책 재시공 비용은 협약자 부담 · 당사 시방서 기준 준수
· 대금: 세금계산서 확인 후 익월 25일 현금 지급(공휴일이면 전일)
· 용어(모자분리·상면 등) 정의는 당사 교부 시방서·정책서에 따름'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- SK일렉링크 (2026년 9월 1일) | 전체 | 7년 자체투자 | 모자분리 (총 220만 = 영업 90 + 시공 110 + 마진 20 · 정산 lump-100)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y7-mother-inplace-both', 'SK일렉링크 (2026년 9월 1일) | 전체 | 7년 자체투자 | 모자분리', 'SK일렉링크', '자체투자', '모자분리',
  '[7]'::jsonb, '["공동주택","상업시설"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 9월 1일', 900000, 1100000, 200000,
  'lump-100',
  '운영사', '한백 대납(회수)', null, true,
  null, null, null, null,
  '모자분리 조건 · 대상: 아파트 · 주거형 오피스텔 · 지식산업센터 · 일반 상업시설·기타 부지(병원·골프장 등) · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 시공 전 사전 설치도면·견적서를 제출해 서면 승인 — 승인되지 않은 시공비는 청구 불가
· 단가는 협약자 등급에 따라 차등 적용될 수 있음(재산정 요청 가능)
· 협약자 귀책 재시공 비용은 협약자 부담 · 당사 시방서 기준 준수
· 대금: 세금계산서 확인 후 익월 25일 현금 지급(공휴일이면 전일)
· 용어(모자분리·상면 등) 정의는 당사 교부 시방서·정책서에 따름'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- SK일렉링크 (2026년 9월 1일) | 전체 | 10년 자체투자 | 모자분리 (총 230만 = 영업 100 + 시공 110 + 마진 20 · 정산 lump-100)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y10-mother-inplace-both', 'SK일렉링크 (2026년 9월 1일) | 전체 | 10년 자체투자 | 모자분리', 'SK일렉링크', '자체투자', '모자분리',
  '[10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 9월 1일', 1000000, 1100000, 200000,
  'lump-100',
  '운영사', '한백 대납(회수)', null, true,
  null, null, null, null,
  '모자분리 조건 · 대상: 아파트 · 주거형 오피스텔 · 지식산업센터 · 일반 상업시설·기타 부지(병원·골프장 등) · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 시공 전 사전 설치도면·견적서를 제출해 서면 승인 — 승인되지 않은 시공비는 청구 불가
· 단가는 협약자 등급에 따라 차등 적용될 수 있음(재산정 요청 가능)
· 협약자 귀책 재시공 비용은 협약자 부담 · 당사 시방서 기준 준수
· 대금: 세금계산서 확인 후 익월 25일 현금 지급(공휴일이면 전일)
· 용어(모자분리·상면 등) 정의는 당사 교부 시방서·정책서에 따름'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- SK일렉링크 (2026년 9월 1일) | 전체 | 7년 기설치 연동 | 모자분리 (총 220만 = 영업 180 + 시공 0 + 마진 40 · 정산 lump-100)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y7-mother-link-both', 'SK일렉링크 (2026년 9월 1일) | 전체 | 7년 기설치 연동 | 모자분리', 'SK일렉링크', '기설치 연동', '모자분리',
  '[7]'::jsonb, '["공동주택","상업시설"]'::jsonb, '기설치 연동', '턴키',
  2026, '2026년 9월 1일', 1800000, 0, 400000,
  'lump-100',
  null, null, null, true,
  null, null, null, null,
  '모자분리 조건 · 7년 계약 이상 · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 급속충전기 연동에 대한 수수료는 제외'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- SK일렉링크 (2026년 9월 1일) | 전체 | 10년 기설치 연동 | 모자분리 (총 230만 = 영업 190 + 시공 0 + 마진 40 · 정산 lump-100)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'sk-2609-y10-mother-link-both', 'SK일렉링크 (2026년 9월 1일) | 전체 | 10년 기설치 연동 | 모자분리', 'SK일렉링크', '기설치 연동', '모자분리',
  '[10]'::jsonb, '["공동주택","상업시설"]'::jsonb, '기설치 연동', '턴키',
  2026, '2026년 9월 1일', 1900000, 0, 400000,
  'lump-100',
  null, null, null, true,
  null, null, null, null,
  '모자분리 조건 · 7년 계약 이상 · 지역: 수도권 · 6개 광역시 · 시 단위의 상면 · 적용: 2026-09-01 ~ 계약일 기준(접수된 설치 계약서의 계약일)', null, null, '· 급속충전기 연동에 대한 수수료는 제외'
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
  other_support = excluded.other_support, coexist_terms = excluded.coexist_terms, misc_terms = excluded.misc_terms;

-- 검산: 여덟 케이스의 금액이 정의와 같아야 한다 — 하나라도 다르면 마이그레이션이 실패한다
do $$
declare
  bad text;
begin
  select string_agg(e.id, ', ') into bad
    from (values
      ('sk-2609-y7-mother-new', 1500000, 1100000, 200000),
      ('sk-2609-y10-mother-new', 1500000, 1100000, 300000),
      ('sk-2609-y7-kepco-new', 1200000, 1100000, 200000),
      ('sk-2609-y10-kepco-new', 1200000, 1100000, 300000),
      ('sk-2609-y7-mother-inplace-both', 900000, 1100000, 200000),
      ('sk-2609-y10-mother-inplace-both', 1000000, 1100000, 200000),
      ('sk-2609-y7-mother-link-both', 1800000, 0, 400000),
      ('sk-2609-y10-mother-link-both', 1900000, 0, 400000)
    ) as e(id, sales, cons, margin)
    left join pricing_rules r on r.id = e.id
   where r.id is null or r.sales_unit <> e.sales or r.cons_unit <> e.cons or r.margin <> e.margin or not r.active;
  if bad is not null then
    raise exception 'SK 2609 케이스 금액 검산 실패: %', bad;
  end if;
end $$;

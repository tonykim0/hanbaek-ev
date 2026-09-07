-- 플러그링크 2026년 9월 1일 ~ 12월 31일 벌을 아홉으로 완성한다 (한백 2026-09-06)
-- lib/pricing-policy-pl-2609.ts 에서 생성 — 손으로 고치지 마세요
--
-- ── 0. 0059 를 되돌린다 — 기간 없는 케이스를 만들지 않는다 ──
--
-- 0059 는 자투 둘·상업 하나의 끝 날짜를 지워 「2026년 7월 1일」로 열어 뒀다. 9월 이후에도
-- 그 값이 그대로라는 것을 그렇게 담으려 했는데, ★정책은 기간으로 돈다★(한백) — 끝이 없는
-- 줄이 시기 목록에 홀로 서면 어느 계약에 무엇이 맞는지 화면이 말하지 못한다.
-- 그 셋을 다시 8월 31일로 닫고, 같은 값의 9월 케이스 셋을 아래에서 세운다.
update pricing_rules
   set start_date = '2026년 7월 1일 ~ 8월 31일',
       case_name  = replace(case_name, '(2026년 7월 1일)', '(2026년 7월 1일 ~ 8월 31일)')
 where cpo = '플러그링크'
   and start_date = '2026년 7월 1일';

--
-- ★아홉이다 — 기간이 곧 한 벌이다★ (한백 「모든 정책은 기간별로 운영되는 거야」).
-- 금액이 바뀐 것은 보조금 넷과 연동 둘이고, 자체투자 둘과 상업 보조금 하나는 7월과 값이
-- 한 글자도 다르지 않다 — 그래도 이 기간의 케이스로 같이 세운다. 그래야 9월을 고른
-- 매트릭스에 아홉 칸이 제 값으로 서고, 9월 계약이 「8월 31일에 끝난」 케이스를 안 붙인다.
--
-- 옛 벌은 걷지 않는다 — 케이스는 참조되면 불변이고, 계약일이 8월 31일 이전인 현장은 그 단가가
-- 정본이다. 시기가 갈리는 것은 적용 시작이 한다(lib/pricing-match startKey → 2026-09-01).
--
-- 분해: 받는 단가 = 영업비 + 시공비 + 마진. 보조금은 시공 95만 고정 · 마진 30만(20→30 인상) ·
-- 나머지 영업비. 연동은 시공 0 · 마진 20만 · 나머지 영업비.
--
-- 멱등: insert 는 on conflict (id) do nothing 이다. 두 번째 실행은 아무것도 안 바꾼다.

-- ── 1. 정산 규칙 — 케이스가 참조하므로 먼저 심는다 ──
-- 환경부 승인|고정|200000→착공|고정|1350000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-5n337g', '환경부 승인 200,000원 → 착공 1,350,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1350000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 환경부 승인|고정|200000→착공|고정|1450000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-1y49s2b', '환경부 승인 200,000원 → 착공 1,450,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1450000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 환경부 승인|고정|200000→착공|고정|1150000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-1kvl30u', '환경부 승인 200,000원 → 착공 1,150,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1150000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 환경부 승인|고정|200000→착공|고정|1250000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-65zklx', '환경부 승인 200,000원 → 착공 1,250,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1250000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 착공|고정|200000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-1p2t3w8', '착공 200,000원 → 준공마감 잔액', '[{"trigger":"착공","basis":{"kind":"고정","unit":200000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- 환경부 승인|고정|200000→착공|고정|1100000→준공마감|잔액
insert into settlement_rules (id, name, steps, note, active)
values ('st-7lnv4d', '환경부 승인 200,000원 → 착공 1,100,000원 → 준공마감 잔액', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1100000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb, null, true)
on conflict (id) do nothing;

-- ── 2. 케이스 여섯 ──
-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 환경부 신규 | 모자분리 (받는 단가 290만 = 영업 165 + 시공 95 + 마진 30)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y7-mother-new-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 환경부 신규 | 모자분리', '플러그링크', '환경부', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1650000, 950000, 300000,
  'st-5n337g',
  '영업비 차감', '한백 부담', null, true,
  '없음', '[{"months":6,"rate":149}]'::jsonb, '[{"months":6,"rate":149,"deduct":200000,"cap":"최대 1년"},{"months":6,"rate":249,"deduct":100000,"cap":"최대 1년"}]'::jsonb, 292,
  '· 총 주차면의 5%까지 지원
· 충전기 최소 2% 전용 구역 도색 필수
· 1개 단지 최대 100대', null, null, '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 환경부 신규 | 모자분리 (받는 단가 310만 = 영업 185 + 시공 95 + 마진 30)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y10-mother-new-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 환경부 신규 | 모자분리', '플러그링크', '환경부', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1850000, 950000, 300000,
  'st-1y49s2b',
  '영업비 차감', '한백 부담', null, true,
  '없음', '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, '[{"months":6,"rate":149,"deduct":200000,"cap":"최대 2년"},{"months":6,"rate":249,"deduct":100000,"cap":"최대 2년"}]'::jsonb, 292,
  '· 총 주차면의 5%까지 지원
· 충전기 최소 2% 전용 구역 도색 필수
· 1개 단지 최대 90대', null, null, '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 환경부 신규 | 한전불입 (받는 단가 250만 = 영업 125 + 시공 95 + 마진 30)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y7-kepco-new-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 환경부 신규 | 한전불입', '플러그링크', '환경부', '한전불입',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1250000, 950000, 300000,
  'st-1kvl30u',
  '영업비 차감', '한백 부담', null, true,
  '없음', '[{"months":6,"rate":149}]'::jsonb, '[{"months":6,"rate":149,"deduct":200000,"cap":"최대 1년"},{"months":6,"rate":249,"deduct":100000,"cap":"최대 1년"}]'::jsonb, 292,
  '· 총 주차면의 5%까지 지원
· 충전기 최소 2% 전용 구역 도색 필수
· 1개 단지 최대 100대', null, null, '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 환경부 신규 | 한전불입 (받는 단가 270만 = 영업 145 + 시공 95 + 마진 30)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y10-kepco-new-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 환경부 신규 | 한전불입', '플러그링크', '환경부', '한전불입',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1450000, 950000, 300000,
  'st-65zklx',
  '영업비 차감', '한백 부담', null, true,
  '없음', '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, '[{"months":6,"rate":149,"deduct":200000,"cap":"최대 2년"},{"months":6,"rate":249,"deduct":100000,"cap":"최대 2년"}]'::jsonb, 292,
  '· 총 주차면의 5%까지 지원
· 충전기 최소 2% 전용 구역 도색 필수
· 1개 단지 최대 90대', null, null, '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 연동 | 모자분리 (받는 단가 120만 = 영업 100 + 시공 0 + 마진 20)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y7-link-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 연동 | 모자분리', '플러그링크', '연동', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '연동', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1000000, 0, 200000,
  'st-1p2t3w8',
  null, null, null, true,
  '없음', null, null, 292,
  null, null, null, '· 연동 대상 기기·세부 조건은 운영사 확인 필요(코스텔·PNE 한정으로 안내된 바 있음)'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 연동 | 모자분리 (받는 단가 140만 = 영업 120 + 시공 0 + 마진 20)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y10-link-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 연동 | 모자분리', '플러그링크', '연동', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '연동', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1200000, 0, 200000,
  'st-1p2t3w8',
  null, null, null, true,
  '없음', null, null, 292,
  null, null, null, '· 연동 대상 기기·세부 조건은 운영사 확인 필요(코스텔·PNE 한정으로 안내된 바 있음)'
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 자체투자 | 모자분리 (받는 단가 220만 = 영업 105 + 시공 95 + 마진 20)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y7-mother-inplace-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 7년 자체투자 | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[7]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1050000, 950000, 200000,
  'st-1p2t3w8',
  null, null, null, true,
  '없음', null, null, 292,
  '· 총 주차면의 5%까지 지원
· 충전기 최소 2% 전용 구역 도색 필수
· 1개 단지 최대 130대(7년) / 120대(10년)', null, null, null
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 자체투자 | 모자분리 (받는 단가 240만 = 영업 125 + 시공 95 + 마진 20)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y10-mother-inplace-apt', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 공동주택 | 10년 자체투자 | 모자분리', '플러그링크', '자체투자', '모자분리',
  '[10]'::jsonb, '["공동주택"]'::jsonb, '자체투자 (제자리교체)', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1250000, 950000, 200000,
  'st-1p2t3w8',
  null, null, null, true,
  '없음', null, null, 292,
  '· 총 주차면의 5%까지 지원
· 충전기 최소 2% 전용 구역 도색 필수
· 1개 단지 최대 130대(7년) / 120대(10년)', null, null, null
) on conflict (id) do nothing;

-- 플러그링크 (2026년 9월 1일 ~ 12월 31일) | 상업시설 | 10년 환경부 신규 | 모자분리 (받는 단가 240만 = 영업 125 + 시공 95 + 마진 20)
insert into pricing_rules (
  id, case_name, cpo, biz_type, power_type, term_years, bldg_types, repl_type, channel,
  biz_year, start_date, sales_unit, cons_unit, margin, default_settlement_rule_id,
  supervision_bearer, safety_fee_bearer, note, active,
  supply_items, promo, promo_extend, charge_rate, install_terms, other_support,
  coexist_terms, misc_terms
) values (
  'pl-2609-y10-mother-new-biz', '플러그링크 (2026년 9월 1일 ~ 12월 31일) | 상업시설 | 10년 환경부 신규 | 모자분리', '플러그링크', '환경부', '모자분리',
  '[10]'::jsonb, '["상업시설"]'::jsonb, '환경부 신규', '턴키',
  2026, '2026년 9월 1일 ~ 12월 31일', 1250000, 950000, 200000,
  'st-7lnv4d',
  '영업비 차감', '한백 부담', null, true,
  '없음', '[{"months":6,"rate":149},{"months":6,"rate":249}]'::jsonb, '[{"months":6,"rate":149,"deduct":200000,"cap":"최대 2년"},{"months":6,"rate":249,"deduct":100000,"cap":"최대 2년"}]'::jsonb, 292,
  '· 총 주차면의 2%까지 지원
· 10년 모자분리만 (7년 계약·한전불입 불가)
· 대상지: 공영주차장, 관공서, 주민센터, 지식산업센터, 4성 이상 호텔/리조트, 사옥, 골프장, 병원', null, null, '· 기존 플러그링크 설치 현장 추가 영업 시 프로모션 없음(프로모션 기간만큼 계약 연장 합의서 작성 시 적용 가능)
· 보조금 미수령 시 귀책 무관 비보조금 기준 수수료 지급(기지급분 차액 환수)'
) on conflict (id) do nothing;

-- ── 3. 검산 — 조용한 실패를 막는다 ──
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
      ('pl-2609-y7-mother-new-apt', 1650000, 950000, 300000, 'st-5n337g'),
      ('pl-2609-y10-mother-new-apt', 1850000, 950000, 300000, 'st-1y49s2b'),
      ('pl-2609-y7-kepco-new-apt', 1250000, 950000, 300000, 'st-1kvl30u'),
      ('pl-2609-y10-kepco-new-apt', 1450000, 950000, 300000, 'st-65zklx'),
      ('pl-2609-y7-link-apt', 1000000, 0, 200000, 'st-1p2t3w8'),
      ('pl-2609-y10-link-apt', 1200000, 0, 200000, 'st-1p2t3w8'),
      ('pl-2609-y7-mother-inplace-apt', 1050000, 950000, 200000, 'st-1p2t3w8'),
      ('pl-2609-y10-mother-inplace-apt', 1250000, 950000, 200000, 'st-1p2t3w8'),
      ('pl-2609-y10-mother-new-biz', 1250000, 950000, 200000, 'st-7lnv4d')
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
      ('st-5n337g', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1350000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-1y49s2b', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1450000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-1kvl30u', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1150000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-65zklx', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1250000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-1p2t3w8', '[{"trigger":"착공","basis":{"kind":"고정","unit":200000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb),
      ('st-7lnv4d', '[{"trigger":"환경부 승인","basis":{"kind":"고정","unit":200000}},{"trigger":"착공","basis":{"kind":"고정","unit":1100000}},{"trigger":"준공마감","basis":{"kind":"잔액"}}]'::jsonb)
    ) as want(id, steps)
    join settlement_rules r on r.id = want.id
   where r.steps <> want.steps;
  if bad > 0 then
    raise exception '정산 규칙 %건의 단계가 이 파일과 다릅니다 — 해시가 겹쳤을 수 있습니다', bad;
  end if;
end $$;

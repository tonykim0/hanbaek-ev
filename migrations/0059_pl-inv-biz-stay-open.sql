-- 자체투자·상업 케이스의 기간에서 끝 날짜를 걷는다 — 9월 이후에도 그대로 쓴다 (한백 2026-09-06)
-- 정의: lib/pricing-policy-plhec-h2.ts (자투는 PL_INV_START)
--
-- ★왜★ 0057 이 플러그링크 하반기 아홉을 「2026년 7월 1일 ~ 8월 31일」로 닫았다. 그때는 그
-- 아홉이 다 「하반기 정책」이었기 때문이다. 그런데 9월 정책(0058)이 보조금 넷과 연동 둘만
-- 갈아치웠고, ★자체투자와 상업 보조금은 9월 이후에도 7월과 동일하다★(한백 확인).
-- 그러면 그 셋에 적힌 「~ 8월 31일」이 사실이 아니다 — 9월 계약에 붙이는 사람은 끝난 케이스로
-- 읽고, 붙이고 나면 현장·명세서에 「8/31 까지」짜리 이름이 그대로 따라간다.
--
-- 끝을 지우면 「2026년 7월 1일부터, 아직 유효」로 읽힌다. 다음 정책이 그 셋을 갈아치울 때
-- 0057 처럼 닫는다. 금액·축·기성은 한 글자도 안 건드린다.
--
-- 멱등: 옛 표기만 겨냥한다 — 두 번째 실행은 0행이다.

update pricing_rules
   set start_date = '2026년 7월 1일',
       case_name  = replace(case_name, '(2026년 7월 1일 ~ 8월 31일)', '(2026년 7월 1일)')
 where cpo = '플러그링크'
   and start_date = '2026년 7월 1일 ~ 8월 31일'
   and biz_type in ('자체투자', '환경부')
   and (biz_type = '자체투자' or bldg_types @> '["상업시설"]'::jsonb);

-- 검산 — 닫힌 채로 남아야 하는 것과 열려야 하는 것이 갈렸나
do $$
declare still_closed int; wrongly_open int;
begin
  -- 자투·상업은 열려 있어야 한다
  select count(*) into still_closed from pricing_rules
   where cpo = '플러그링크' and start_date = '2026년 7월 1일 ~ 8월 31일'
     and (biz_type = '자체투자' or bldg_types @> '["상업시설"]'::jsonb);
  if still_closed > 0 then
    raise exception '자투·상업 %건이 아직 8월 31일로 닫혀 있습니다', still_closed;
  end if;

  -- 보조금 공동주택 넷과 연동 둘은 9월 벌이 갈아치웠으므로 닫힌 채로 남아야 한다
  select count(*) into wrongly_open from pricing_rules
   where cpo = '플러그링크' and start_date = '2026년 7월 1일'
     and biz_type <> '자체투자'
     and not bldg_types @> '["상업시설"]'::jsonb;
  if wrongly_open > 0 then
    raise exception '보조금·연동 %건의 끝 날짜가 같이 지워졌습니다 — 그 여섯은 8월 31일에 닫힌다', wrongly_open;
  end if;
end $$;

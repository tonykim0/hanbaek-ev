-- SK 7/20 정책 케이스의 적용 기간을 7/20 ~ 8/31 로 (한백 지시 2026-09-10 「기존에 있던 7/20 정책은 7/20~8/31로 설정해둬」)
--
-- 케이스에는 적용 종료 칸이 없다 — 기간은 설치조건 문장으로만 선다(lib/pricing-policy-sk-h2 SK_PERIOD).
-- 0009 가 「~ 09-30」(부속합의서 기간)으로 찍었는데 9/1 정책이 먼저 왔다(0071, lib/pricing-policy-sk-2609).
-- 두 시기가 겹쳐 보이면 후보 화면에서 어느 것을 고를지 헷갈린다 — 옛 것이 8/31 에 끝난다고 문장이 말해야 한다.
--
-- 대상은 SK 7/20 케이스 다섯: 보조 3(sk-h2-y7_10-mother-new · sk-h2-y10-kepco-new) · 자투 2(sk-h2-y7/y10-mother-move-apt-self)
-- 는 기간 문장이 있어 글자만 바꾸고, 연동(sk-y7-10-mother-link-both-2026)은 기간 문장이 없어 같은 것을 덧붙인다.
-- 멱등 — 바꿀 글자가 있는 행만 건드리고, 끝에 검산한다.

update pricing_rules
   set install_terms = replace(install_terms, '적용: 2026-07-20 ~ 09-30 계약일 기준', '적용: 2026-07-20 ~ 08-31 계약일 기준')
 where cpo = 'SK일렉링크'
   and install_terms like '%적용: 2026-07-20 ~ 09-30 계약일 기준%';

update pricing_rules
   set install_terms = install_terms || ' · 적용: 2026-07-20 ~ 08-31 계약일 기준(접수된 설치 계약서의 계약일)'
 where id = 'sk-y7-10-mother-link-both-2026'
   and install_terms is not null
   and install_terms not like '%적용: 2026-07-20 ~%';

-- 검산: 7/20 시작 SK 케이스 중 「~ 08-31」이 없는 것이 남으면 실패 — 조용히 빠지지 않게
do $$
declare
  bad text;
begin
  select string_agg(id, ', ') into bad
    from pricing_rules
   where cpo = 'SK일렉링크'
     and start_date = '2026년 7월 20일'
     and coalesce(install_terms, '') not like '%적용: 2026-07-20 ~ 08-31%';
  if bad is not null then
    raise exception 'SK 7/20 케이스에 8/31 종료 문장이 없음: %', bad;
  end if;
end $$;

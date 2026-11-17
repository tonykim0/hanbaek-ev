-- 단가 케이스 이름의 「환경부 신규」를 「기후부 신규」로 — 저장된 표시 글자 (한백 지시 2026-11-17 「응 둘다 해」 — 사업구분도 기후부로)
--
-- 사업구분 · 교체유형의 ★저장값은 그대로다★(projects.biz_type · pricing_rules.biz_type · repl_type · contract_lines.repl_type 의
-- 「환경부」 · 「환경부 신규」). 단가 맞추기 · 서류 필수 규칙 · 판독 지시문이 그 글자를 보고, 배포 중 옛 코드와 새 값이 어긋나면
-- 단가가 안 맞는다. 화면은 types/project bizLabel · replLabel 이 「기후부」 · 「기후부 신규」로 적는다.
--
-- 케이스 이름(case_name)만은 글자로 저장된 표시다 — 케이스를 만들 때 replLabel 로 지어 넣는다(components/pricing/CaseForm).
-- 어떤 판정도 이 글자를 보지 않는다(케이스의 정체는 id 와 축이다 — lib/pricing-match). 옮기지 않으면 지급조건 · 적용조건 ·
-- 단가 후보에 「10년 환경부 신규」가, 새로 만든 케이스에는 「기후부 신규」가 섞여 선다.
update pricing_rules
   set case_name = replace(case_name, '환경부 신규', '기후부 신규')
 where case_name like '%환경부 신규%';

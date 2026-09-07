-- 전기안전점검수수료 — 영수증 칸을 걷고, 나이스 문구를 사실에 맞춘다 (한백 2026-09-06)
-- 정의: lib/db/schema.ts (settlements) · lib/pricing-policy-nice-h2.ts (safetyFeeBearer)
--
-- ① settlements.safety_fee_receipts 를 걷는다 — 0064 가 하루 전에 만든 칸이다.
--    ★영수증의 정본이 바뀌었다★ (한백 「영수증도 협력사쪽에서 업로드하게 해줘. 공정과정에서」).
--    한백이 붙이는 첨부가 아니라 ★협력사가 공정에서 내는 서류★ 라서, 공정 서류 한 칸
--    (process_documents 의 safetyFeeReceipt)이 정본이다. 두 곳에 올릴 수 있게 두면 같은
--    파일의 정본이 둘이 된다(dual-write 금지). 값이 들어간 적이 없어(하루 만이고 화면도
--    안 나갔다) 걷어도 잃는 것이 없다 — 안 쓰는 칸을 남겨 두면 다음 사람이 그 뜻을
--    되짚느라 헤맨다(safety_fee 가 「안전관리비」로 적혀 있던 것이 그 예다).
--
-- ② 나이스인프라 케이스의 「(턴키금액 포함)」을 뗀다 — ★사실이 아니다★ (한백 「턴키금액 포함
--    아니야」 · 「단가표에 있는 기성금액에다가 전기안전점검수수료를 따로 받아야해」).
--    포함이라고 적혀 있으면 다음 사람이 이 수수료를 이중 계상으로 읽는다(실제로 그 의심이
--    검증에서 나왔다). 남기는 사실은 둘이다: 한백이 받고, 하도급사에는 안 준다.
--
-- 멱등: drop column if exists · update 는 옛 문구만 겨냥한다.

alter table settlements drop column if exists safety_fee_receipts;

update pricing_rules
   set safety_fee_bearer = '한백 수령 · 하도급 미지급 · 기성과 별도 청구'
 where cpo = '나이스인프라'
   and safety_fee_bearer = '한백 수령 · 하도급 미지급(턴키금액 포함)';

do $$
declare left_over int;
begin
  select count(*) into left_over from pricing_rules
   where safety_fee_bearer like '%턴키금액 포함%';
  if left_over > 0 then
    raise exception '「턴키금액 포함」이 아직 %건 남아 있습니다', left_over;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_name = 'settlements' and column_name = 'safety_fee_receipts'
  ) then
    raise exception 'settlements.safety_fee_receipts 가 아직 있습니다';
  end if;
end $$;

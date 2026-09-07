-- 전기안전점검수수료 — 운영사에게서 따로 받는 돈에 수금일 칸을 더한다 (한백 지시 2026-09-06)
-- 정의: lib/settlement.ts 의 SAFETY_FEE_CPOS · lib/db/schema.ts 의 settlements
--
-- ★왜★ SK일렉링크·나이스인프라·현대엔지니어링 현장은 현장별 전기안전점검수수료를 운영사에게서
-- 따로 받는다(수전방식과 무관 — 처음 지시의 「모자분리 한함」은 한백이 곧 정정했다).
-- 그 돈은 기성 차수에 못 얹는다: 차수 합은 받는 단가와 정확히 같아야 하고(checkSettlementSteps)
-- 그 항등이 「한백 마진 = 받을 기성 − 내려줄 지급」을 지탱한다. 그래서 현장 단위 칸으로 받고
-- 받을 돈 합계와 마진에 같이 든다(한백 「운영사로부터 받을 돈 합계에 들어가」).
-- 현대엔지니어링의 「안전공사 검사·점검비(준공 시 정산)」가 이 돈이다(한백 확인) —
-- migrations/0039 가 정책표에서 걷어낸 그 항목이고, 이제 현장마다 이 칸이 받는다.
--
-- ★금액 칸은 이미 있다 — settlements.safety_fee.★ 골격 첫 커밋부터 있었지만 어느 화면도
-- 읽거나 쓴 적이 없고 프로덕션 31행이 전부 null 이다(2026-09-06 확인). 타입 주석만
-- 「안전관리비 — 원가」로 적혀 있었는데 방향이 반대인 말이었다 — 값이 없는 칸이라 뜻을 확정한다.
-- 그 칸은 마이그레이션에 DDL 이 없다(db:push 시절 산물). 개발 DB 를 새로 만들 때를 위해
-- 여기서 같이 멱등하게 만든다 — 이미 있으면 no-op 다.
--
-- 멱등: add column if not exists 둘. 값은 건드리지 않는다.

alter table settlements add column if not exists safety_fee integer;
alter table settlements add column if not exists safety_fee_collected_at text;

-- 검산 — 칸이 실제로 섰나. 없으면 코드가 그 칸을 읽다가 런타임에 죽는다.
do $$
declare missing int;
begin
  select count(*) into missing
    from (values ('safety_fee'), ('safety_fee_collected_at')) as want(col)
   where not exists (
     select 1 from information_schema.columns
      where table_name = 'settlements' and column_name = want.col
   );
  if missing > 0 then
    raise exception 'settlements 에 전기안전점검수수료 칸 %개가 안 섰습니다', missing;
  end if;
end $$;

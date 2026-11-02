-- 기성 청구일 — 차수 셋과 전기안전점검수수료에 「운영사에 청구한 날」 칸을 더한다 (한백 지시 2026-11-02)
-- 정의: lib/settlement.ts 의 settlementForProject · safetyFeeStateOf / lib/db/schema.ts 의 settlements
--
-- ★왜★ 한백은 운영사에 기성을 실제로 청구한다 — 조건(환경부 승인·착공·준공마감)이 찬 달의
-- 다음 달부터 청구할 수 있다. 콘솔은 그동안 「청구」를 기록하지 않아서, 청구서를 보낸 차수와
-- 아직 안 보낸 차수가 한 칸(「받을 수 있음」)에 섞였고 미수금·수주잔고를 셀 수 없었다.
-- 이제 차수는 조건 대기 → 청구 예정 → 청구 가능 → 미수(청구함) → 수금 완료로 간다.
-- 수금은 청구를 기록한 차수에만 적는다(한백 결정) — 저장소가 막는다.
--
-- 옛 수금 기록은 청구일이 비어 있다 — 그 차수는 수금 완료로 서고 그대로 둔다(채울 근거가 없다).
--
-- 멱등: add column if not exists 넷. 값은 건드리지 않는다.

alter table settlements add column if not exists claimed_1_at text;
alter table settlements add column if not exists claimed_2_at text;
alter table settlements add column if not exists claimed_3_at text;
alter table settlements add column if not exists safety_fee_claimed_at text;

-- 검산 — 칸이 실제로 섰나. 없으면 코드가 그 칸을 읽다가 런타임에 죽는다.
do $$
declare missing int;
begin
  select count(*) into missing
    from (values ('claimed_1_at'), ('claimed_2_at'), ('claimed_3_at'), ('safety_fee_claimed_at')) as want(col)
   where not exists (
     select 1 from information_schema.columns
      where table_name = 'settlements' and column_name = want.col
   );
  if missing > 0 then
    raise exception 'settlements 에 청구일 칸 %개가 안 섰습니다', missing;
  end if;
end $$;

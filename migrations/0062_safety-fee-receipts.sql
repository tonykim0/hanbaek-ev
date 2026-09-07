-- 전기안전점검수수료 영수증 칸 (한백 지시 2026-09-06 「현장별로 영수증 담는 칸도 생성해줘」)
-- 정의: lib/db/schema.ts 의 settlements.safetyFeeReceipts
--
-- ★왜★ 준공완료 뒤 협력사에게서 영수증을 받아 그것으로 운영사에 청구한다(한백). 그 근거를
-- 현장마다 보관해야 청구할 때 꺼내 볼 수 있다.
--
-- ★검수 대상이 아니다★ — 서류(documents)처럼 반려·승인이 없다. 그래서 서류 표가 아니라
-- settlements 의 칸에 쌓는다: 공지 첨부(notices.files)와 같은 성격이라 같은 꼴을 따랐다.
-- 여러 장이 온다 — 올리면 쌓이고 빼는 것은 한 장씩이다(회의록이 두 장으로 스캔되는 것과 같다).
--
-- 멱등: add column if not exists · 기본값 빈 배열이라 기존 31행이 그대로 통과한다.

alter table settlements add column if not exists safety_fee_receipts jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_name = 'settlements' and column_name = 'safety_fee_receipts'
  ) then
    raise exception 'settlements.safety_fee_receipts 가 안 섰습니다';
  end if;
end $$;

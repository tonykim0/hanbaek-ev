-- 현장 개별 단가 가감 (한백 지시 2026-10-20 「개별적으로 수정해야 할 케이스가 생기니까 케이스별로 수정 필요」).
--
-- 한 현장만 대당 영업비·시공비를 단가 케이스와 다르게 준다 — 케이스(13개 현장 공용 등)와 계약 라인은 그대로 두고,
-- 현장에 ★대당 가감액★을 적는다(원 단위, 음수면 깎는다). 계산은 케이스 값 + 가감이고, 운영사에게 받는 대당 금액
-- (턴키)은 그대로라 한백 마진이 그만큼 준다. 화면에 고치는 단추는 없다 — 한백이 Claude Code 로 요청하면 이 칸에
-- 직접 적는다(한백 결정). unit_adjust_note 는 왜 바꿨는지 — 한백만 본다.
alter table projects add column if not exists sales_unit_adjust integer;
alter table projects add column if not exists cons_unit_adjust integer;
alter table projects add column if not exists unit_adjust_note text;

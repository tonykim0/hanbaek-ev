-- 기설치 연동의 두 칸이 받을 날짜·선언 (한백 지시 2026-09-07)
--
-- 이미 깔린 충전기를 운영사 시스템에 붙이는 사업은 발주·수령·착공이 없다. 대신 계약 뒤에
-- 전기사용신청 → 전기안전점검 → 충전시설신고(= 행위신고)를 거친다. 앞의 둘이 새 칸이고,
-- 각 칸은 날짜 하나와 「끝냈다」 선언 하나를 받는다 — 행위신고(notify_date·notify_done_at)와
-- 같은 모양이다. 서류는 이미 있는 것을 쓴다: 전기사용신청 접수증(elecapply) · 사용전점검필증(safety).
--
-- ★프로덕션에 기설치 연동 현장은 아직 0건이다★ (확인 2026-09-07) — 채울 행이 없다.

alter table processes add column if not exists elec_apply_date text;
alter table processes add column if not exists elec_apply_done_at text;
alter table processes add column if not exists safety_check_date text;
alter table processes add column if not exists safety_check_done_at text;

-- ── 「연동」을 「기설치 연동」으로 (같은 지시) ────────────────────────────
--
-- 이미 깔려 있는 충전기를 붙이는 사업이라, 그냥 「연동」이면 무엇을 연동하는지가 없다.
-- 축 값이라 pricing_rules 의 후보 판정이 이 글자를 그대로 견준다(lib/pricing-match).
-- ★현장·계약라인에는 이 값이 0건이다★ (확인 2026-09-07) — 옮길 것은 케이스 6줄뿐이다.
-- 케이스 id 는 축의 영문 약칭(link)으로 만들어서 안 바뀐다.

update pricing_rules set biz_type  = '기설치 연동' where biz_type  = '연동';
update pricing_rules set repl_type = '기설치 연동' where repl_type = '연동';

-- 현장·라인에도 혹시 생겼으면 같이 옮긴다(멱등)
update projects       set biz_type  = '기설치 연동' where biz_type  = '연동';
update contract_lines set repl_type = '기설치 연동' where repl_type = '연동';

-- 0062 가 만든 네 칸을 지운다 — 쓰지 않게 됐다 (한백 정정 2026-09-07)
--
-- 「기설치 연동은 계약 뒤에 전기사용신청·전기안전점검이 필요하다」는 말을 공정 칸으로
-- 새로 세웠는데, 그 둘은 ★이미 있는 자리에서 이뤄지는 일★이었다:
--   전기사용신청  → 착공 칸의 설치 상자, 「전기사용신청 접수증」(elecapply)
--   전기안전점검  → 준공서류 칸의 「사용전점검필증」(safety)
-- 칸으로 또 세우니 같은 일을 두 번 적게 되고, 아무도 안 쓰는 칸 둘이 시공 보드에 섰다.
--
-- ★데이터가 없다★ — 만든 날 그대로 걷는다(어제 0062, 오늘 0064). 값이 들어간 적이
-- 없으므로 되돌릴 것도 없다. 컬럼을 남기지 않는 이유는 그것이다: 남기면 다음 사람이
-- 「왜 있는데 아무도 안 읽나」를 묻는다.

alter table processes drop column if exists elec_apply_date;
alter table processes drop column if exists elec_apply_done_at;
alter table processes drop column if exists safety_check_date;
alter table processes drop column if exists safety_check_done_at;

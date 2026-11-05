-- 시공 기록 날짜를 더한다 (한백 지시 2026-11-05 「시공관리에서 기록해야할 것들을 더 추가하고 싶어」 · 시공완료 뒤의 차례는
-- 한백이 준 공정 설명 — 「전기사용신청 → 사용전점검/검사 → (한전불입: 한전 외선공사 · 계량기) → 사용검사 → 개통」).
--
-- 기록만이다 — 어느 것도 단계를 넘기는 조건이 아니다(lib/process 는 이 칸들을 보지 않는다).
-- 적는 사람은 한백과 그 현장의 시공사다(한백 전용 칸이 아니다).
--
-- 「행위신고 신청일」은 새 칸이 아니다 — 지금의 notify_date 가 그것이다(타입 주석이 처음부터 「신고를 접수한 날」이었다).
-- 「전기안전점검일」과 「사용전 검사(점검) 일자」는 한 칸이다 — 한백의 공정 설명이 모자분리에서는 전기안전점검,
-- 한전불입에서는 사용전점검/검사라 부르는 같은 점검이다(필증 이름도 「사용전점검/검사 필증」).
alter table processes add column if not exists notify_cert_date text;          -- 행위신고 완료일(신고증명서를 받은 날)
alter table processes add column if not exists prestart_submit_date text;      -- 착공서류(안전계획서 · 위험성평가) 제출일
alter table processes add column if not exists foundation_date text;           -- 기초 및 배관/배선일
alter table processes add column if not exists charger_install_date text;      -- 충전기 및 캐노피 설치일
alter table processes add column if not exists elec_apply_date text;           -- 전기사용신청일
alter table processes add column if not exists safety_check_date text;         -- 사용전점검/검사일(전기안전점검)
alter table processes add column if not exists kepco_line_date text;           -- 한전 외선공사일(한전불입)
alter table processes add column if not exists meter_date text;                -- 계량기 부설일(한전불입)
alter table processes add column if not exists use_inspect_apply_date text;    -- 지자체 사용검사 신청일

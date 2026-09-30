-- 설치위치 — 실내 · 실외 · 실내·실외 (한백 지시 2026-09-30)
--
-- 사전현장컨설팅 결과서의 「설치위치 실내,지하 / 실외,노상」이다. 현장 머리말에서 본다.
-- 옛 현장은 값이 없다(null = 미지정) — 서류에서 옮겨 적은 적이 없는 칸이라 채우지 않는다.
alter table projects add column if not exists install_loc text;

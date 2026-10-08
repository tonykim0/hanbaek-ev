-- 계약주체의 대표자 — 사업자등록증·고유번호증의 「대표자」 성명 (한백 지시 2026-10-08 「앞으로는 사업자등록증상 대표자
-- 이름까지 추출해서 계약 현장정보에 넣어줘」).
alter table projects add column if not exists rep_name text;

-- 계약서상 계약일 — 계약서 끝 서명란 위의 「계약일 20xx년 x월 x일」 (한백 지시 2026-10-08 「계약서상 계약일도 적어줘」).
-- 계약서 수령일(created_at · 계약접수일)과 다른 값이다: 받은 날이 아니라 계약서에 적힌 날. YYYY-MM-DD.
alter table projects add column if not exists contract_date text;

-- 둘 다 접수 판독이 채우고, 그 칸(사업자등록증·계약서)에 파일이 들어오면 비었을 때 읽어 채운다(lib/fact-read-run).
-- 한백이 머리말·현장 정보에서 고친다. 옛 현장은 비어 있다(미지정).

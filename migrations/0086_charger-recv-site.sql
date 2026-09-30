-- 충전기 수령지 — 주소·담당자·연락처 (한백 지시 2026-09-30)
--
-- 환경부 승인이 나면 한백이 바로 발주를 넣는데, 그때 충전기를 어디로 보낼지를 현장이
-- 알려줘야 한다. 협력사가 행위신고 칸에서 적는다. 글자 칸이라 비어 있으면 null 이다.
alter table processes add column if not exists recv_addr text;
alter table processes add column if not exists recv_name text;
alter table processes add column if not exists recv_phone text;

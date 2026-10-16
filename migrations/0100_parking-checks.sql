-- 주차면 대조 결과 (한백 지시 2026-10-16 「계약단계에서 건축물대장에 대한 에이전트를 하나 더」).
--
-- 건축물대장(또는 K-apt·지자체 공문) = 사전현장컨설팅 결과서 = 설치신청서 의 주차면이 같은지, 건축물대장이 열람용이
-- 아닌지를 본다. 기설치 대조(0093 preinstall_checks)와 같은 꼴 — 현장마다 마지막 대조 하나만 둔다(다시 대조하면
-- 덮는다, 이력은 audit_log). result 는 lib/parking-check 의 ParkingCheck 모양이다. 대조에 쓴 파일 주소가
-- result.files 에 있어, 칸의 파일이 바뀌면 화면이 「다시 대조」로 알린다.
create table if not exists parking_checks (
  project_id text primary key references projects(id) on delete cascade,
  result jsonb not null,
  checked_by text,
  checked_at timestamptz not null default now()
);

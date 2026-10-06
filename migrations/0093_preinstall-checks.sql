-- 기설치 이력 엑셀 ↔ 증빙 대조 결과 (한백 지시 2026-10-06 「엑셀의 수치와 증빙자료가 맞는지 검증」)
--
-- 현장마다 마지막 대조 하나만 둔다 — 다시 대조하면 덮는다(이력은 audit_log 에 남는다).
-- result 는 lib/preinstall-check 의 PreInstallCheck 모양이다. 판독이 30초쯤 걸려 화면을 열 때마다
-- 다시 돌릴 수 없으므로 저장해 둔다. 대조에 쓴 파일 주소가 result.files 에 있어, 칸의 파일이 바뀌면
-- 화면이 「다시 대조」로 알린다.
create table if not exists preinstall_checks (
  project_id text primary key references projects(id) on delete cascade,
  result jsonb not null,
  checked_by text,
  checked_at timestamptz not null default now()
);

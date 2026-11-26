-- 기설치 대조 없이 넘김 — 한백이 대조를 돌리지 않고 계약 확인을 연다(한백 2026-11-26 「기설치 조사에서 대조없이 넘어갈수있게 force 버튼」).
-- 대조 결과(preinstall_checks)에 두지 않는 것은 다시 대조하면 결과를 덮기 때문이다 — 넘긴 것은 현장의 일이라 여기 둔다.
-- null 이면 넘기지 않았다. 누가 언제 넘기고 물렀는지는 audit_log 에도 남는다.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_check_skipped_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pre_check_skipped_by text;

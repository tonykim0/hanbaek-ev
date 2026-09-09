-- 보완요청이 만든 반려를 표시한다 — 「보완요청 취소」가 그것만 되돌리게 (감사 2026-09-04 M11)
--
-- 보완요청(askMissingDocs)은 빈 필수 칸을 status='rejected' 로 세운다. 취소는 「rejected 인데 파일이
-- 없는 칸」을 전부 되돌렸는데, 한백이 사유와 함께 반려한 뒤 협력사가 파일을 빼 버린 칸도 같은 모양이라
-- 그 반려와 사유까지 지워졌다. 두 행은 값으로 구분이 안 되므로 표시를 따로 둔다.
-- 파일이 올라오거나(putContractDoc) 취소되면(markMissing ask=false) 비운다.
alter table documents add column if not exists asked_at text;

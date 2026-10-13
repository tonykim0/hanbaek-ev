-- 견적서 (SK) 를 계약 서류에서 시공 탭 행위신고 구간의 공정 서류로 옮긴다 (한백 지시 2026-10-13 「SK의 경우 견적서를
-- 계약접수단계가 아닌 행위신고 단계에서 받아줘」 · 이미 올라온 파일은 「행위신고 칸으로 옮김」).
-- 프로덕션 실측(2026-10-13): 계약 서류 quote 행 45건 — 전부 SK일렉링크 · 전부 파일 있는 uploaded · 반려·보완요청 0건.
-- 새 칸 skQuote 는 0건이었다. 파일·상태·올린 사람·날짜를 그대로 옮기고 계약 쪽 행은 지운다(그 키는 이제 계약 서류가
-- 아니라 남겨 두면 올리기·빼기가 「서류 종류가 올바르지 않습니다」로 막힌 칸이 된다). Blob 파일은 건드리지 않는다.
-- 멱등: 이미 옮긴 현장은 다시 넣지 않고(on conflict), 옮겨진 것만 지운다.
with moved as (
  insert into process_documents (project_id, kind, filename, blob_url, status, reject_reason, uploaded_by, uploaded_at, files)
  select d.project_id, 'skQuote', d.filename, d.blob_url, d.status, d.reject_reason, d.uploaded_by, d.uploaded_at,
         -- 「새로 올림」 표시는 계약 서류의 판(반려→재제출)에 묶인 것이라 공정 칸에 가져가지 않는다
         coalesce((select jsonb_agg(f.value - 'resubmit' order by f.ord)
                   from jsonb_array_elements(d.files) with ordinality f(value, ord)), '[]'::jsonb)
  from documents d
  where d.kind = 'quote'
  on conflict (project_id, kind) do nothing
  returning project_id
)
insert into audit_log (id, project_id, actor, action, field, old_value, new_value, at)
select gen_random_uuid()::text, m.project_id, '마이그레이션 0099 (한백 지시 2026-10-13)',
       '서류 칸 옮김', 'quote', '계약 서류 · 견적서 (SK)', '시공 · 행위신고 · 견적서 (SK)', now()
from moved m;

delete from documents d
where d.kind = 'quote'
  and exists (select 1 from process_documents x where x.project_id = d.project_id and x.kind = 'skQuote');

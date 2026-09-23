-- 계약이 파기된 SK 쪽 현장 HB-2026-064 를 지운다 (한백 지시 2026-09-23 「지우자」)
--
-- 0084 에서 영업비 1차 4,200,000원을 HB-2026-184(플러그링크 재계약 건)로 옮겼다.
-- 이제 064 에는 지급 원장 줄이 없어 삭제 가드(pg-store deleteProject)를 통과한다.
-- 같은 아파트가 목록에 둘로 서 있던 것을 하나로 정리한다.
--
-- ★저장소가 하는 일을 그대로 한다★ deleteProject 는 세 가지를 한다:
--   1. 지급 원장에 줄이 있으면 거절한다 — 여기서도 먼저 센다.
--   2. 현장을 지운다 (딸린 표는 FK cascade).
--   3. ★파일은 지우지 않고★ 감사기록에 주소를 남긴다. Vercel Blob 에는 휴지통도 시점
--      복구도 없고 삭제가 영구다 — 현장 하나 지우는 것으로 계약서·증빙이 영영 사라지면
--      안 된다(2026-08-29). 감사기록은 FK 가 없어 현장이 지워져도 살아남는 유일한
--      자리다. 나중에 정말 지울 때 그 줄이 목록이 된다.
-- 마이그레이션이 저장소를 안 지나므로 3번을 여기서 손으로 적는다 — 안 적으면 그 파일들이
-- 주인도 목록도 없이 남는다.

do $$
declare
  v_name  text;
  v_paid  int;
  v_urls  text[];
begin
  select name into v_name from projects where id = 'HB-2026-064';

  /*
   * 그 현장이 없는 DB 는 이미 지운 뒤다 — 할 일이 없다.
   * 조용히 넘긴다(여기서 멈추면 개발 빌드와 CI 가 깨진다).
   */
  if v_name is null then
    raise notice 'HB-2026-064 이 없습니다 — 건너뜁니다';
    return;
  end if;

  /*
   * ★0084 와 같은 조건으로 건너뛴다★ 184 가 없는 DB 는 개발 DB 다 — 거기서는 0084 도
   * 건너뛰어 원장이 064 에 그대로 있다. 그 상태에서 지우면 마곡 사고와 같은 일이 되고,
   * 거절하면 개발 빌드와 CI 가 깨진다. 이 합치기와 무관한 DB 이니 손대지 않는다.
   */
  if not exists (select 1 from projects where id = 'HB-2026-184') then
    raise notice 'HB-2026-184 가 없는 DB 입니다 — 이 합치기와 무관하므로 건너뜁니다';
    return;
  end if;

  /*
   * ★돈이 오간 현장은 못 지운다★ — 0084 가 안 돌았거나 되돌려졌으면 여기서 멈춘다.
   * 마곡 사고(2026-09-16)가 정확히 이 자리였다: 현장을 통째로 지우면 확정된 배치의
   * 잠금(assertBatchOpen)을 안 지나고 원장이 빠져나간다.
   */
  select count(*) into v_paid from payout_entries where project_id = 'HB-2026-064';
  if v_paid > 0 then
    raise exception 'HB-2026-064 에 지급 원장 %건이 남아 있습니다 — 0084 이관을 먼저 확인하세요', v_paid;
  end if;

  -- 파일 주소를 먼저 모은다 — cascade 뒤에는 물을 곳이 없다.
  -- ★files 배열이 정본이다★ (migrations/0021) — blob_url 은 첫 장의 사본이라 그것만
  -- 보면 두 번째 장부터가 목록에서 빠진다.
  select array_agg(distinct u) into v_urls from (
    select blob_url as u from documents where project_id = 'HB-2026-064'
    union all
    select f->>'url' from documents, jsonb_array_elements(files) f
     where project_id = 'HB-2026-064'
    union all
    select blob_url from process_documents where project_id = 'HB-2026-064'
    union all
    select f->>'url' from process_documents, jsonb_array_elements(files) f
     where project_id = 'HB-2026-064'
  ) s where u is not null;

  delete from projects where id = 'HB-2026-064';

  insert into audit_log (id, project_id, actor, action, field, old_value, new_value, at)
  values (
    gen_random_uuid()::text, 'HB-2026-064', '마이그레이션 0085 (한백 지시 2026-09-23)',
    '현장 삭제', 'name', v_name,
    'SK일렉링크 계약 파기 — 플러그링크로 재계약한 HB-2026-184 로 합쳤다 (영업비 1차는 0084 에서 이관)',
    now()
  );

  if coalesce(array_length(v_urls, 1), 0) > 0 then
    insert into audit_log (id, project_id, actor, action, field, old_value, new_value, at)
    values (
      gen_random_uuid()::text, 'HB-2026-064', '마이그레이션 0085 (한백 지시 2026-09-23)',
      '삭제 현장의 파일 보관', array_length(v_urls, 1)::text || '건',
      null, array_to_string(v_urls, E'\n'), now()
    );
  end if;
end $$;

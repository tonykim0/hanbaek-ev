-- 태양광 현장의 파일 — 상담 접수 때 · 그 뒤 현장 상세에서 붙인다 (한백 지시 2026-11-03 「상담접수할 때 파일도 올릴 수 있도록」)
-- 정의: lib/db/schema.ts 의 solarSites.files / lib/solar/sites.ts 의 SiteFile
--
-- 전기차 서류 칸(documents.files)과 같은 모양 — 파일 목록을 jsonb 배열로 둔다. 파일은 Blob 의 solar-sites/{현장}/ 아래에 있고
-- 브라우저가 직접 올린 뒤(서버리스 본문 한도 4.5MB) 서버가 우리 저장소에서 찾아 붙인다(app/api/solar/sites/[id]/files).
-- 붙이기 · 빼기는 한 줄 update 로 한다(files || … / jsonb 걸러내기) — 읽고-고치고-쓰기가 아니라 동시에 올려도 한 장이 사라지지
-- 않는다(전기차 감사 M10 의 경합).
--
-- 멱등: add column if not exists.

alter table solar_sites add column if not exists files jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'solar_sites' and column_name = 'files') then
    raise exception 'solar_sites.files 가 안 섰습니다';
  end if;
end $$;

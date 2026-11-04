-- 공지를 사업으로 가른다 — 전기차 · 태양광 (한백 지시 2026-11-04 「태양광에 있는 공지내용은 지워줘야지 전기차만 해당되는데,
-- 모든 공지와 알림은 분리해(전기차/태양광)」)
-- 정의: lib/db/schema.ts 의 notices.biz · users.solar_notices_read_at / lib/data/store/notices.ts
--
-- 지금까지 쓴 공지는 전부 전기차의 것이다 — 칸의 기본값 'ev' 가 그대로 채운다. 그래서 태양광 공지(/solar/notices)는 빈 채로
-- 시작하고, 전기차 공지는 /notices 에만 선다. 알림은 0107 에서 이미 갈랐다(공지 메모 알림은 이제 그 공지의 사업으로 간다).
--
-- 읽음 시각도 사업마다 따로다 — 태양광 공지 화면을 연 것이 전기차 공지를 읽은 것이 아니다. 전기차는 그대로 notices_read_at,
-- 태양광은 solar_notices_read_at(비어 있으면 「아직 안 열었다」 — 그 뒤의 태양광 공지가 다 새것이다).
--
-- 멱등: add column if not exists · create index if not exists.

alter table notices add column if not exists biz text not null default 'ev';
alter table users add column if not exists solar_notices_read_at timestamptz;

create index if not exists notices_biz_created_idx on notices (biz, created_at);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'notices' and column_name = 'biz') then
    raise exception 'notices.biz 가 안 섰습니다';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'solar_notices_read_at') then
    raise exception 'users.solar_notices_read_at 이 안 섰습니다';
  end if;
end $$;

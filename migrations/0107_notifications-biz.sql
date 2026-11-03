-- 알림을 사업으로 가른다 — 전기차 · 태양광 (한백 지시 2026-11-03 「알림도 전기차랑 태양광이랑 구분 — 지금까지 모든 알림은
-- 전기차 알림이라 전기차 페이지에서만 볼 수 있어야」)
-- 정의: lib/db/schema.ts 의 notifications.biz / lib/data/store/notifications.ts
--
-- 지금까지 쌓인 알림은 전부 전기차다(현장 글 · 반려 · 보완요청 · 대기번호 · 승인 · 공지 메모) — 칸의 기본값 'ev' 가 그대로 채운다.
-- 전기차 알림은 /notifications, 태양광 알림은 /solar/notifications 가 보이고 사이드바 배지도 그 사업의 것만 센다.
--
-- 멱등: add column if not exists · create index if not exists.

alter table notifications add column if not exists biz text not null default 'ev';

create index if not exists notifications_user_biz_idx on notifications (user_id, biz, created_at);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'notifications' and column_name = 'biz') then
    raise exception 'notifications.biz 가 안 섰습니다';
  end if;
end $$;

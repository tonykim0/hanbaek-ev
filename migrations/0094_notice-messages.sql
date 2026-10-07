-- 공지의 메시지 — 협력사 ↔ 한백 (한백 지시 2026-10-07 「공지에도 메모를 남기게 해서 협력사와 한백 간 메시지를
-- 주고받게, 그리고 알림으로 이어지게」).
--
-- ★대화는 공지 × 협력사마다 한 줄기다(org)★ — 같은 공지를 협력사 모두가 보므로, 한 업체가 남긴 말이 다른 업체에
-- 보이면 안 된다. 협력사는 제 업체의 줄기만, 한백은 전부 본다. author 는 「한백」 또는 협력사 이름(진행현황과 같다),
-- author_id 는 지우기 권한을 가르는 데만 쓴다.
create table if not exists notice_messages (
  id text primary key,
  notice_id text not null references notices(id) on delete cascade,
  org text not null,
  author text not null,
  author_id text,
  body text not null,
  at timestamptz not null default now()
);
create index if not exists notice_messages_thread_idx on notice_messages (notice_id, org, at);

-- 알림이 현장 말고 공지에도 선다 — 현장이 없는 알림이 생긴다
alter table notifications alter column project_id drop not null;
alter table notifications add column if not exists notice_id text references notices(id) on delete cascade;
alter table notifications add column if not exists notice_msg_id text references notice_messages(id) on delete cascade;
create index if not exists notifications_notice_idx on notifications (user_id, notice_id) where notice_id is not null;

-- 알림 — 진행현황 메모가 상대방에게 간다 (한백 지시 2026-10-05 「메모·댓글을 우리와 협력사 간 소통 창구로 —
-- 내가 남긴 댓글이 상대방에게 알림으로 가는 거지」).
--
-- 받는 사람마다 한 줄이다(남길 때 펼쳐 넣는다 — lib/notify.ts 가 누구에게 갈지 정한다). 읽음은 그 줄의 read_at.
-- 글(project_notes)을 지우면 알림도 같이 사라진다 — 없는 글을 가리키는 알림은 눌러도 갈 데가 없다.
create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  note_id text not null references project_notes(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;

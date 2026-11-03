-- 에이전트 메일 — 담당이 초안을 쓰고, 한백이 승인하면 콘솔이 한백의 다음(카카오) 메일로 보낸다
-- (한백 2026-11-03 「한백 전기차 콘솔에서 직접 보내게하고싶어」 · 「내가 자동메일을 보내는건데 특정 경우에만 … 난 그거에 대해
--  승인을 하고 너가 메일을 보내는건데」 · 「내 다음카카오 이메일로만 보내면 되는거고 형식도 정해져있는건데」).
--
-- 보내는 계정은 콘솔에 하나다 — 메일 주소와 카카오 앱 비밀번호(메일 프로그램용)로 다음 메일 서버(SMTP)에 붙는다.
-- 앱 비밀번호는 AUTH_SECRET 에서 만든 열쇠로 잠가 둔다(lib/agents/secret-box) — 이 표만 새어도 메일함이 열리지 않는다.
-- 화면에도 응답에도 비밀번호는 나가지 않는다.
create table if not exists mail_accounts (
  id text primary key,                 -- 'mail' 한 줄
  email text not null,
  token text not null,                 -- 잠근 앱 비밀번호
  server text not null,                -- 붙는 곳 — smtp.daum.net:465
  connected_by text not null,
  connected_at timestamptz not null default now()
);

-- 보낼 메일 — 에이전트가 대화 중에 초안을 올린다(draft_mail). 한백이 「승인하고 보내기」를 눌러야 나간다.
-- status: draft(승인 대기) · sending(보내는 중 — 두 번 나가지 않게 이 줄을 먼저 잡는다) · sent · failed(다시 보낼 수 있다) ·
-- discarded(버림 — 되살릴 수 있다). 붙일 파일은 그 담당에게 넘긴 파일(agent_files)의 id 다.
create table if not exists agent_mails (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  message_id text references agent_messages(id) on delete set null,   -- 초안을 쓴 에이전트의 답
  status text not null default 'draft',
  to_addrs jsonb not null default '[]',
  cc_addrs jsonb not null default '[]',
  subject text not null,
  body text not null,
  file_ids jsonb not null default '[]',
  error text,
  from_addr text,
  sent_ref text,                       -- 메일 서버가 붙인 접수 표시(250 답의 글)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by text
);
create index if not exists agent_mails_agent_idx on agent_mails (agent_id, created_at);
create index if not exists agent_mails_message_idx on agent_mails (message_id);

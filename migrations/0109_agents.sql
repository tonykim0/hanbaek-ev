-- 에이전트 — 한백의 일을 나눠 맡는 AI 담당 (한백 지시 2026-11-01 「운영사별 담당자 정해주고, 정산담당자, 열린구매 상신
-- 담당자, 전략담당자의 현황을 웹사이트에서 보고싶어」 · 2026-11-02 「각 운영사별로 해야 할 업무들과 각 담당자와의
-- 커뮤니케이션을 기록해야해 · 그 업무들에 대한 정의도 내가 담당자별로 지정할거야」).
--
-- 담당 여덟을 심는다 — 운영사 다섯(types/project CPO_NAMES) · 정산 · 열린구매(아지트에 올릴 지출 글) · 전략·기획(시장 정보 ·
-- 전략 · 기획). ★에이전트가 보는 현장·지급·기성은 여기 베끼지 않는다★ — 콘솔이 이미 셈하는 것을 부를 때마다 읽는다
-- (dual-write 금지). 여기 남는 것은 콘솔 어디에도 없던 셋이다: 한백이 적는 업무 정의 · 할 일 · 오간 말.
create table if not exists agents (
  id text primary key,
  kind text not null,          -- operator · settlement · purchase · strategy (lib/agents/kinds)
  cpo text,                    -- 운영사 담당만 — projects.cpo 와 같은 말
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- 업무 정의 — 한백이 담당마다 적는다. 에이전트는 이것을 지시로 읽는다
create table if not exists agent_duties (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  title text not null,
  body text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists agent_duties_agent_idx on agent_duties (agent_id, sort);

-- 할 일 — 한백이 적거나, 대화 중에 에이전트가 적는다(author 가 가른다). 기한은 'YYYY-MM-DD' 글자(지급일과 같다)
create table if not exists agent_tasks (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  title text not null,
  note text,
  project_id text references projects(id) on delete set null,
  due text,
  done_at timestamptz,
  author text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_tasks_agent_idx on agent_tasks (agent_id, done_at);

-- 오간 말 — user(지시, 에이전트가 답한다) · note(기록만, 답하지 않는다) · agent(에이전트의 말).
-- meta 는 에이전트의 말에만: 모델 · 걸린 시간 · 비용 어림 · 찾아본 출처 · 적은 할 일
create table if not exists agent_messages (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  role text not null,
  author text not null,
  author_id text,
  body text not null,
  meta jsonb,
  at timestamptz not null default now()
);
create index if not exists agent_messages_thread_idx on agent_messages (agent_id, at);

insert into agents (id, kind, cpo, name, sort) values
  ('op-hec',      'operator',   '현대엔지니어링', '현대엔지니어링 담당', 10),
  ('op-nice',     'operator',   '나이스인프라',   '나이스인프라 담당',   20),
  ('op-sk',       'operator',   'SK일렉링크',     'SK일렉링크 담당',     30),
  ('op-pluglink', 'operator',   '플러그링크',     '플러그링크 담당',     40),
  ('op-everon',   'operator',   '에버온',         '에버온 담당',         50),
  ('settlement',  'settlement', null,             '정산 담당',           60),
  ('purchase',    'purchase',   null,             '열린구매 담당',       70),
  ('strategy',    'strategy',   null,             '전략·기획 담당',      80)
on conflict (id) do nothing;

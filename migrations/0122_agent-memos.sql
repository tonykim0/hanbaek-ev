-- AI에이전트의 메모장 (한백 2026-11-05 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는 방법은 없나?」 → 「진행해」).
--
-- 담당이 한백에게서 들은 사실 · 정한 것 · 바라는 방식을 주제마다 한 장씩 적어 두는 자리다. agent_id 가 있으면 그 담당의 메모,
-- 없으면 그 사업(biz)의 팀이 같이 쓰는 공용 메모다. 담당은 부를 때마다 제목만 읽고, 지시에 제목의 낱말이 나오면 콘솔이 내용을
-- 펼쳐 붙이고, 나머지는 담당이 열어 본다(lib/agents/memos). 담당이 대화 중에 적고(save_memo) 한백이 화면에서 고친다.
-- 대화 원문은 agent_messages 에 그대로 있다 — 메모에 없는 것은 담당이 거기서 찾는다(search_history).
create table if not exists agent_memos (
  id text primary key,
  biz text not null,
  agent_id text references agents(id) on delete cascade,
  title text not null,
  body text not null default '',
  author text not null,
  by_agent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists agent_memos_agent_idx on agent_memos (agent_id);
create index if not exists agent_memos_team_idx on agent_memos (biz) where agent_id is null;

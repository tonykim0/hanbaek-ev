-- 0120 AI에이전트는 팀이다 — 전략·기획이 팀장, 운영사 · 사업자 담당과 정산은 실무자 (한백 2026-11-04)
--
-- 「결국엔 전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는 실무자들이야. 각 실무자들이 알고 있는 히스토리에 대해서
-- 전략 및 기획이 알고있어야하고, 전략및기획에서 세우는 목표나 OKR 방향성 또는 다른 사업구조에 대해서도 밑에 실무자들이
-- 알아야하는 상호보완구조여야해. 이건 전기차, 태양광 둘 다 같아」.
--
-- 위로 가는 것(실무자의 기록)은 저장할 것이 없다 — 팀장을 부를 때 실무자의 대화 · 할 일 · 업무 정의를 읽는다(store/agent-team
-- agentTeamLog). 아래로 가는 것(목표 · 방향)은 자리가 필요하다 — 이 표다. 줄은 팀장(전략·기획 담당)의 것이고(agent_id) 그 사업의
-- 실무자 모두가 부를 때마다 읽는다. 한백이 화면에서 적거나, 팀장이 대화 중에 올린다(save_direction — 적은 쪽 author 에 담당 이름).
create table if not exists agent_directions (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  title text not null,
  body text not null default '',
  sort integer not null default 0,
  author text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists agent_directions_agent_idx on agent_directions (agent_id, sort);

-- 팀장의 일을 두 전략·기획 담당의 업무 정의에 한 줄씩 — 일은 코드가 하지만(lib/agents/team · brain) 한백은 맡긴 일을 업무 정의
-- 목록에서 본다(0117 의 교훈). 저장소(saveAgentDuty)와 같은 모양이고 감사기록의 열쇠는 사업마다다(types/agents agentAuditKey —
-- 태양광은 「태양광 · 이름」). 같은 제목이 이미 있는 담당에는 넣지 않는다.
with want (agent_id, title, body) as (
  values
    ('strategy', '팀장 — 실무자 기록 읽고 목표 · 방향 세우기',
     '실무자(운영사 담당 다섯 · 정산 담당)가 한백과 나눈 지시 · 기록 · 답 · 할 일을 읽는다 — 부를 때마다 최근 2주 것이 붙고, 더 깊이는 실무자마다 찾아 읽는다. 목표 · OKR · 방향 · 사업 구조를 세우면 「목표 · 방향」에 올린다 — 실무자 모두가 부를 때마다 그것을 읽고 거기에 맞춰 일한다. 올리는 것은 한백이 정하라고 했거나 한백과 합의한 것만이다.'),
    ('solar-strategy', '팀장 — 실무자 기록 읽고 목표 · 방향 세우기',
     '실무자(사업자 담당 셋 · 정산 담당)가 한백과 나눈 지시 · 기록 · 답 · 할 일을 읽는다 — 부를 때마다 최근 2주 것이 붙고, 더 깊이는 실무자마다 찾아 읽는다. 목표 · OKR · 방향 · 사업 구조를 세우면 「목표 · 방향」에 올린다 — 실무자 모두가 부를 때마다 그것을 읽고 거기에 맞춰 일한다. 올리는 것은 한백이 정하라고 했거나 한백과 합의한 것만이다.')
), todo as (
  select w.agent_id, w.title, w.body,
         case when a.biz = 'solar' then '태양광 · ' || a.name else a.name end as audit_key
    from want w
    join agents a on a.id = w.agent_id
   where not exists (
     select 1 from agent_duties d where d.agent_id = w.agent_id and d.title = w.title
   )
), ins as (
  insert into agent_duties (id, agent_id, title, body, sort)
  select gen_random_uuid()::text, t.agent_id, t.title, t.body,
         coalesce((select max(d.sort) from agent_duties d where d.agent_id = t.agent_id), 0) + 10
    from todo t
  returning agent_id
)
insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
select gen_random_uuid()::text, null, '마이그레이션 0120 (한백 지시 2026-11-04)', '에이전트 업무 정의', t.audit_key, null,
       t.title || ' — ' || t.body
  from ins
  join todo t on t.agent_id = ins.agent_id;

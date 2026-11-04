-- 0114 운영사 담당 다섯의 기본 업무 정의 — 영업정책이 바뀌면 단가표 업데이트 (한백 지시 2026-11-04)
--
-- 「각 운영사별 담당자 업무 정의에 기본적인 업무로는 영업정책 업데이트 되면 키단가표 업데이트 필요 (원자료는 내가 제공할 예정)」.
-- 「키단가표」는 턴키단가표로 읽었다 — 콘솔의 단가표(단가 케이스)가 턴키단가 · 영업비 · 시공비를 갖는다.
--
-- 업무 정의는 한백이 화면에서 적는 값이다. 다섯 담당에 같은 줄을 운영 · 개발 DB 둘 다에 넣으려고 이번만 마이그레이션으로 한다.
-- 저장소(addAgentDuty)와 같은 모양으로 남긴다 — 감사기록 「에이전트 업무 정의」(주간 기록이 읽는다 · 값은 「제목 — 내용」).
-- 기본 업무라 맨 앞이다(지금 있는 것 중 가장 작은 순서 − 10). 같은 제목이 이미 있는 담당에는 넣지 않는다.

with ops as (
  select a.id, a.name
    from agents a
   where a.kind = 'operator'
     and not exists (
       select 1 from agent_duties d where d.agent_id = a.id and d.title = '영업정책이 바뀌면 단가표 업데이트'
     )
), ins as (
  insert into agent_duties (id, agent_id, title, body, sort)
  select gen_random_uuid()::text, o.id, '영업정책이 바뀌면 단가표 업데이트',
         '기본 업무. 운영사 영업정책이 업데이트되면 단가표(턴키단가)를 업데이트해야 한다. 원자료(새 영업정책)는 한백이 준다.',
         coalesce((select min(d.sort) from agent_duties d where d.agent_id = o.id), 10) - 10
    from ops o
  returning agent_id
)
insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
select gen_random_uuid()::text, null, '마이그레이션 0114 (한백 지시 2026-11-04)', '에이전트 업무 정의', o.name, null,
       '영업정책이 바뀌면 단가표 업데이트 — 기본 업무. 운영사 영업정책이 업데이트되면 단가표(턴키단가)를 업데이트해야 한다. 원자료(새 영업정책)는 한백이 준다.'
  from ins
  join ops o on o.id = ins.agent_id;

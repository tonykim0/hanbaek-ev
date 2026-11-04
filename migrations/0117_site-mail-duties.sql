-- 0117 나이스인프라 · 현대엔지니어링 담당의 업무 정의에 현장 양식 메일 한 줄씩 (한백 2026-11-04)
--
-- 「나이스랑 현대는 이메일 보내는거 있지않아?」 — 운영사 담당의 업무 정의를 물으니 다섯 모두 단가표 한 줄(0114)뿐이었다.
-- 양식 메일(0113 · 처음 지시는 그 머리말)은 코드(lib/site-mail · brain 의 siteMailRole)로만 들어가 업무 정의 목록에 없었다.
-- 일은 그대로 돈다 — 이 줄은 한백이 화면에서 무엇을 맡겼는지 보는 자리다(0115 의 열린구매 알림과 같은 까닭).
-- 업무 정의는 한백이 화면에서 적는 값이지만 0114 · 0115 처럼 운영 · 개발 DB 둘 다에 넣으려고 이번만 마이그레이션으로 한다.
-- 저장소(saveAgentDuty)와 같은 모양 — 감사기록 「에이전트 업무 정의」(값은 「제목 — 내용」). 단가표 줄 뒤(가장 큰 순서 + 10).
-- 같은 제목이 이미 있는 담당에는 넣지 않는다.
with want (agent_id, title, body) as (
  values
    ('op-nice', '계약서 접수되면 계약서 초안 메일 보내기',
     '나이스인프라 현장의 계약서가 접수되면 계약서 초안(워드)을 붙인 메일 초안을 쓰고, 할 일(「계약서 초안 메일 보내기」)로 올리고, 대화에 한 줄 남긴다 — 접수 때는 콘솔이 저절로 한다. 본문은 정해진 양식(인사 · 제출 정보 1~7번 · 맺음)이다. 받는 사람은 지난번에 보낸 주소를 이어 쓴다(처음이면 한백이 넣는다). 계약서 초안이 없으면 못 보낸다고 한백에게 알리고 할 일을 열어 둔다 — 채워지면 한백이 대화에서 다시 요청하고, 그때 초안을 다시 쓴다. 메일은 한백이 승인해야 나가고, 나가면 그 할 일은 저절로 끝난다.'),
    ('op-hec', '계약서 접수되면 설치승인서 메일 보내기',
     '현대엔지니어링 현장의 계약서가 접수되면 그 현장 서류 중 설치승인서를 붙인 메일 초안을 쓰고, 할 일(「설치승인서 메일 보내기」)로 올리고, 대화에 한 줄 남긴다 — 접수 때는 콘솔이 저절로 한다. 받는 사람은 지난번에 보낸 주소를 이어 쓴다(처음이면 한백이 넣는다). 설치승인서가 없으면 못 보낸다고 한백에게 알리고 할 일을 열어 둔다 — 채워지면 한백이 대화에서 다시 요청하고, 그때 초안을 다시 쓴다. 메일은 한백이 승인해야 나가고, 나가면 그 할 일은 저절로 끝난다.')
), todo as (
  select w.agent_id, w.title, w.body, a.name
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
select gen_random_uuid()::text, null, '마이그레이션 0117 (한백 지시 2026-11-04)', '에이전트 업무 정의', t.name, null,
       t.title || ' — ' || t.body
  from ins
  join todo t on t.agent_id = ins.agent_id;

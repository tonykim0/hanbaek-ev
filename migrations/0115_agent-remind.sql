-- 0115 정산 담당의 열린구매 상신 알림 — 알림이 담당을 가리킬 자리와 업무 정의 한 줄 (한백 지시 2026-11-04)
--
-- 「정산담당자는 정기결제일인 매월 10일 25일 3영업일 전에 열린구매 상신해야한다고 나한테 알림 줘야함」.
-- 매일 아침 크론(app/api/cron/agents)이 달력을 보고, 기한 날이면 정산 담당이 할 일 · 대화 한 줄 · 한백 관리자 알림을 남긴다
-- (lib/agents/open-purchase · store/agents agentRemind).
--
-- ① notifications.agent_id — 현장도 공지도 아닌 알림(담당의 정기 알림, kind 'remind')이 누르면 그 담당과의 대화로 가고,
--    그 대화를 열면 읽힌다. 담당이 지워지면 알림도 간다.
alter table notifications add column if not exists agent_id text references agents(id) on delete cascade;

-- ② 정산 담당의 업무 정의 — 알림 자체는 코드가 남긴다(모델을 부르지 않는다). 이 줄은 한백이 화면에서 무엇을 맡겼는지 보는 자리이자
--    담당이 「상신했어」를 듣고 그 할 일을 끝내는 근거다. 업무 정의는 한백이 화면에서 적는 값이지만 운영 · 개발 DB 둘 다에 넣으려고
--    0114 처럼 이번만 마이그레이션으로 한다. 저장소(saveAgentDuty)와 같은 모양 — 감사기록 「에이전트 업무 정의」(값은 「제목 — 내용」).
--    같은 제목이 이미 있으면 넣지 않는다.
with s as (
  select a.id, a.name
    from agents a
   where a.id = 'settlement'
     and not exists (
       select 1 from agent_duties d where d.agent_id = a.id and d.title = '정기결제 3영업일 전 열린구매 상신 알림'
     )
), ins as (
  insert into agent_duties (id, agent_id, title, body, sort)
  select gen_random_uuid()::text, s.id, '정기결제 3영업일 전 열린구매 상신 알림',
         '매월 10일 · 25일 정기결제의 3영업일 전 아침에 한백에게 열린구매를 상신하라고 알린다(주말 · 공휴일은 세지 않는다 — 결제일이 쉬는 날이면 그 앞 영업일에 나간다고 보고 센다). 알림 · 할 일 · 대화 한 줄은 콘솔이 저절로 남긴다(그날 나갈 지급 배치와 합계를 같이 적는다). 한백이 상신했다고 하면 그 할 일을 끝낸다.',
         coalesce((select max(d.sort) from agent_duties d where d.agent_id = s.id), 0) + 10
    from s
  returning agent_id
)
insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
select gen_random_uuid()::text, null, '마이그레이션 0115 (한백 지시 2026-11-04)', '에이전트 업무 정의', s.name, null,
       '정기결제 3영업일 전 열린구매 상신 알림 — 매월 10일 · 25일 정기결제의 3영업일 전 아침에 한백에게 열린구매를 상신하라고 알린다(주말 · 공휴일은 세지 않는다 — 결제일이 쉬는 날이면 그 앞 영업일에 나간다고 보고 센다). 알림 · 할 일 · 대화 한 줄은 콘솔이 저절로 남긴다(그날 나갈 지급 배치와 합계를 같이 적는다). 한백이 상신했다고 하면 그 할 일을 끝낸다.'
  from ins
  join s on s.id = ins.agent_id;

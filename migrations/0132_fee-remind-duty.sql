-- 0132 정산 담당의 업무 정의 한 줄 — 말일 플러그링크 위탁운영수수료 상신 알림 (한백 2026-11-11)
--
-- 「말일 며칠 전 「세금계산서를 넘겨 주세요」 알림」에 한백 「yes」. 매일 아침 크론(app/api/cron/agents · lib/agents/remind-run remindFee)이
-- 달력을 보고, 이번 달 말일(쉬는 날이면 앞 영업일) 지급의 3영업일 전이면 정산 담당이 할 일 · 대화 한 줄 · 한백 관리자 알림을 남긴다
-- (lib/agit/fee feeRemindDue · feeRemindPlan · store/agents agentRemind). 그 지급일의 위탁운영수수료 글을 아지트에 올리면 할 일이 저절로
-- 끝난다(store/agit finishAgitPost).
-- 알림 자체는 코드가 남긴다(모델을 부르지 않는다). 이 줄은 한백이 화면에서 무엇을 맡겼는지 보는 자리이자 담당이 「상신했어」를 듣고 그 할 일을
-- 끝내는 근거다 — 0115(열린구매 상신 알림)와 같은 까닭으로 이번만 마이그레이션으로 넣는다. 같은 제목이 이미 있으면 넣지 않는다.
with s as (
  select a.id, a.name
    from agents a
   where a.id = 'settlement'
     and not exists (
       select 1 from agent_duties d where d.agent_id = a.id and d.title = '말일 3영업일 전 위탁운영수수료 상신 알림'
     )
), ins as (
  insert into agent_duties (id, agent_id, title, body, sort)
  select gen_random_uuid()::text, s.id, '말일 3영업일 전 위탁운영수수료 상신 알림',
         '매월 말일(쉬는 날이면 그 앞 영업일)에 나가는 플러그링크 위탁운영수수료(지난달분)의 3영업일 전 아침에 한백에게 상신하라고 알린다 — 플러그링크가 보낸 위탁운영수수료 세금계산서와 한백이 끊은 충전매출 세금계산서를 이 대화에 넘겨 달라고 한다. 알림 · 할 일 · 대화 한 줄은 콘솔이 저절로 남긴다. 계산서를 받으면 agit_fee_post 로 긴급구매요청 초안을 짓고, 한백이 올리라고 하면 agit_publish 로 올린다. 아지트에 올리면 그 할 일이 저절로 끝나고, 한백이 따로 상신했다고 하면 그 할 일을 끝낸다.',
         coalesce((select max(d.sort) from agent_duties d where d.agent_id = s.id), 0) + 10
    from s
  returning agent_id
)
insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
select gen_random_uuid()::text, null, '마이그레이션 0132 (한백 2026-11-11)', '에이전트 업무 정의', s.name, null,
       '말일 3영업일 전 위탁운영수수료 상신 알림 — 매월 말일(쉬는 날이면 그 앞 영업일)에 나가는 플러그링크 위탁운영수수료(지난달분)의 3영업일 전 아침에 한백에게 상신하라고 알린다 — 세금계산서 두 장을 넘겨 달라고 한다. 알림 · 할 일 · 대화 한 줄은 콘솔이 저절로 남긴다. 아지트에 올리면 그 할 일이 저절로 끝난다.'
  from ins
  join s on s.id = ins.agent_id;

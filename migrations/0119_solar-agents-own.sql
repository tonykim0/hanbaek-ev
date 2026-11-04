-- 0119 태양광 AI에이전트를 전기차와 따로 — 담당 이름에서 「태양광」을 뗀다 (한백 2026-11-04)
--
-- 「아니 AI에이전트를 태양광전용으로 하나 만들라고. 기존에 전기차 AI에이전트에 붙이지 말고」. 0118 은 태양광 담당 두 이름에
-- 「태양광 …」을 붙였다 — 주간 기록이 감사기록을 담당 이름(audit_log.field)으로 찾아 전기차 담당과 이름이 겹치면 기록이 섞여서였다.
-- 그 이름이 전기차 조직에 덧붙인 담당처럼 읽힌다. 이제 감사기록의 열쇠를 사업마다 가른다(types/agents agentAuditKey — 전기차는
-- 이름 그대로, 태양광은 「태양광 · 이름」) — 그래서 태양광 조직 안에서는 전기차와 같은 이름을 쓴다: 전략·기획 담당 · 정산 담당.
--
-- 이미 남은 태양광 담당의 흔적(감사기록의 열쇠 · 할 일과 말의 「적은 쪽」)도 새 열쇠 · 이름으로 옮긴다 — 0118 배포(같은 날) 뒤
-- 아무도 안 썼으면 0건이다. 전기차 줄은 건드리지 않는다: 옮기는 옛 이름 다섯은 모두 태양광 담당만의 이름이다.
update agents set name = '전략·기획 담당' where id = 'solar-strategy' and name = '태양광 전략·기획 담당';
update agents set name = '정산 담당' where id = 'solar-settlement' and name = '태양광 정산 담당';

update audit_log l
   set field = '태양광 · ' || m.new_name
  from (values
    ('태양광 전략·기획 담당', '전략·기획 담당'),
    ('태양광 정산 담당', '정산 담당'),
    ('타이런트아이 담당', '타이런트아이 담당'),
    ('에이치에너지 담당', '에이치에너지 담당'),
    ('루모라 담당', '루모라 담당')
  ) as m(old_name, new_name)
 where l.field = m.old_name
   and l.action like '에이전트%';

update agent_tasks set author = '전략·기획 담당' where agent_id = 'solar-strategy' and author = '태양광 전략·기획 담당';
update agent_tasks set author = '정산 담당' where agent_id = 'solar-settlement' and author = '태양광 정산 담당';
update agent_messages set author = '전략·기획 담당' where agent_id = 'solar-strategy' and author = '태양광 전략·기획 담당';
update agent_messages set author = '정산 담당' where agent_id = 'solar-settlement' and author = '태양광 정산 담당';

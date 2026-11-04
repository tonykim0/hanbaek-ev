-- 0118 태양광 AI에이전트 — 전략·기획 · 사업자 담당 셋 · 정산 (한백 지시 2026-11-04)
--
-- 「태양광도 AI 에이전트 붙여줘. 운영사 담당자가 아니라 사업자 담당자 — 타이런트아이, 에이치에너지, 루모라 이렇게 3개.
-- 나머지는 동일하게」. 전기차의 조직(한백 → 전략·기획 → 운영사 담당 다섯 · 정산)과 같은 모양을 태양광에 따로 세운다 —
-- 운영사 자리가 사업자 셋이다. 사업마다 따로인 까닭: 사이드바 · 알림 · 공지가 사업마다 갈렸고(0107 · 0116), 전략 · 정산이
-- 읽는 자료도 사업마다 다르다(전기차는 현장 · 지급 · 기성, 태양광은 상담 접수한 현장뿐).
--
-- ① agents.biz — 'ev' 전기차 · 'solar' 태양광. 그전 담당 일곱은 전부 전기차다. 조직도는 사업마다(/admin/agents · /solar/agents).
-- ② agents.company — 사업자 담당(kind 'owner')이 맡은 사업자 이름. 운영사 담당의 cpo 와 같은 몫이지만 cpo 는 전기차 운영사
--    이름(정해진 다섯)이라 따로 둔다.
-- ③ 담당 다섯 — 이름이 전기차 담당과 겹치지 않게 짓는다: 주간 기록이 감사기록을 담당 이름(audit_log.field)으로 찾는다
--    (store/agents). 업무 정의는 비워 둔다 — 한백이 화면에서 적는다. 전기차 운영사의 기본 업무(단가표 · 0114)는 태양광에
--    단가표가 없어 옮기지 않는다.
alter table agents add column if not exists biz text not null default 'ev';
alter table agents add column if not exists company text;

insert into agents (id, kind, biz, company, name, sort) values
  ('solar-strategy',   'strategy',   'solar', null,           '태양광 전략·기획 담당', 110),
  ('solar-tyranteye',  'owner',      'solar', '타이런트아이', '타이런트아이 담당',     120),
  ('solar-henergy',    'owner',      'solar', '에이치에너지', '에이치에너지 담당',     130),
  ('solar-lumora',     'owner',      'solar', '루모라',       '루모라 담당',           140),
  ('solar-settlement', 'settlement', 'solar', null,           '태양광 정산 담당',      150)
on conflict (id) do nothing;

-- 0141 플러그링크 패스스루 집행 글 — 매달 올리는 아지트 열린구매 긴급구매요청 글을 정산 담당이 한백사업내역리스트 엑셀로 짓고 올린다
-- (한백 2026-11-28 「[긴급] 플러그링크 2026년 10월 패스스루 집행 이것도 주기적으로 올리는데」 → 「지급해야할 건수들은 매입내역에 있고 우리가
-- 받아야할건 … 총 매출(원도급사기준) 노랑색 하이라이트되어있는 부분이야. 알림 시점은 매월 25일 필요. 지금은 정기지급일만해」).
-- 글은 agit_posts 에 구분 「패스스루」로 선다(lib/agit/passthru).
--   agit_posts.passthru — 그 글의 재료: 차수 · 달 · 받을 돈(EPC 잔금 세금계산서 합) · 하도급사 지급 줄(엑셀의 은행 · 계좌 · 예금주 포함) ·
--                         플러그링크 입금 예정일 · 넘긴 엑셀 · 증빙 파일. 승인 때 이것으로 다시 지어 본 글과 견준다.
-- 그리고 정산 담당의 업무 정의 한 줄 — 매월 25일 상신 알림. 알림 자체는 코드가 남긴다(lib/agents/remind-run remindPassthru — 모델을 부르지
-- 않는다). 이 줄은 한백이 화면에서 맡긴 일을 보는 자리이자 담당이 「상신했어」를 듣고 그 할 일을 끝내는 근거다 — 0115 · 0132 와 같은 까닭으로
-- 마이그레이션으로 넣는다. 같은 제목이 이미 있으면 넣지 않는다.
ALTER TABLE agit_posts ADD COLUMN IF NOT EXISTS passthru jsonb;

with s as (
  select a.id, a.name
    from agents a
   where a.id = 'settlement'
     and not exists (
       select 1 from agent_duties d where d.agent_id = a.id and d.title = '매월 25일 패스스루 집행 상신 알림'
     )
), ins as (
  insert into agent_duties (id, agent_id, title, body, sort)
  select gen_random_uuid()::text, s.id, '매월 25일 패스스루 집행 상신 알림',
         '매월 25일(쉬는 날이면 그 앞 영업일) 아침에 한백에게 그달 플러그링크 패스스루 집행을 상신하라고 알린다 — 이번 차수가 든 한백사업내역리스트 엑셀(과 하도급사 세금계산서 · 공사하도급계약서 PDF)을 이 대화에 넘겨 달라고 한다. 알림 · 할 일 · 대화 한 줄은 콘솔이 저절로 남긴다. 엑셀을 받으면 agit_passthru_post 로 긴급구매요청 초안을 짓고(차수 · 지급 줄 · 받을 돈 · 지급일은 콘솔이 엑셀에서 읽는다), 한백이 올리라고 하면 agit_publish 로 올린다. 아지트에 올리면 그 할 일이 저절로 끝나고, 한백이 따로 상신했다고 하면 그 할 일을 끝낸다.',
         coalesce((select max(d.sort) from agent_duties d where d.agent_id = s.id), 0) + 10
    from s
  returning agent_id
)
insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
select gen_random_uuid()::text, null, '마이그레이션 0141 (한백 2026-11-28)', '에이전트 업무 정의', s.name, null,
       '매월 25일 패스스루 집행 상신 알림 — 매월 25일(쉬는 날이면 그 앞 영업일) 아침에 그달 플러그링크 패스스루 집행을 상신하라고 알린다 — 한백사업내역리스트 엑셀을 넘겨 달라고 한다. 알림 · 할 일 · 대화 한 줄은 콘솔이 저절로 남긴다. 아지트에 올리면 그 할 일이 저절로 끝난다.'
  from ins
  join s on s.id = ins.agent_id;

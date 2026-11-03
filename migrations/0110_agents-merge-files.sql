-- 에이전트 — 열린구매를 정산에 합치고, 순서를 전략 → 운영사 → 정산으로, 담당에게 넘긴 파일의 자리를 만든다.
-- (한백 2026-11-02 「정산담당이 열린구매까지 같이하는거야 · 전략이 최우선이고 그 이후에 운영사 담당자들이야」 ·
--  「담당자들한테 파일을 넘겨주는 경우도 있으니 파일업로드 기능도 넣어줘」)
--
-- 정산 담당이 기성관리(운영사에게서 수금) · 지급관리(협력사에게 영업비·시공비) · 열린구매(지급을 위한 아지트 지출 글과
-- 자료)를 다 맡는다. 열린구매 담당에게 남은 기록은 정산 담당으로 옮긴다 — 운영에는 아직 없고 개발 DB 의 시험 흔적뿐이다.
update agent_duties set agent_id = 'settlement' where agent_id = 'purchase';
update agent_tasks set agent_id = 'settlement' where agent_id = 'purchase';
update agent_messages set agent_id = 'settlement' where agent_id = 'purchase';
delete from agents where id = 'purchase';

-- 조직도와 목록의 순서 — 전략·기획이 맨 위, 그다음 운영사 다섯, 그다음 정산
update agents set sort = 10 where id = 'strategy';
update agents set sort = 20 where id = 'op-hec';
update agents set sort = 30 where id = 'op-nice';
update agents set sort = 40 where id = 'op-sk';
update agents set sort = 50 where id = 'op-pluglink';
update agents set sort = 60 where id = 'op-everon';
update agents set sort = 70 where id = 'settlement';

-- 담당에게 넘긴 파일 — 지시나 기록에 붙는다(대화가 그 파일의 기록이다). 파일 자체는 Blob 의 agent-files/<담당>/ 아래.
create table if not exists agent_files (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  message_id text not null references agent_messages(id) on delete cascade,
  name text not null,
  pathname text not null,
  url text not null,
  size integer not null default 0,
  content_type text,
  at timestamptz not null default now()
);
create index if not exists agent_files_agent_idx on agent_files (agent_id, at);
create index if not exists agent_files_message_idx on agent_files (message_id);

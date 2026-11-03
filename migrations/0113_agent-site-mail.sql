-- 운영사 담당이 접수된 현장의 양식 메일을 저절로 챙긴다 (lib/site-mail).
-- 한백 지시 2026-11-04 「나이스인프라 계약서가 접수되면 나이스인프라 담당자가 바로 할 일로 올려서 메일 초안작성해서 보내야해.
-- 그걸 대화창에서 보여줘야하고」 · 「현대엔지니어링의 경우, 접수되는 현장들 서류 중에 설치승인서를 메일로 보내줘야해. 만약 없을 경우,
-- 없어서 못보낸다고 알람을 줘야하고」.
--
-- 할 일에 양식 이름(kind — agent_mails.kind 와 같은 말)을 단다: 같은 현장 · 같은 양식의 열린 할 일을 두 번 적지 않고, 그 양식의
-- 메일이 나가면 할 일이 저절로 끝난다. 사람이 적은 할 일은 비어 있다.
-- 글자 칸이라 표를 안 바꾸고 더해지는 값 둘: 대화의 말(agent_messages.role) 'auto' — 콘솔이 규칙대로 담당의 이름으로 한 일(모델을
-- 부르지 않는다) · 알림(notifications.kind) 'agent' — 담당이 못 한 일(붙일 서류가 없어 메일을 못 씀, 한백 관리자에게).
alter table agent_tasks add column if not exists kind text;
create index if not exists agent_tasks_project_kind_idx on agent_tasks (project_id, kind);

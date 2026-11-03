-- 사전현장컨설팅 결과서 「6. 중복설치」를 현장에 남기고, 현장 서류를 붙여 보내는 양식 메일의 자리를 만든다
-- (한백 2026-11-03 「나이스인프라 제출정보에서 기설치 현황은 지금 사전현장컨설팅 결과서 중복설치에서 값을 가져와야해」 ·
--  「나이스인프라는 계약서 접수 시, 워드파일을 초안으로 받고 있어. 그 파일을 첨부한 메일 보내고싶어」).
--
-- consult_dup — 결과서 6번을 판독이 읽은 것(lib/consult-dup · lib/consult-dup-run). 결과서 칸의 파일이 바뀌면 다시 읽는다.
-- 나이스인프라 제출 정보 7번 「기설치 현황」이 이것을 쓴다(그전에는 접수 때 협력사가 고른 기설치 있음/없음이었다).
alter table projects add column if not exists consult_dup jsonb;

-- 현장 메일 — 계약서 초안(워드) 같은 현장 서류를 붙여 보내는 양식 메일. 붙일 서류는 그때의 파일을 그대로 적어 둔다(doc_files).
-- kind 는 양식의 이름(nice-contract-draft) — 같은 양식의 지난 메일에서 받는 사람을 가져온다.
alter table agent_mails add column if not exists project_id text references projects(id) on delete set null;
alter table agent_mails add column if not exists kind text;
alter table agent_mails add column if not exists doc_files jsonb not null default '[]';
create index if not exists agent_mails_project_idx on agent_mails (project_id, kind);

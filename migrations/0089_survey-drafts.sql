-- 실사보고서 임시 저장 — 클라우드 (한백 지시 2026-10-01 「브라우저 데이터 말고 클라우드에 저장」)
--
-- 값(거점·표시·체크리스트)은 이 표의 data(jsonb)에, 사진은 Blob 의 survey-drafts/<계정>/<id>/ 아래에
-- 둔다. data 안의 사진 자리는 {"__photo": true, url, path, name, type} 이다(lib/survey/draft-blobs).
-- 계정(owner_id)마다 여럿 — 같은 서식으로 여러 현장을 동시에 써 둘 수 있다. 남의 것은 안 보인다.
create table if not exists survey_drafts (
  id text primary key,
  owner_id text not null,
  owner_org text,
  cpo text not null,
  title text not null default '',
  photo_count integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists survey_drafts_owner_idx on survey_drafts (owner_id, cpo, updated_at desc);

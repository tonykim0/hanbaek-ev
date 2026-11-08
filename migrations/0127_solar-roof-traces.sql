-- AI 지붕 따기(「AI로 패널배치하기」)의 결과와 부른 기록 (2026-11-08, 한백 「1번부터 4번까지 다 진행해」 — 제안 1 「AI 패널배치 결과를
-- 서버 메모리가 아니라 DB 에 저장」).
--
-- 그전에는 라우트의 메모리(Map)였다 — 서버가 새로 뜨면 비어 같은 필지를 또 AI 에 보냈고(한 번 약 $0.05 · 개발 서버에서 같은 필지를
-- 두 번 부른 것을 봤다), 계정마다 하루 20번 한도도 같이 비었다. 운영(Vercel)은 함수가 자주 새로 뜬다.
--
-- 부를 때마다 한 줄: 부르기 전에 줄을 세우고(trace 비움 — 실패해도 한 번으로 센다, 돈이 들었다) 끝나면 결과를 적는다.
-- 같은 필지는 하루 안의 마지막 결과를 돌려주고, 한도는 그 계정의 오늘(한국 날짜) 줄 수다. 정본 자료가 아니라 다시 부르지 않으려는 기록이다
-- (lib/data/solar-roof-traces).
create table if not exists solar_roof_traces (
  id text primary key,
  pnu text not null,
  user_id text not null,
  trace jsonb,
  created_at timestamptz not null default now()
);
create index if not exists solar_roof_traces_pnu_idx on solar_roof_traces (pnu, created_at);
create index if not exists solar_roof_traces_user_idx on solar_roof_traces (user_id, created_at);

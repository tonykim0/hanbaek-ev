-- 아지트 열린구매 글 (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — team-hanbaek.agit.io).
--
-- 아지트 그룹의 웹훅(https://agit.io/webhook/<토큰>)에 {"text": …} 를 보내면 그 그룹에 글이 선다. 한백이 고른 것:
--   · 올리는 때 — 한백이 거래명세서 화면에서 「아지트에 올리기」를 눌렀을 때(그때 콘솔의 금액으로 다시 짓는다)
--   · 글 하나 — 결제일 하나(그날 나가는 배치 전부)
-- agit_hooks  웹훅 주소 한 줄(id 'agit') — 주소가 곧 열쇠라 잠가 둔다(lib/agents/secret-box). DB 마다 따로라 개발 · 프리뷰는 연결하지
--             않는 한 운영 그룹에 글을 못 쓴다.
-- agit_posts  올린 글(올리는 중 · 올림 · 못 올림) — 한 결제일에 여러 번 올릴 수 있다(금액이 바뀌어 다시 올리는 일).
-- assignees   요청 글의 담당자(아지트 ID 배열, 한백 2026-11-08 「아지트 글에서 담당자 설정도 필요해」 — 한 번 정해 두기).
--             연결 줄에 두고(다시 연결해도 남는다), 올린 글에는 그때 붙인 사람을 남긴다.
create table if not exists agit_hooks (
  id text primary key,
  token text not null,
  assignees jsonb not null default '[]'::jsonb,
  connected_by text not null,
  connected_at timestamptz not null default now()
);

create table if not exists agit_posts (
  id text primary key,
  pay_date text not null,
  status text not null,
  body text not null,
  total bigint not null,
  batches integer not null,
  error text,
  assignees jsonb not null default '[]'::jsonb,
  posted_by text not null,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create index if not exists agit_posts_pay_date_idx on agit_posts (pay_date, created_at);

-- 개발 DB 에는 담당자 칸 없는 앞 판(0124_agit-posts — 번호가 겹쳐 0126 으로 옮겼다)이 먼저 돌았다
alter table agit_hooks add column if not exists assignees jsonb not null default '[]'::jsonb;
alter table agit_posts add column if not exists assignees jsonb not null default '[]'::jsonb;

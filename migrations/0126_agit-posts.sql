-- 아지트 열린구매 글 (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — team-hanbaek.agit.io).
--
-- 아지트 그룹의 웹훅(https://agit.io/webhook/<토큰>)에 {"text": …, "task": {"assignees": […]}} 를 보내면 그 그룹에 요청 글이 선다.
-- 한백이 고른 것:
--   · 글 하나 — 결제일 하나(그날 나가는 배치 전부)
--   · 정산 담당이 초안을 올리고 한백이 승인하면 올린다(2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면
--     정산담당에이전트가 아지트에 글을 올리는 구조」) — 승인할 때 콘솔의 금액으로 다시 짓는다
--   · 요청 글의 담당자는 한 번 정해 둔다(같은 날 「아지트 글에서 담당자 설정도 필요해」)
-- agit_hooks  웹훅 주소 한 줄(id 'agit') — 주소가 곧 열쇠라 잠가 둔다(lib/agents/secret-box). DB 마다 따로라 개발 · 프리뷰는 연결하지
--             않는 한 운영 그룹에 글을 못 쓴다. assignees 는 요청 글의 담당자(아지트 ID 배열) — ★연결과 따로다★(같은 날 「담당자는
--             미리 넣어둘수없나」): 연결 전에 넣어 둘 수 있고(token 이 빈 줄) 끊어도 남는다(끊기는 token 만 비운다).
-- agit_posts  글 한 줄(초안 · 올리는 중 · 올림 · 못 올림) — 한 결제일에 여러 줄일 수 있다(금액이 바뀌어 다시 올리는 일).
--             message_id 는 카드가 서는 정산 담당 대화의 말 · assignees 는 올릴 때 붙인 담당자 · again 은 다시 올리는 초안 ·
--             agit_id · agit_url 은 아지트가 돌려준 그 글(카드의 「아지트에서 보기」).
create table if not exists agit_hooks (
  id text primary key,
  token text,
  assignees jsonb not null default '[]'::jsonb,
  connected_by text,
  connected_at timestamptz
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
  message_id text,
  again boolean not null default false,
  agit_id text,
  agit_url text,
  posted_by text not null,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

-- 개발 DB 에는 앞 판(0124_agit-posts — 번호가 겹쳐 0126 으로 옮겼다)이 먼저 돌았다 — 칸을 먼저 맞추고 색인을 단다
alter table agit_hooks add column if not exists assignees jsonb not null default '[]'::jsonb;
alter table agit_hooks alter column token drop not null;
alter table agit_hooks alter column connected_by drop not null;
alter table agit_hooks alter column connected_at drop not null;
alter table agit_hooks alter column connected_at drop default;
alter table agit_posts add column if not exists assignees jsonb not null default '[]'::jsonb;
alter table agit_posts add column if not exists message_id text;
alter table agit_posts add column if not exists again boolean not null default false;
alter table agit_posts add column if not exists agit_id text;
alter table agit_posts add column if not exists agit_url text;

create index if not exists agit_posts_pay_date_idx on agit_posts (pay_date, created_at);
create index if not exists agit_posts_message_idx on agit_posts (message_id);

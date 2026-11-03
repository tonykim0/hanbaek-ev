-- 태양광 사업 — 계정의 태양광 참여 · 상담 접수한 현장 (한백 지시 2026-11-03)
-- 정의: lib/db/schema.ts 의 users.solar · solarSites / lib/solar/sites.ts
--
-- ★왜★ 「에코일렉은 태양광도 같이할거야 · 현장관리에서 상담 개소 접수 할 수 있도록」.
-- 태양광 화면은 한백만 보던 것을 참여 계정에 연다 — 협력사 계정마다 users.solar 를 켜고 끄고(계정설정),
-- 켠 계정은 사업 전환(전기차 | 태양광)이 보이고 제 소속의 태양광 현장을 본다.
-- 현장은 상담 접수로 들어온다 — 지금은 상담 칸 하나뿐이다(다음 단계는 정해지면 붙인다).
--
-- 현장 번호는 SL-연도-순번이고 순번은 시퀀스에서 받는다 — 지운 현장의 번호를 다시 쓰지 않는다(전기차에서
-- 지운 번호를 새 접수가 다시 받아 두 현장의 이력이 섞였다, 2026-10-29).
--
-- 멱등: add column if not exists · create … if not exists. 에코일렉 켜기는 꺼진 줄만 켠다.

alter table users add column if not exists solar boolean not null default false;

-- 에코일렉은 태양광도 같이한다(한백 2026-11-03) — 협력사 구분의 계정만. 끄는 것은 계정설정에서
update users set solar = true
 where org = '에코일렉' and role in ('sales', 'cons', 'salesCons') and solar = false;

create sequence if not exists solar_sites_seq;

create table if not exists solar_sites (
  id text primary key,                       -- SL-2026-001
  name text not null,                        -- 현장명(상호 · 건물명)
  address text not null,
  kind text not null,                        -- roof 지붕형 · ground 지상형
  customer text,                             -- 고객 담당자
  phone text,
  memo text,
  org text,                                  -- 담당 협력사 — 한백이 직접 받은 현장은 null
  created_by text not null,                  -- 접수한 계정(로그인 ID)
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists solar_sites_org_idx on solar_sites (org, created_at);

-- 검산 — 칸과 표가 실제로 섰나. 없으면 코드가 그것을 읽다가 런타임에 죽는다.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'solar') then
    raise exception 'users.solar 가 안 섰습니다';
  end if;
  if not exists (select 1 from information_schema.tables where table_name = 'solar_sites') then
    raise exception 'solar_sites 가 안 섰습니다';
  end if;
end $$;

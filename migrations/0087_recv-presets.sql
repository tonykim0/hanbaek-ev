-- 협력사별 자주 쓰는 충전기 수령지 (한백 지시 2026-09-30)
--
-- 같은 시공사가 여러 현장을 한 창고·사무실로 받는다. 현장마다 주소·담당자·연락처를
-- 새로 치지 않게, 협력사(시공사) 이름으로 묶어 저장해 두고 골라 넣는다.
-- org 는 normalizeOrg 를 거친 이름이다 — 보이지 않는 문자 차이로 목록이 갈리지 않게.
create table if not exists recv_presets (
  id text primary key,
  org text not null,
  addr text not null,
  name text,
  phone text,
  created_at timestamptz not null default now()
);
create index if not exists recv_presets_org_idx on recv_presets (org);

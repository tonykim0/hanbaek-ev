-- 진행현황을 계약·시공으로 가른다 (한백 지시 2026-09-17
-- 「진행현황 및 메모를 계약과 시공으로 나눠서 각 탭 마다 설정하고. 최상위에 있는건 제거하자」)
--
-- 머리말 아래 한 자리에 다 쌓이고 있었다 — 계약 때 오간 말과 시공 중의 사정이 한 줄기로
-- 섞여서, 시공을 보는 사람이 계약 얘기를 걷어내며 읽어야 했다. 칸을 갈라 각 탭이 자기
-- 이야기만 갖는다.
--
-- 옛 기록의 갈래는 ★시각으로★ 정한다: 계약 확정 전에 남긴 것은 계약, 그 뒤는 시공.
-- 손으로 갈라 줄 근거가 글마다 있지 않다 — 대신 아무 글도 사라지지 않고, 각 줄이 한쪽에는
-- 반드시 선다. 확정 전 현장의 글은 전부 계약이다(아직 시공이 시작되지 않았다).

alter table project_notes add column if not exists scope text;

-- 확정일은 text(YYYY-MM-DD)고 남긴 시각은 timestamptz 다 — 사람이 보는 날짜(서울)로 견준다.
-- 확정 당일까지는 계약으로 둔다: 그날 오간 말은 대개 계약을 마무리하는 이야기다.
--
-- ★날짜꼴이 아닌 값은 캐스팅하지 않는다★ — text 칸이라 '' 나 딴 글자가 한 줄만 있어도
-- ::date 가 그 자리에서 터지고, 그러면 배포 빌드가 통째로 멈춘다(마이그레이션이 빌드 앞에
-- 선다). 꼴이 아니면 확정을 모르는 것이니 계약으로 둔다 — 개발 DB 는 진행현황이 0건이라
-- 이 갈래를 데이터로 밟아 볼 수 없었다.
update project_notes n
set scope = case
    -- ★null 을 먼저 가른다★ — null 은 정규식에도 비교에도 null 이라, 안 가르면 아직 계약도
    -- 확정 안 된 현장의 글이 else 로 흘러 「시공」이 된다.
    when p.contract_confirmed_at is null then '계약'
    when p.contract_confirmed_at !~ '^\d{4}-\d{2}-\d{2}$' then '계약'
    when (n.at at time zone 'Asia/Seoul')::date <= p.contract_confirmed_at::date then '계약'
    else '시공'
  end
from projects p
where p.id = n.project_id
  and n.scope is null;

-- 현장이 없는 고아 줄은 FK(on delete cascade)가 막지만, 남아 있으면 계약으로 둔다
update project_notes set scope = '계약' where scope is null;

-- 새 글은 화면이 갈래를 같이 보낸다 — 기본값은 안전망이다
alter table project_notes alter column scope set default '시공';
alter table project_notes alter column scope set not null;

do $$
declare
  c_contract int;
  c_const int;
  c_bad int;
begin
  select count(*) filter (where scope = '계약'),
         count(*) filter (where scope = '시공'),
         count(*) filter (where scope not in ('계약', '시공'))
    into c_contract, c_const, c_bad
    from project_notes;

  -- 갈래가 둘뿐이어야 한다 — 화면이 두 탭만 그리므로 다른 값은 어디에도 안 보인다
  if c_bad > 0 then
    raise exception '진행현황 갈래가 계약·시공이 아닌 줄 %건', c_bad;
  end if;

  raise notice '진행현황 갈래: 계약 %건 · 시공 %건', c_contract, c_const;
end $$;

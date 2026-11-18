-- 계정의 「정산 보기」 끄기(users.hide_pay) · 이브이솔루션 (시공) 계정을 (영업) 소속의 정산 안 보는 시공 계정으로 (한백 지시 2026-11-18)
-- 정의: lib/db/schema.ts users.hidePay / lib/roles.ts effectiveVisibility · seesPay
--
-- ★왜★ 0136 이 이브이솔루션 현장의 시공사를 「이브이솔루션 (영업)」으로 옮겼다 — (영업)이 턴키업체로 수금부터 세금계산서까지 지급을
-- 다 맡는다. 그러자 한백 「이브이솔루션(시공)은 협력사 정산관리랑 지급관리만 안보이면돼. 그대신 모든 현장은 보여야해」.
-- 현장을 보는 열쇠와 시공을 적는 손(공정 · 시공 서류)은 소속이다(lib/roles canAccessProject · lib/process processEditOf —
-- 현장의 시공사와 같은 소속의 시공사 · 턴키 계정). 그래서 (시공) 계정을 (영업) 소속으로 옮겨 이브이솔루션 현장을 다 보고 시공을 적게
-- 하고, 돈은 이 칸이 가린다: 켜면 그 계정은 금액을 하나도 안 받고(영업비 · 시공비 · 단가 — 저장소가 지운다) 협력사 정산관리 탭 ·
-- 지급관리 · 거래명세서 · 정산 현황이 안 보이고 세금계산서 발행 할 일도 안 선다. 구분은 시공사 그대로라 영업사 차례(계약 서류
-- 할 일)는 안 받는다(lib/todo-types COURTS_OF_ROLE). 계정설정의 「정산 보기」 칸에서 켜고 끈다.
--
-- 멱등: add column if not exists · 소속이 아직 (시공)인 협력사 계정만 옮긴다 — 다시 돌면 0건. 감사기록은 옮긴 계정마다 둘(소속 · 정산 보기).

alter table users add column if not exists hide_pay boolean not null default false;

with moved as (
  update users
     set org = '이브이솔루션 (영업)', hide_pay = true
   where org = '이브이솔루션 (시공)' and role in ('sales', 'cons', 'salesCons')
  returning id
)
insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
select gen_random_uuid()::text, null, '마이그레이션 0137 (한백 2026-11-18)', '계정 ' || moved.id, f.field, f.old_value, f.new_value
  from moved
 cross join (values ('org', '이브이솔루션 (시공)', '이브이솔루션 (영업)'), ('hidePay', '봄', '안 봄')) as f(field, old_value, new_value);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'hide_pay') then
    raise exception 'users.hide_pay 가 안 섰습니다';
  end if;
end $$;

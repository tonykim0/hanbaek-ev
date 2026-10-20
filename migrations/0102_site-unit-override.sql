-- 현장 대당 영업비·시공비를 ★값 그대로★ 적는 칸 (한백 지시 2026-10-20 「가감 칸에 +100,000 을 적지 말고 그냥 130 으로」).
--
-- 0101 은 대당 가감액(+100,000)을 적는 칸이었다. 한백은 「이 현장 영업비는 130만」처럼 값으로 말하고 값으로 고친다 —
-- 그래서 칸을 값으로 바꾼다: 비어 있으면 단가 케이스 값, 적혀 있으면 그 값이 이 현장의 대당 금액이다(케이스·라인은
-- 그대로, 운영사 턴키도 그대로라 마진이 그 차이만큼 준다 — lib/settlement siteRuleOf). 화면에 고치는 자리·따로 표시하는
-- 자리는 없다 — 한백이 Claude Code 로 요청하면 이 칸에 직접 적는다.
--
-- 0101 의 세 칸(sales_unit_adjust · cons_unit_adjust · unit_adjust_note)은 이제 아무도 안 읽는다 — 값도 하나도 안 적혔다.
-- 지우지 않고 둔다: 마이그레이션이 배포보다 먼저 돌아서, 지우면 아직 바뀌기 전 배포가 그 칸을 찾다 터진다(promo_extend_deduct
-- 와 같은 이유). 새 코드가 다 나간 뒤 따로 지운다.
alter table projects add column if not exists sales_unit_override integer;
alter table projects add column if not exists cons_unit_override integer;
alter table projects add column if not exists unit_override_note text;

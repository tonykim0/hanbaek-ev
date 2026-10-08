-- 끝난 보완 이력에 붙잡혀 계약보완에 선 현장 둘을 계약접수로 되돌린다 (한백 지시 2026-10-08 「광주 광산 첨단라인2차
-- 입주자대표회의 · 인천 미추홀 태평아파트 — 여기도 계약접수 단계로」). 0097 과 같은 까닭이다:
--   첨단라인2차 — 9/17 반려 뒤 계약 확인 → 10/8 확인 취소 (지금 규칙이면 확인이 이력을 닫았다)
--   태평아파트  — 10/7 반려 → 고쳐 올림·접수 → 10/8 한백이 접수 취소 (고침 배포 직전에 눌렀다)
-- 프로덕션 전체에서 이 모양(접수·확인 전 · 반려 0건 · 판이 끝난 이력)은 이 둘뿐이었다(2026-10-08 조회).
-- 그 모양 그대로일 때만 지운다 — 그사이 다시 반려·접수됐으면 건드리지 않는다.
update projects p set contract_fix_asked_at = null
where p.id in ('HB-2026-154', 'HB-2026-223')
  and p.contract_fix_asked_at is not null
  and p.contract_submitted_at is null
  and p.contract_confirmed_at is null
  and not exists (select 1 from documents d where d.project_id = p.id and d.status = 'rejected');

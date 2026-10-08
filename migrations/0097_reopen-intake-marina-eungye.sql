-- 한백이 접수를 무른 현장 셋을 계약접수로 되돌린다 (한백 지적 2026-10-08 「경기 시흥 마리나베이101 2블럭 접수 취소해서
-- 계약접수 단계로 넘어가야 하는데 계약보완에 있네」 · 3블럭 · 은계타운 상가도 마찬가지).
--
-- 셋 다 9/4 반려 → 고쳐 올림 → 9/16 계약 확인 → 10/8 한백이 확인 취소·접수 취소. 반려는 0건인데 9/4 의 보완요청
-- 이력(contract_fix_asked_at)이 남아 보드가 계약보완에 세웠다(lib/board). 이제는 계약 확인·한백의 접수 취소가 그 이력을
-- 지운다(store/contract) — 이 셋은 그 고침 전에 무른 것이라 손으로 닫는다.
--
-- 그 모양 그대로일 때만 지운다(접수·확인 전 · 반려 0건) — 그사이 다시 반려됐으면 건드리지 않는다.
update projects p set contract_fix_asked_at = null
where p.id in ('HB-2026-158', 'HB-2026-159', 'HB-2026-161')
  and p.contract_fix_asked_at is not null
  and p.contract_submitted_at is null
  and p.contract_confirmed_at is null
  and not exists (select 1 from documents d where d.project_id = p.id and d.status = 'rejected');

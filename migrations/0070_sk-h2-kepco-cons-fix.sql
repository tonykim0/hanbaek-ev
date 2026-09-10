-- SK 하반기(7/20) 한전불입 케이스 시공비 정정 — 120 → 100 (한백 확인 2026-09-10)
-- lib/pricing-policy-sk-2609.ts(SK_H2_KEPCO_FIX) 에서 생성 — 손으로 고치지 마세요

-- 7/20 한전불입 시공비 정정 — 120 → 100 (한백 확인 2026-09-10). 협력사 몫 220 은 그대로, 영업·시공 나눔만 바뀐다.
-- ★참조 라인에 소급된다★ — check-sk-cases.ts 로 참조·잠금을 본 뒤 한백이 결정했다(네 현장 다 턴키·회사 몫 불변).
-- 옛 값일 때만 고치고, 그때만 감사기록·현장 메모를 남긴다(멱등).
do $$
declare
  fixed int;
begin
  update pricing_rules
     set sales_unit = 1200000, cons_unit = 1000000
   where id = 'sk-h2-y10-kepco-new' and sales_unit = 1000000 and cons_unit = 1200000;
  get diagnostics fixed = row_count;
  if fixed = 0 then
    return;   -- 이미 고쳐졌거나 값이 다르다 — 두 번 적지 않는다
  end if;

  -- 감사기록 — 저장소(updatePricingRule)가 남기는 것과 같은 모양
  insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
  values (gen_random_uuid()::text, null, '마이그레이션 0070 (한백 확인 2026-09-10)', '단가 케이스 수정',
          'sk-h2-y10-kepco-new', '영업 100만 · 시공 120만', '영업 120만 · 시공 100만 — 노션 오기 정정');

  -- 참조 현장의 협력사 정산관리 메모 맨 위에 한 줄 (settlements 행이 없는 현장은 만든다)
  insert into settlements (project_id, pay_note)
  select l.project_id, '2026-09-10 SK 하반기 한전불입 케이스 정정 — 시공비 120만 → 100만, 영업비 100만 → 120만(기당). 노션 단가표 입력 오기를 바로잡음(한백 확인). 협력사 합계 220만/기는 그대로, 영업비·시공비 칸 사이 이동. 이미 나간 영업비 1차는 옛 기준이라 2차 잔액이 차액을 흡수함.'
    from contract_lines l
   where l.pricing_rule_id = 'sk-h2-y10-kepco-new'
  group by l.project_id
  on conflict (project_id) do update
     set pay_note = '2026-09-10 SK 하반기 한전불입 케이스 정정 — 시공비 120만 → 100만, 영업비 100만 → 120만(기당). 노션 단가표 입력 오기를 바로잡음(한백 확인). 협력사 합계 220만/기는 그대로, 영업비·시공비 칸 사이 이동. 이미 나간 영업비 1차는 옛 기준이라 2차 잔액이 차액을 흡수함.' || case when coalesce(settlements.pay_note, '') = '' then '' else E'\n' || settlements.pay_note end;
end $$;


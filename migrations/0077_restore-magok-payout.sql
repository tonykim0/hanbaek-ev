-- 마곡럭스나인 영업비 1차 3,920,000원을 새 현장으로 옮겨 되살린다 (한백 지시 2026-09-16)
--
-- ★무슨 일이 있었나★ 2026-09-16 23:23 에 HB-2026-124(서울 강서 마곡럭스나인오피스텔 ·
-- SK일렉링크 · 환경부)을 지웠다. 그 현장에 지급 원장 한 줄이 매달려 있었고 cascade 로
-- 같이 사라졌다:
--     notion-ST340-영업비-1차 · 영업비 1차 · 3,920,000원 · 2026-08-26 · 노션 정산관리 ST340
--
-- 그 배치(엘앤에스 · 영업비 · 2026-08-26)는 ★2026-08-28 최종 확정★되고 2026-08-30 에
-- 세금계산서(「엘엔에스(대상전력)_26년 1차 선금.pdf」)까지 붙어 있었다. 계산서는 옛 합계
-- 그대로인데 원장만 51,660,000 → 47,740,000 원으로 줄었다(9/14 백업 덤프와 대조).
--
-- ★한백 결정★ 「새 현장(자체투자) 몫으로 옮길거야 · 기존 거래명세서에는 마곡럭스나인
-- 기존 값을 다시 넣어줘」. 같은 현장이 오늘 HB-2026-173(자체투자)으로 다시 접수됐고
-- 지급처도 같은 엘앤에스라, ★원래 날짜 그대로★ 되살리면 그 거래명세서에 같은 현장명으로
-- 다시 찍히고 배치 합계도 51,660,000 원으로 돌아온다.
--
-- ★저장소로는 못 한다★ — addPayoutEntry 는 확정된 배치를 거절한다(assertBatchOpen).
-- 그 문은 옳다: 여기서만 우회하고, 옛 값이 없을 때만 넣어 다시 돌아도 안전하게 한다.
--
-- ★금액은 그대로 둔다★ — 나간 돈의 기록이다. 새 현장은 자체투자라 단가가 달라 계획액과
-- 어긋날 수 있는데, 그 차이는 초과/미달 지급으로 화면에 드러나는 것이 맞다. 원장이
-- 「얼마를 주기로 했나」가 아니라 「얼마가 나갔나」를 적는 자리다.
--
-- 되풀이를 막는 문은 같은 배포에 있다(pg-store deleteProject — 지급 줄이 있으면 거절).

do $$
declare
  v_name text;
  v_org  text;
  v_sum  bigint;
begin
  select name, coalesce(sales_org, gc_org) into v_name, v_org
    from projects where id = 'HB-2026-173';

  /*
   * 그 현장이 없는 DB 는 개발 DB 다 — 프로덕션의 한 현장을 고치는 파일이라 거기서는
   * 할 일이 없다. 조용히 넘긴다(여기서 멈추면 개발 빌드와 CI 가 깨진다).
   */
  if v_name is null then
    raise notice 'HB-2026-173 이 없는 DB 입니다 — 건너뜁니다';
    return;
  end if;
  if v_org is distinct from '엘앤에스' then
    raise exception '지급처가 엘앤에스가 아닙니다(%) — 배치가 갈리므로 멈춥니다', v_org;
  end if;

  -- 이미 있으면 아무것도 안 한다 (멱등)
  if exists (select 1 from payout_entries where id = 'notion-ST340-영업비-1차') then
    return;
  end if;

  insert into payout_entries (id, project_id, kind, category, amount, at, note, created_at, step)
  values (
    'notion-ST340-영업비-1차', 'HB-2026-173', '영업비', '1차', 3920000, '2026-08-26',
    '노션 정산관리 ST340 — 환경부 건(HB-2026-124) 삭제로 사라진 줄을 자체투자 건으로 옮겨 되살림 (한백 지시 2026-09-16)',
    '2026-08-26T23:29:48.230Z', 1
  );

  insert into audit_log (id, project_id, actor, action, field, old_value, new_value, at)
  values (
    gen_random_uuid()::text, 'HB-2026-173', '마이그레이션 0077 (한백 지시 2026-09-16)',
    '지급 원장 복원', 'notion-ST340-영업비-1차',
    'HB-2026-124 (삭제됨)',
    '영업비 1차 3,920,000원 · 2026-08-26 — 확정된 배치(엘앤에스 영업비 2026-08-26)의 빠진 줄',
    now()
  );

  -- 그 현장 정산관리 메모에 한 줄 — 왜 자체투자 건에 환경부 시절 지급이 붙어 있는지
  update settlements
     set pay_note = '2026-09-16 환경부 건(HB-2026-124)에 나갔던 영업비 1차 3,920,000원(2026-08-26 지급)을 이 현장으로 옮겼습니다. 그 현장은 삭제됐고 원 지급일·금액 그대로입니다.'
       || case when coalesce(pay_note, '') = '' then '' else E'\n' || pay_note end
   where project_id = 'HB-2026-173';

  -- 되살린 뒤 그 배치 합계가 제자리인지 본다 — 아니면 배포를 멈춘다
  select coalesce(sum(e.amount), 0) into v_sum
    from payout_entries e join projects p on p.id = e.project_id
   where e.kind = '영업비' and e.at = '2026-08-26'
     and coalesce(p.sales_org, p.gc_org) = '엘앤에스';
  if v_sum <> 51660000 then
    raise exception '엘앤에스 영업비 2026-08-26 배치 합계가 % 원입니다 — 51,660,000 원이어야 합니다', v_sum;
  end if;
end $$;

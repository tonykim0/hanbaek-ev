-- 번동금호어울림A 영업비 1차 4,200,000원을 재계약 현장으로 옮긴다 (한백 지시 2026-09-23)
--
-- ★무슨 일이 있었나★ 같은 아파트가 현장 둘로 서 있다.
--     HB-2026-064  서울 강북 번호금동어울림   · SK일렉링크 · 환경부   · 5대 7년
--     HB-2026-184  서울 강북 번동금호어울림A · 플러그링크 · 자체투자 · 5대 7년
-- 주소가 같고(서울특별시 강북구 오현로 31길 85-7), 영업사·시공사 모두 엘앤에스다.
-- SK 쪽 계약이 파기되고 플러그링크로 재계약했는데(계약일 2026-09-10), 돈은 이미 SK
-- 지급정책으로 064 에서 나갔다:
--     notion-ST210-영업비-1차 · 영업비 1차 · 4,200,000원 · 2026-07-10 · 노션 정산관리 ST210
--
-- ★왜 옮기나★ 안 옮기면 184 가 「영업비를 한 푼도 안 받은 현장」으로 선다. 9/1 정책으로
-- 5대 × 100만 = 500만이 통째로 지급 가능으로 뜨고, 420만이 이미 나갔다는 사실은 사람
-- 머릿속에만 남는다. 마곡 때 배운 자리다 — 원장 밖의 약속은 안 지켜진다.
--
-- ★거래명세서는 어떻게 되나★ 배치는 지급처 × 구분 × 지급일이다(assemble.ts:557 —
-- 영업비의 지급처는 sales_org). 두 현장 모두 엘앤에스라 열쇠 세 값이 하나도 안 움직인다.
-- 7/10 엘앤에스 영업비 배치는 16건 58,975,000원 그대로고, 붙어 있는 세금계산서
-- (「대상전력_세금계산서_26년 6월.pdf」)도 총액으로 끊었으니 무관하다. 바뀌는 것은 그
-- 줄에 찍히는 현장명 한 칸뿐이다 — 번호금동어울림 → 번동금호어울림A. 명세서는 저장본이
-- 아니라 원장에서 다시 그려지고(assemble.ts:552 projectName), 같은 아파트·같은 협력사라
-- 오히려 사실에 가까워진다. 게다가 옛 이름은 오타였다.
--
-- ★저장소로는 못 한다★ — 그 배치는 2026-08-30 최종 확정이라 assertBatchOpen 이 막는다.
-- 그 문은 옳다: 여기서만 우회하고, 끝에 배치 합계를 세어 어긋나면 배포를 멈춘다.
--
-- ★금액·날짜·회차는 손대지 않는다★ 나간 돈의 기록이다. 184 는 자체투자라 단가가 달라
-- 계획액과 어긋날 수 있는데, 그 차이는 초과/미달 지급으로 화면에 드러나는 것이 맞다.
-- 남은 잔액 계산은 화면이 한다(9/1 정책 500만 − 420만 = 2차 80만, 회수 없음).
--
-- HB-2026-064 를 어떻게 할지는 이 파일에서 정하지 않는다 — 옮기고 나면 지급 0건이라
-- 삭제 가드를 통과하고, 명세서에 영향 없이 따로 처리할 수 있다.

do $$
declare
  v_src_org  text;
  v_dst_org  text;
  v_sum      bigint;
  v_cnt      int;
begin
  select sales_org into v_src_org from projects where id = 'HB-2026-064';
  select sales_org into v_dst_org from projects where id = 'HB-2026-184';

  /*
   * 그 현장이 없는 DB 는 개발 DB 다 — 프로덕션의 두 현장을 고치는 파일이라 거기서는
   * 할 일이 없다. 조용히 넘긴다(여기서 멈추면 개발 빌드와 CI 가 깨진다).
   */
  if v_dst_org is null then
    raise notice 'HB-2026-184 가 없는 DB 입니다 — 건너뜁니다';
    return;
  end if;

  -- 이미 옮겼으면 아무것도 안 한다 (멱등)
  if exists (
    select 1 from payout_entries
     where id = 'notion-ST210-영업비-1차' and project_id = 'HB-2026-184'
  ) then
    return;
  end if;

  if not exists (
    select 1 from payout_entries
     where id = 'notion-ST210-영업비-1차' and project_id = 'HB-2026-064'
  ) then
    raise exception '옮길 줄(notion-ST210-영업비-1차)이 HB-2026-064 에 없습니다 — 멈춥니다';
  end if;

  -- 지급처가 갈리면 배치가 갈리고 명세서 총액이 움직인다. 그 전에 멈춘다.
  if v_src_org is distinct from v_dst_org then
    raise exception '영업비 지급처가 다릅니다(064=% · 184=%) — 배치가 갈리므로 멈춥니다',
      v_src_org, v_dst_org;
  end if;

  update payout_entries
     set project_id = 'HB-2026-184',
         note = coalesce(note || ' / ', '')
           || 'SK 계약 파기 전(HB-2026-064)에 나간 영업비 1차 — 플러그링크 재계약 현장으로 이관 (한백 지시 2026-09-23)'
   where id = 'notion-ST210-영업비-1차';

  insert into audit_log (id, project_id, actor, action, field, old_value, new_value, at)
  values (
    gen_random_uuid()::text, 'HB-2026-184', '마이그레이션 0084 (한백 지시 2026-09-23)',
    '지급 원장 이관', 'notion-ST210-영업비-1차',
    'HB-2026-064 (SK일렉링크 · 환경부 — 계약 파기)',
    '영업비 1차 4,200,000원 · 2026-07-10 — 원 지급일·금액 그대로',
    now()
  ),
  (
    gen_random_uuid()::text, 'HB-2026-064', '마이그레이션 0084 (한백 지시 2026-09-23)',
    '지급 원장 이관', 'notion-ST210-영업비-1차',
    '영업비 1차 4,200,000원 · 2026-07-10',
    'HB-2026-184 (플러그링크 · 자체투자 — 재계약)로 옮김',
    now()
  );

  -- 그 현장 정산관리 메모에 한 줄 — 왜 자체투자 건에 SK 시절 지급이 붙어 있는지
  update settlements
     set pay_note = '2026-07-10 엘앤에스 영업비 거래명세서의 1차 4,200,000원은 SK일렉링크 계약 시절(HB-2026-064) 지급분입니다. 계약 파기 후 플러그링크로 재계약하며 이 현장으로 옮겼고, 지급일·금액은 그대로입니다. (한백 지시 2026-09-23)'
       || case when coalesce(pay_note, '') = '' then '' else E'\n' || pay_note end
   where project_id = 'HB-2026-184';

  -- 옮긴 뒤 그 배치가 제자리인지 본다 — 아니면 배포를 멈춘다
  select coalesce(sum(e.amount), 0), count(*) into v_sum, v_cnt
    from payout_entries e join projects p on p.id = e.project_id
   where e.kind = '영업비' and e.at = '2026-07-10' and p.sales_org = '엘앤에스';
  if v_sum <> 58975000 or v_cnt <> 16 then
    raise exception '엘앤에스 영업비 2026-07-10 배치가 %건 % 원입니다 — 16건 58,975,000 원이어야 합니다',
      v_cnt, v_sum;
  end if;
end $$;

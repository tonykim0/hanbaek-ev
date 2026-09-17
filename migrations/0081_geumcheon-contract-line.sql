-- 금천효성1차아파트에 계약대수를 넣는다 — 10년 × 5기 한전불입 (한백 확인 2026-09-17)
--
-- ★왜 비어 있었나★ 접수는 대수 없이도 통과한다(lib/intake-validate 는 「대수를 아직 안
-- 적었습니다 — 현장 상세에서 채웁니다」로 넘긴다 — 계약접수 칸은 처음 모으는 자리다).
-- 그런데 채울 자리가 없었다(한백 지적 「이건 왜 계약대수 수정이 안 돼?」). 대수가 없으면
-- 단가도 못 붙고 기성·지급 계획도 서지 않아 그 현장은 돈 쪽이 통째로 멈춘다.
-- 채우는 자리는 같은 배포에 있다(addContractLine) — 이 파일은 이미 들어온 그 현장을 맞춘다.
--
-- ★계약서에서 확인했다★ (스캔본이라 글자가 없어 그림으로 펴서 읽었다):
--   설치수량 5 기 · 계약기간 ■10년 □7년 · 사업구분 ■보조금사업 · 7kW 스마트완속충전기
--   서비스 이용자 금천효성1차 아파트입주자대표회의 (충청북도 청주시 상당구 수영로 198)
-- 수전방식은 접수에 적힌 한전불입이고, 한전불입이 붙는 교체유형은 환경부 신규뿐이다
-- (types/project powerTypesOfRepl).
--
-- 단가는 붙이지 않는다 — 어느 케이스인지는 계약일이 정한다(플러그링크 7/1~8/31 벌과
-- 9/1~12/31 벌이 둘 다 10년 한전불입을 갖는다). 한백이 화면에서 고른다.
-- 없을 때만 넣으므로 다시 돌아도 안전하다.

do $$
begin
  if not exists (select 1 from projects where id = 'HB-2026-174') then
    raise notice 'HB-2026-174 이 없는 DB 입니다 — 건너뜁니다';
    return;
  end if;
  if exists (select 1 from contract_lines where project_id = 'HB-2026-174') then
    raise notice 'HB-2026-174 에 이미 계약 라인이 있습니다 — 건너뜁니다';
    return;
  end if;

  insert into contract_lines (id, project_id, term_years, qty, power_type, repl_type, memo, pricing_rule_id, priced_at)
  values ('HB-2026-174-L1', 'HB-2026-174', 10, 5, '한전불입', '환경부 신규', null, null, null);

  update projects set repl_type = '환경부 신규'
   where id = 'HB-2026-174' and repl_type is null;

  insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
  values (gen_random_uuid()::text, 'HB-2026-174', '마이그레이션 0081 (한백 확인 2026-09-17)',
          '계약 라인 추가', 'HB-2026-174-L1', null,
          '10년 × 5대 · 한전불입 · 환경부 신규 — 계약서 확인(설치수량 5기 · 계약기간 10년)');
end $$;

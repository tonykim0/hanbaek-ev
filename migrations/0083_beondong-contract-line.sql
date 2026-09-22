-- 서울 강북 번동금호어울림A 에 계약대수를 넣는다 — 7년 × 5기 (계약서 확인 2026-09-22)
--
-- ★왜 0 대로 들어왔나★ 접수 화면의 자동채움이 판독한 대수를 버렸다. 「자체투자면 교체유형이
-- 둘이라 어느 칸인지 모른다」로 뭉뚱그렸는데, ★플러그링크는 자체투자를 안 가른다★
-- (SPLITS_SELF_REPL 은 에버온·SK뿐) — 칸이 하나뿐인데 비운 것이다. 그러고는 아무 말도 안 해서
-- 사람이 그대로 접수했고, 서버의 「대수를 아직 안 적었습니다」 경고는 화면에 그리는 자리가
-- 없었다. 뿌리는 같은 배포에서 막았다(한백 지적 「계약서에 다 나와있는데 왜 그냥 내보낸거야」).
--
-- ★계약서에서 확인했다★ (스캔본이라 그림으로 펴서 읽었다):
--   설치수량 5 기 · 계약기간 ■7년 □10년 · 사업구분 ■민간사업(=자체투자) · 7kW 스마트완속충전기
--   서비스 이용자 번동금호어울림A입주자대표회의 (서울특별시 강북구 오현로31길 85-7)
-- 수전방식은 접수에 적힌 모자분리이고, 교체유형은 플러그링크가 안 가르므로 대표값인
-- 제자리교체다(types/project SELF_REPLS[0] · 케이스 id 도 그것을 쓴다).
--
-- 단가는 붙이지 않는다 — 어느 시기 케이스인지는 계약일이 정한다. 한백이 화면에서 고른다.
-- 없을 때만 넣으므로 다시 돌아도 안전하다.

do $$
begin
  if not exists (select 1 from projects where id = 'HB-2026-184') then
    raise notice 'HB-2026-184 이 없는 DB 입니다 — 건너뜁니다';
    return;
  end if;
  if exists (select 1 from contract_lines where project_id = 'HB-2026-184') then
    raise notice 'HB-2026-184 에 이미 계약 라인이 있습니다 — 건너뜁니다';
    return;
  end if;

  insert into contract_lines (id, project_id, term_years, qty, power_type, repl_type, memo, pricing_rule_id, priced_at)
  values ('HB-2026-184-L1', 'HB-2026-184', 7, 5, '모자분리', '자체투자 (제자리교체)', null, null, null);

  update projects set repl_type = '자체투자 (제자리교체)'
   where id = 'HB-2026-184' and repl_type is null;

  insert into audit_log (id, project_id, actor, action, field, old_value, new_value)
  values (gen_random_uuid()::text, 'HB-2026-184', '마이그레이션 0083 (계약서 확인 2026-09-22)',
          '계약 라인 추가', 'HB-2026-184-L1', null,
          '7년 × 5대 · 모자분리 · 자체투자(제자리교체) — 계약서 확인(설치수량 5기 · 계약기간 7년 · 민간사업)');
end $$;

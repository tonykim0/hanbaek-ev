-- SK일렉링크 케이스의 시기 표기를 구간으로 — 「2026년 1월 26일 ~ 7월 19일」·「7월 20일 ~ 8월 31일」·「9월 1일 ~ 12월 31일」
-- (한백 지시 2026-09-10 「SK일렉링크도 플러그링크처럼 구간별로 날짜를 표시해줘야지」)
--
-- ★왜★ 시작일만 적혀 있으면 그 정책이 열려 있는 것처럼 읽힌다. 어느 계약일에 어느 케이스가
-- 맞는지 사람이 해석해야 하는 상태다 — 계약일과 견줄 수 있는 구간이어야 한다. 플러그링크가
-- 먼저 그렇게 갔다(migrations/0057·0060 · PL_START). SK 는 여기서 세 구간을 한꺼번에 맞춘다.
--
-- 덤으로 이름의 시기 표기도 한 꼴로 모은다 — 지금 SK 이름은 「(상반기)」·「(하반기)」·
-- 「(2026년 1월 26일)」·「(2026년 7월 20일)」 네 꼴로 갈려 있다(PL 이 겪은 것과 같은 갈림).
-- 이름은 적용 시작에서 유도되는 표시용 라벨이라 시작일과 같이 바꾼다(CaseForm).
--
-- 정렬·시기 탭·중복 판정은 앞 날짜를 읽는다(lib/pricing-match startKey → 2026-01-26 / 07-20 /
-- 09-01) — 케이스가 서는 자리는 그대로다. 연도를 빼면 못 읽으니 연도를 남긴다.
-- 정의 파일: lib/pricing-policy-sk-h2(SK_START) · lib/pricing-policy-sk-2609(SK_2609_START) ·
-- lib/pricing-policy-link-h2(SK 연동).
--
-- 멱등: 옛 표기만 겨냥한다 — 두 번째 실행은 0행이다.

-- ① 1/26 벌 — 7/20 정책이 그 뒤를 받으므로 7월 19일에 끝난다 (옛 「상반기」 표기도 함께)
update pricing_rules
   set start_date = '2026년 1월 26일 ~ 7월 19일',
       case_name  = regexp_replace(case_name, '^SK일렉링크 \((상반기|2026년 상반기|2026년 1월 26일)\)', 'SK일렉링크 (2026년 1월 26일 ~ 7월 19일)')
 where cpo = 'SK일렉링크'
   and start_date in ('2026년 1월 26일', '2026년 상반기');

-- ② 7/20 벌 — 9/1 정책이 그 뒤를 받는다(0073 이 설치조건 문장을 이미 8/31 로 맞췄다)
--
-- ★옛 시작일 표기 셋을 다 겨냥한다★ — 0009 가 「하반기」·「7월 21일」을 7/20 으로 통일했지만
-- 그 마이그레이션을 안 거친 DB(시드에서 새로 심은 개발 DB)에는 옛 값이 남는다. 실제로 개발 DB
-- 에서 검산이 그 셋을 잡았다(2026-09-10) — 프로덕션만 보고 짜면 다음 사람의 DB 에서 깨진다.
update pricing_rules
   set start_date = '2026년 7월 20일 ~ 8월 31일',
       case_name  = regexp_replace(case_name, '^SK일렉링크 \((하반기|2026년 하반기|2026년 7월 2[01]일)\)', 'SK일렉링크 (2026년 7월 20일 ~ 8월 31일)')
 where cpo = 'SK일렉링크'
   and start_date in ('2026년 7월 20일', '2026년 하반기', '2026년 7월 21일');

-- ③ 9/1 벌 — 끝은 12/31 (한백 결정 2026-09-10. SK 문서에 종료일이 없어 연 단위 관행을 따른다)
update pricing_rules
   set start_date = '2026년 9월 1일 ~ 12월 31일',
       case_name  = replace(case_name, 'SK일렉링크 (2026년 9월 1일) |', 'SK일렉링크 (2026년 9월 1일 ~ 12월 31일) |')
 where cpo = 'SK일렉링크'
   and start_date = '2026년 9월 1일';

-- ④ 9/1 벌의 설치조건 기간 문장도 끝을 채운다 (0071 이 「~ 계약일 기준」으로 찍었다)
update pricing_rules
   set install_terms = replace(install_terms, '적용: 2026-09-01 ~ 계약일 기준', '적용: 2026-09-01 ~ 12-31 계약일 기준')
 where cpo = 'SK일렉링크'
   and install_terms like '%적용: 2026-09-01 ~ 계약일 기준%';

-- 검산 — SK 케이스의 시작일은 셋 중 하나여야 하고, 이름의 괄호가 그 값과 같아야 한다
do $$
declare
  bad text;
begin
  select string_agg(id || ' [' || start_date || ']', ', ') into bad
    from pricing_rules
   where cpo = 'SK일렉링크'
     and (start_date not in ('2026년 1월 26일 ~ 7월 19일', '2026년 7월 20일 ~ 8월 31일', '2026년 9월 1일 ~ 12월 31일')
          or case_name not like 'SK일렉링크 (' || start_date || ') |%');
  if bad is not null then
    raise exception 'SK 케이스의 시기 표기가 맞지 않습니다: %', bad;
  end if;
end $$;

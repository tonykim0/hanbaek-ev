-- 「운영사 계약서 제출」 칸을 「계약서 제출」로, 그 뒤에 「기후부 승인」 칸을 (한백 지시 2026-11-17)
--
-- 한백 「계약관리 칸반에 운영사 계약서 제출로 되어있는데 이거 계약서 제출로 바꿔줘 · 기후부 승인이라는 단계를 하나 더
-- 만들어줘 행위신고 전에」. 단계 목록은 types/project PROCESS_STATUSES, 조건은 lib/process STATUS_GATES 다.
--
-- ① 이름 — ★저장값을 반드시 옮긴다★. asProcessStatus(lib/process)는 모르는 값을 첫 상태(계약완료)로 되돌린다
--    (0048 · 0052 가 같은 이유로 옛 값을 옮겼다). 새 코드는 옛 이름도 받는다(LEGACY_STATUS) — 이 마이그레이션이 돈 뒤
--    새 코드가 뜨기까지 1~2분, 옛 코드가 옛 이름으로 다시 적은 줄이 튕기지 않게.
--
-- ② 「기후부 승인」 — 환경부 승인일이 적힌 채 「계약서 제출」에 서 있는 환경부 사업 현장을 그 칸으로 옮긴다.
--    그 칸의 조건이 승인일이고(자체투자·기설치 연동은 그 칸을 안 지난다 — lib/process stepsOf), 앞으로는 승인일을 적는
--    순간 저장소가 옮긴다(store/process followApproval). 이미 적혀 있던 현장은 그 문을 지나지 않았으므로 여기서 한 번 옮긴다.
--    운영 해당 현장 5건(2026-11-17 백업으로 확인 — 전부 계약 확인이 끝난 환경부 사업).
--    차례(court)도 그 칸의 것으로 맞춘다 — 승인이 났으면 시공으로 넘길 한백의 차례다(lib/process COURT_AFTER_STATUS).
--
-- 멱등하다 — 다시 돌아도 ①은 옮길 줄이 없고 ②는 같은 판정을 다시 할 뿐이다.

update processes set status = '계약서 제출' where status = '운영사 계약서 제출';

update projects set court = '한백'
 where id in (
   select p.project_id
     from processes p
     join projects j on j.id = p.project_id
    where p.status = '계약서 제출'
      and coalesce(p.env_approval_date, '') <> ''
      and (j.biz_type = '환경부' or j.biz_type is null)
 );

update processes p set status = '기후부 승인'
  from projects j
 where j.id = p.project_id
   and p.status = '계약서 제출'
   and coalesce(p.env_approval_date, '') <> ''
   and (j.biz_type = '환경부' or j.biz_type is null);

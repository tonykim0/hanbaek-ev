-- 화면의 「환경부 승인 · 환경부 대기번호」를 「기후부」로 — 저장된 표시 글자 둘 (한백 지시 2026-11-17 「기후부로 바꿔」)
--
-- 승인일 · 대기번호 · 알림 · 기성 차수의 이름은 코드가 적는 글자라 코드만 고치면 된다. 여기는 ★DB 에 글자로 남아 있는 표시★ 둘이다.
-- 둘 다 표시용이고 어떤 판정도 이 글자를 보지 않는다(옛 코드가 1~2분 읽어도 화면의 글자만 다르다).
--
-- ① 정산 규칙의 이름 — settlementRuleNameOf(단계)가 만드는 글과 같아야 한다(lib/settlement). 그 함수가 이제 「기후부 승인」을 적는다.
--    ★단계(steps)의 트리거 글자 「환경부 승인」은 그대로 둔다★ — 규칙의 id 가 단계의 해시라(settlementRuleIdOf) 글자를 바꾸면
--    같은 규칙이 다른 id 가 되어 현장에 걸린 규칙을 못 찾는다. 화면은 triggerLabel 이 「기후부 승인」으로 바꿔 적는다.
update settlement_rules
   set name = replace(name, '환경부 승인', '기후부 승인')
 where name like '%환경부 승인%';

-- ② 이미 나간 승인 · 승인 취소 · 대기번호 알림 — 알림 목록의 꼬리표가 저장된 제목이다(components/NotificationList).
--    그대로 두면 같은 알림이 옛 것은 「환경부 승인」, 새 것은 「기후부 승인」 두 이름으로 섞여 선다.
--    글은 코드가 지은 한 줄뿐이다(lib/notify approvalNotice · approvalCancelNotice · queueNotice) — 사람이 쓴 글이 아니다.
update notifications
   set title = replace(title, '환경부', '기후부'),
       body  = replace(body,  '환경부', '기후부')
 where kind in ('approval', 'approvalCancel', 'queue')
   and (title like '%환경부%' or body like '%환경부%');

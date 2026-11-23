-- 비밀번호를 바꾼 시각(users.password_changed_at) — 그 전에 발급한 로그인은 다른 기기까지 풀린다 (한백 지시 2026-11-23)
-- 정의: lib/db/schema.ts users.passwordChangedAt / lib/auth/own-password.ts staleSession / lib/auth/session.ts getSessionUser
--
-- ★왜★ 한백 「각 계정에서 자기 비밀번호 재설정 할 수 있도록 해줘」 — 계정마다 「비밀번호 변경」(/account/password)이 생겼다.
-- 로그인은 서명된 쿠키 하나라(서버 저장소가 없다) 비밀번호를 바꿔도 이미 발급한 쿠키는 만료(24시간)까지 그대로 통했다 —
-- 비밀번호가 새어 바꾼 사람의 다른 기기(남이 쥔 기기 포함)가 하루 동안 그대로 열려 있다. 그래서 바꾼 시각을 두고, 그보다 먼저
-- 발급한 쿠키는 받지 않는다. 바꾼 그 기기는 새 쿠키를 받아 그대로 들어와 있다. 한백의 「비밀번호 재설정」도 이 칸을 찍는다.
--
-- 멱등: add column if not exists. 비어 있으면(지금 계정 모두) 아무 쿠키도 막지 않는다.

alter table users add column if not exists password_changed_at timestamptz;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'users' and column_name = 'password_changed_at') then
    raise exception 'users.password_changed_at 이 안 섰습니다';
  end if;
end $$;

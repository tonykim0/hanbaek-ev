-- 태양광 참여 — 보승이앤씨 · 엘앤에스도 켠다 (한백 지시 2026-11-03 「보승이앤씨, 엘앤에스도 태양광 탭 활성화해줘」)
-- 정의: lib/db/schema.ts 의 users.solar (migrations/0105 — 그때 에코일렉을 켰다)
--
-- 소속 글자는 「(주)」 · 「㈜」 · 「주식회사」 · 빈칸을 걷고 견준다 — 계정의 소속은 사람이 적은 값이라 같은 회사가
-- 「(주)엘앤에스」처럼 갈려 있을 수 있다. 협력사 구분의 계정만 — 한백 계정은 늘 본다.
-- 끄는 것은 계정설정의 「태양광」 칸이다.
--
-- 멱등: 꺼진 줄만 켠다.

update users set solar = true
 where solar = false
   and role in ('sales', 'cons', 'salesCons')
   and regexp_replace(coalesce(org, ''), '\s|\(주\)|㈜|주식회사', '', 'g') in ('보승이앤씨', '엘앤에스');

-- 0131 플러그링크 위탁운영수수료 글 — 매달 말 올리는 아지트 열린구매 긴급구매요청 글을 정산 담당이 짓고 올린다(한백 2026-11-10 「플러그링크 잉여금
-- 일부 처분의 건 - 위탁운영수수료 > 이것도 글도 매월말에 반복되는 상신인데 자동화시키고싶어」 → 「이건은 내가 에이전트한테 세금계산서를 올려주고 너가
-- 나머지를 처리해주는 방식으로」). 글은 agit_posts 에 구분 「위탁운영수수료」로 선다(lib/agit/fee).
--   agit_posts.fee        — 그 글의 재료: 몇 월분 · 차 · 세금계산서 두 장의 금액(콘솔이 읽은 것) · 충전매출 입금 예정일 · 넘긴 세금계산서 파일
--   agit_hooks.fee_payee  — 위탁운영수수료를 받는 플러그링크의 계좌(은행 · 계좌 숫자 · 예금주) — 엑셀에 적는다. 플러그링크는 콘솔 계정이 없어
--                           협력사 정보에 계좌가 없다. ★고정값 — 화면 없이 배포 뒤 Claude Code 가 넣는다★(저장소가 공개라 마이그레이션에 적지 않는다)
ALTER TABLE agit_posts ADD COLUMN IF NOT EXISTS fee jsonb;
ALTER TABLE agit_hooks ADD COLUMN IF NOT EXISTS fee_payee jsonb;

-- 아지트 열린구매 글의 긴급사유 (2026-11-09, 한백 「긴급에 대한 템플릿도 따로 만들어줘」 — lib/agit/post).
-- 비었으면 보통 글(글양식 구매요청간소화), 있으면 긴급 글(글양식 긴급구매요청 · 「3. 긴급사유 기재」에 그대로 · 끝에 cc @@team.finance).
-- 승인 때 글을 다시 지어 견주므로 모양(긴급인가 · 사유)을 줄에 둔다 — 글에서 거꾸로 읽지 않는다.
ALTER TABLE agit_posts ADD COLUMN IF NOT EXISTS urgent_reason text;

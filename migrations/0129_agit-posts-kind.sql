-- 아지트 열린구매 글의 구분 (2026-11-09, 한백 「seperate post, same format but different terms such as 영업위탁수수료 -> 시공비」 — lib/agit/post).
-- 글은 결제일 × 구분(영업비 · 시공비)마다 하나다 — 같은 날 나가도 시공비는 따로 올린다(세금계산서도 구분별로 따로 끊는다).
-- 그전 줄은 전부 영업비 글이었다(운영의 11-10 글 — 시공비 배치가 없던 날).
ALTER TABLE agit_posts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT '영업비';
CREATE INDEX IF NOT EXISTS agit_posts_pay_date_kind_idx ON agit_posts (pay_date, kind, created_at);

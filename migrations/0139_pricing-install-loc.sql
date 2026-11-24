-- 단가 케이스의 설치위치 — 실내 · 실외로 받는 단가가 갈리는 운영사가 있다(나이스 자체투자 · 한백 2026-11-24).
-- null 이면 구분 없음(둘 다 덮는다) — 지금까지의 케이스는 전부 그렇다. 금액이 든 케이스는 여기 적지 않는다
-- (운영사 정책은 대외비 · 저장소는 공개) — scripts/pricing-apply.ts 로 넣는다.
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS install_loc text;

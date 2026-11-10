-- 0130 아지트 계정 연결 — 정산 담당이 한백의 아지트 계정으로 열린구매 글을 직접 올린다(한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」).
-- 콘솔 서버가 한백의 아지트 로그인 쿠키를 잠가 쥐고(lib/agents/secret-box — 메일 앱 비밀번호와 같은 열쇠), 서버 브라우저가 그 로그인으로
-- 쓰는 칸을 채워 올린다(lib/agit/agit-web). ★비밀번호는 남기지 않는다★ — 연결할 때 한 번 로그인에 쓰고 버린다.
-- 웹훅(token · connected_*)은 11-09 부터 글 올리기에 안 쓴다 — 칸은 남긴다(지우지 않는다 · 읽는 곳이 없다).
ALTER TABLE agit_hooks ADD COLUMN IF NOT EXISTS session text;
ALTER TABLE agit_hooks ADD COLUMN IF NOT EXISTS session_login text;
ALTER TABLE agit_hooks ADD COLUMN IF NOT EXISTS session_by text;
ALTER TABLE agit_hooks ADD COLUMN IF NOT EXISTS session_at timestamptz;
ALTER TABLE agit_hooks ADD COLUMN IF NOT EXISTS session_until timestamptz;
ALTER TABLE agit_hooks ADD COLUMN IF NOT EXISTS session_error text;

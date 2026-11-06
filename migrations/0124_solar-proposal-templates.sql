-- 태양광 제안서의 틀과 조건 (2026-11-06, 한백 「필요에 따라 타이런트아이, 에이치에너지, 루모라로 사업유형별 제안서를 만들고 싶어.
-- 에너닷 예시 처럼」 · 「고객 주소랑 고객명 넣고, 사업자 선택하면 제안서가 자동생성되게」 · 「수정가능하게」).
--
-- 틀 하나(사업자가 준 파일 한 벌 — lib/solar/proposal/products TemplateKey)에 한 줄. 파일은 Blob 의 solar-proposals/<틀>/ 아래고
-- 여기는 그 주소 · 이름 · 크기 · 올린 때와 사람이다. 조건(단가 · 이벤트 · 가정)은 terms 의 숫자들이다.
-- ★값은 이 파일에 넣지 않는다★ — 저장소가 공개라서다(사업자 자료는 「Confidential」, 타이런트 업무협약서 3조). 한백 관리자가
-- 화면(부지 검토의 「제안서」)에서 틀을 올리고 조건을 넣는다.
create table if not exists solar_proposal_templates (
  key text primary key,
  file_url text,
  file_name text,
  file_size integer,
  file_at timestamptz,
  file_by text,
  terms jsonb not null default '{}'::jsonb,
  terms_at timestamptz,
  terms_by text
);

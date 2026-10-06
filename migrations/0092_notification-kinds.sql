-- 알림에 반려·보완요청을 싣는다 (한백 지시 2026-10-06 「반려를 하면 그것도 알림에 — 나의 메시지와 함께」).
--
-- 0090 의 알림은 진행현황 글 하나를 가리켰다(note_id). 반려·누락 서류 보완요청은 글이 아니라 서류 검수라
-- 알림 줄이 제 글을 갖는다: kind(note·reject·ask) · title(「반려 — 계약서」) · body(반려 사유 = 한백의 메시지) ·
-- doc_kind(반려한 서류 — 반려를 풀면 안 읽은 알림을 거둔다). scope(계약·시공)는 이제 줄에 직접 둔다 — 그 탭을
-- 열면 그 갈래의 알림이 읽힌다. 옛 줄의 scope 는 글에서 채운다.
alter table notifications add column if not exists kind text not null default 'note';
alter table notifications add column if not exists scope text;
alter table notifications add column if not exists doc_kind text;
alter table notifications add column if not exists title text;
alter table notifications add column if not exists body text;
alter table notifications alter column note_id drop not null;
update notifications n set scope = p.scope from project_notes p where n.note_id = p.id and n.scope is null;

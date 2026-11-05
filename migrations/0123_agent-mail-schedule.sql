-- AI에이전트 메일 예약 보내기 (한백 2026-11-05 「내가 내일 오전 9시에 보내달라니까 안된다네」 → 「왜 예약발송은 안되는거지」 → 「A로 충분해」).
--
-- 한백이 메일 카드에서 날짜를 골라 「예약」하면 status 'scheduled' · scheduled_at(그날 오전 9시, 한국 시각) · scheduled_by(예약한 사람)가
-- 서고, 매일 아침 크론(/api/cron/mails — vercel.json 00:00 UTC = 한국 오전 9시대)이 때가 된 예약을 보낸다. 승인은 예약하는 순간의 한백이다.
alter table agent_mails add column if not exists scheduled_at timestamptz;
alter table agent_mails add column if not exists scheduled_by text;

create index if not exists agent_mails_scheduled_idx on agent_mails (scheduled_at) where status = 'scheduled';

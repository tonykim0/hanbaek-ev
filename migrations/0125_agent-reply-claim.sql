-- AI에이전트 답은 담당마다 한 번에 하나 (2026-11-08 비용 검토).
--
-- 같은 담당에게 「답」이 동시에 두 번 들어오면 둘 다 모델을 불렀다 — 11-05 루모라 담당에게 7.5초 간격으로 두 요청이 와서
-- 같은 지시에 답이 둘 서고, 넘긴 파일 11만 토큰을 두 번 캐시에 써 그 한 답에 $1.49(반은 버린 돈)가 들었다. 답은 50초쯤 걸리고,
-- 그동안 다른 탭이나 새로 고친 화면에는 「다시 묻기」가 선다. replying_at 은 지금 답하는 중이라는 표지다 — 라우트가 부르기 전에
-- 잡고(비었거나 오래된 것만) 끝나면 놓는다(store/agents claimAgentReply · releaseAgentReply). 함수가 시한에 끊겨 못 놓은 표지는
-- lib/agents/memory REPLY_CLAIM_SECONDS 가 지나면 다음 요청이 가져간다.
alter table agents add column if not exists replying_at timestamptz;

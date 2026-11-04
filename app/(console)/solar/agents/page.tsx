import { AgentsTeam } from '@/components/agents/AgentsTeam';

export const metadata = { title: 'AI에이전트' };
export const dynamic = 'force-dynamic';

/**
 * AI에이전트 — 태양광 [한백 관리자] (한백 지시 2026-11-04 「태양광도 AI 에이전트 붙여줘. 운영사 담당자가 아니라 사업자
 * 담당자 — 타이런트아이, 에이치에너지, 루모라 이렇게 3개. 나머지는 동일하게」 · migrations/0118). 팀이다(위에서 아래로): 팀장
 * 전략·기획 → 실무자 사업자 담당 셋 · 정산 — 전기차와 같은 부품이다(components/agents/AgentsTeam).
 */
export default function SolarAgentsPage() {
  return <AgentsTeam biz="solar" />;
}

import { AgentsTeam } from '@/components/agents/AgentsTeam';

/* 탭은 화면 밖에서 읽히니 묶음 이름을 앞에 단다 — 화면 안의 제목은 「팀 현황」(사이드바 묶음 「AI에이전트」 밑) */
export const metadata = { title: 'AI에이전트 팀 현황' };
export const dynamic = 'force-dynamic';

/**
 * AI에이전트 — 전기차 [한백 관리자]. 팀이다(위에서 아래로): 팀장 전략·기획 → 실무자 운영사 담당 다섯 · 정산. 태양광은
 * /solar/agents 로 따로 선다(2026-11-04 — 모양은 같아 한 부품이다, components/agents/AgentsTeam).
 */
export default function AgentsPage() {
  return <AgentsTeam biz="ev" />;
}

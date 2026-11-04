import { AgentView } from '@/components/agents/AgentView';

export const metadata = { title: 'AI에이전트' };
export const dynamic = 'force-dynamic';

/** 담당 하나 — 태양광 [한백 관리자]. 전기차 담당은 /admin/agents/[id] 로 보낸다(components/agents/AgentView) */
export default function SolarAgentPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  return <AgentView biz="solar" id={params.id} week={searchParams.week ?? null} />;
}

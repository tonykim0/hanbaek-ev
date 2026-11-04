import { AgentView } from '@/components/agents/AgentView';

export const metadata = { title: 'AI에이전트' };
export const dynamic = 'force-dynamic';

/** 담당 하나 — 전기차 [한백 관리자]. 태양광 담당은 /solar/agents/[id] 로 보낸다(components/agents/AgentView) */
export default function AgentPage({ params, searchParams }: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  return <AgentView biz="ev" id={params.id} week={searchParams.week ?? null} />;
}

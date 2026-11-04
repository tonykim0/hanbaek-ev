/**
 * 업무 정의 — 한백이 담당마다 적는다(한백 지시 2026-11-02 「그 업무들에 대한 정의도 내가 담당자별로 지정할거야」).
 * 에이전트는 이것을 지시로 읽는다(lib/agents/brain) — 부를 때마다 지금의 정의를 읽으므로, 업무가 바뀌면 여기만 고치면 된다.
 * 모양은 팀 목표 · 방향과 같은 목록이다(TitledList).
 */
import type { AgentDuty } from '@/types/agents';
import { TitledList } from './TitledList';

export function AgentDuties({ agentId, duties }: { agentId: string; duties: AgentDuty[] }) {
  return (
    <TitledList
      heading="업무 정의"
      items={duties}
      url={`/api/agents/${agentId}/duties`}
      placeholder={{ title: '업무 이름', body: '정의 — 무엇을, 언제, 어떤 기준으로, 결과는 어떤 모양으로' }}
    />
  );
}

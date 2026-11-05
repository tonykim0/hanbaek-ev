/**
 * 메모장 — 담당이 한백에게서 들은 사실 · 정한 것 · 바라는 방식을 주제마다 적어 둔 것(migrations/0122 · 한백 2026-11-05 「비용을
 * 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는 방법」). 담당은 제목만 늘 읽고 내용은 그때그때 꺼내 쓴다(lib/agents/memos).
 * 담당이 대화 중에 적고, 한백이 여기서 고치고 더하고 지운다 — 잘못 적었거나 빠뜨린 것을 바로잡는 자리다. 모양은 업무 정의와 같은
 * 목록이다(TitledList). 팀 공용 메모는 그 사업의 담당 화면 모두에 같은 것이 선다.
 */
import type { AgentMemos as Memos } from '@/types/agents';
import { TitledList } from './TitledList';

export function AgentMemos({ agentId, memos }: { agentId: string; memos: Memos }) {
  const placeholder = {
    title: '제목 — 운영사 · 현장 번호 · 사람 · 주제를 「 · 」로 (담당이 이 낱말로 메모를 꺼낸다)',
    body: '내용 — 사실 · 정한 것 · 바라는 방식, 날짜와 누가 말했는지',
  };
  return (
    <>
      <TitledList heading="메모" items={memos.mine} url={`/api/agents/${agentId}/memos/mine`} placeholder={placeholder} clamp />
      <TitledList heading="팀 공용 메모" items={memos.team} url={`/api/agents/${agentId}/memos/team`} placeholder={placeholder} clamp />
    </>
  );
}

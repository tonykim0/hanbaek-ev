/**
 * POST /api/agents/[id]/reply — 에이전트가 마지막 지시에 답한다 [한백 관리자]
 *
 * 업무 정의 · 열린 할 일 · 지금 콘솔 자료(lib/agents/scope — 저장하지 않고 이때 읽는다) · 지난 대화를 들고 부른다.
 * 대화 중에 에이전트가 적거나 끝낸 할 일은 이 요청을 보낸 관리자의 이름으로 감사기록에 남고, 적은 쪽에는 에이전트
 * 이름이 선다(store/agents). 답은 대화에 남는다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { agentReply, HISTORY_TURNS } from '@/lib/agents/brain';
import { briefOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';

export const maxDuration = 300;

export const POST = adminWrite<{ id: string }, undefined>(
  '에이전트는 한백 관리자만 부를 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const detail = await repo.getAgent(params.id, actor);
    const last = detail.messages[detail.messages.length - 1];
    if (!last || last.role !== 'user') throw new Error('답할 지시가 없습니다 — 먼저 말을 남겨 주세요.');

    const data = await loadScope(actor, detail.agent.kind === 'purchase');
    const sites = new Map<string, string>();
    for (const p of data.projects) {
      sites.set(p.id.toUpperCase(), p.id);
      if (p.mgmtNo) sites.set(p.mgmtNo.toUpperCase(), p.id);
    }
    const agentId = detail.agent.id;
    const turn = await agentReply({
      agent: detail.agent,
      duties: detail.duties,
      tasks: detail.tasks,
      history: detail.messages.slice(-HISTORY_TURNS),
      brief: briefOf(detail.agent, data),
      today: data.today,
      hands: {
        addTask: async (t) => (await repo.addAgentTask({ agentId, ...t, byAgent: true }, actor)).id,
        completeTask: async (id) => (await repo.setAgentTaskDone({ agentId, id, done: true, byAgent: true }, actor)).title,
        siteOf: (ref) => sites.get(ref.trim().toUpperCase()) ?? null,
      },
    });
    const message = await repo.addAgentMessage({ agentId, role: 'agent', body: turn.text, meta: turn.meta }, actor);
    return { message };
  }
);

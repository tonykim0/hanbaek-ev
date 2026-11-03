/**
 * POST /api/agents/[id]/reply — 에이전트가 마지막 지시에 답한다 [한백 관리자]
 *
 * 업무 정의 · 열린 할 일 · 지금 콘솔 자료(lib/agents/scope — 저장하지 않고 이때 읽는다) · 지난 대화(넘긴 파일 포함 —
 * lib/agents/file-text)를 들고 부른다.
 * 대화 중에 에이전트가 적거나 끝낸 할 일은 이 요청을 보낸 관리자의 이름으로 감사기록에 남고, 적은 쪽에는 에이전트
 * 이름이 선다(store/agents). 답은 대화에 남는다.
 * 에이전트가 올린 메일 초안(draft_mail)은 답을 남긴 뒤 그 답에 잇는다 — 대화에서 그 답 밑에 서고, 한백이 승인해야 나간다
 * (store/agent-mail). 응답에 같이 실어 화면이 바로 그린다.
 * 양식 메일이 있는 운영사 담당(나이스 · 현대엔지니어링 — lib/site-mail)은 site_mail 도 쥔다: 서류가 채워져 한백이 다시 요청하면 그
 * 현장의 서류를 붙인 양식 초안을 쓴다(lib/site-mail-run requestSiteMail — 단추와 같은 길). 그 초안도 이 답 밑에 선다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { agentReply, HISTORY_TURNS } from '@/lib/agents/brain';
import { briefOf } from '@/lib/agents/brief';
import { loadScope } from '@/lib/agents/scope';
import { siteMailOfCpo } from '@/lib/site-mail';
import { requestSiteMail } from '@/lib/site-mail-run';

export const maxDuration = 300;

export const POST = adminWrite<{ id: string }, undefined>(
  '에이전트는 한백 관리자만 부를 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const detail = await repo.getAgent(params.id, actor);
    const last = detail.messages[detail.messages.length - 1];
    if (!last || last.role !== 'user') throw new Error('답할 지시가 없습니다 — 먼저 말을 남겨 주세요.');

    /* 정산 담당은 열린구매 글에 쓸 지급처 사업자·계좌까지 읽는다 */
    const data = await loadScope(actor, detail.agent.kind === 'settlement');
    const sites = new Map<string, string>();
    for (const p of data.projects) {
      sites.set(p.id.toUpperCase(), p.id);
      if (p.mgmtNo) sites.set(p.mgmtNo.toUpperCase(), p.id);
    }
    const agentId = detail.agent.id;
    const drafted: string[] = [];
    const siteSpec = detail.agent.kind === 'operator' ? siteMailOfCpo(detail.agent.cpo) : null;
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
        draftMail: async (m) => {
          const made = await repo.addAgentMail({ agentId, ...m }, actor);
          drafted.push(made.id);
          return made.id;
        },
        siteOf: (ref) => sites.get(ref.trim().toUpperCase()) ?? null,
        ...(siteSpec ? {
          siteMail: async (projectId: string) => {
            const { plan, mail } = await requestSiteMail(projectId, actor, siteSpec);
            if (!mail) throw new Error('초안을 쓰지 못했습니다.');
            drafted.push(mail.id);
            return { id: mail.id, subject: mail.subject, plan, to: mail.to };
          },
        } : {}),
      },
    });
    const message = await repo.addAgentMessage({ agentId, role: 'agent', body: turn.text, meta: turn.meta }, actor);
    if (drafted.length === 0) return { message, mails: [] };
    await repo.linkAgentMails({ agentId, ids: drafted, messageId: message.id }, actor);
    const mails = (await repo.getAgent(agentId, actor)).mails.filter((m) => drafted.includes(m.id));
    return { message, mails };
  }
);

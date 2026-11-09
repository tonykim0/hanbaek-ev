/**
 * POST /api/agents/[id]/reply — 에이전트가 마지막 지시에 답한다 [한백 관리자]
 *
 * 업무 정의 · 열린 할 일 · 지금 콘솔 자료(lib/agents/scope — 저장하지 않고 이때 읽는다) · 최근 대화(넘긴 파일 포함 —
 * lib/agents/file-text) · 메모를 들고 부른다.
 * 대화 중에 에이전트가 적거나 끝낸 할 일은 이 요청을 보낸 관리자의 이름으로 감사기록에 남고, 적은 쪽에는 에이전트
 * 이름이 선다(store/agents). 답은 대화에 남는다.
 * 에이전트가 올린 메일 초안(draft_mail)은 답을 남긴 뒤 그 답에 잇는다 — 대화에서 그 답 밑에 서고, 한백이 승인해야 나간다
 * (store/agent-mail). 응답에 같이 실어 화면이 바로 그린다.
 * 양식 메일이 있는 운영사 담당(나이스 · 현대엔지니어링 — lib/site-mail)은 site_mail 도 쥔다: 서류가 채워져 한백이 다시 요청하면 그
 * 현장의 서류를 붙인 양식 초안을 쓴다(lib/site-mail-run requestSiteMail — 단추와 같은 길). 그 초안도 이 답 밑에 선다.
 * 운영사 담당은 pricing_table 로 그 운영사의 지금 단가표를 읽는다(lib/agents/pricing-table — 읽기만, 한백 2026-11-04).
 * 태양광 담당(migrations/0118)은 태양광 자료를 읽는다(상담 접수한 현장 — lib/agents/solar-brief). 양식 메일 · 단가표는 없다.
 * ★담당들은 팀이다★(migrations/0120 · lib/agents/team) — 모두가 그 사업의 팀 목표 · 방향을 읽고, 팀장(전략·기획)은 목표 · 방향을
 * 올린다(save_direction). ★팀원끼리 서로 읽고 남긴다★(한백 2026-11-05): 모두가 다른 팀원들의 한 줄 현황([팀 현황])을 같이 받고, 팀원
 * 하나를 깊이 읽고(team_history), 팀원의 대화에 말을 남긴다(tell_teammate — 받은 담당은 다음에 불릴 때 읽는다).
 * ★장기기억은 메모장, 꺼내 쓰는 것은 그때그때★(한백 2026-11-05 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는 방법」 —
 * store/agent-memory · lib/agents/memory · memos): 부를 때 읽는 것은 최근 대화 20~39개와 메모뿐이고, 대화 원문 · 지난 파일은 담당이
 * 찾을 때(search_history · read_file)만 DB 에서 읽는다.
 * 전기차 담당은 여러 현장의 같은 서류를 한 통에 들어갈 만큼씩 zip 으로 묶고(bundle_site_docs) 묶음마다 메일 초안을 쓴다
 * (draft_mail attach_bundle_ids · lib/agents/bundle-run — 한백 2026-11-05 「프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서
 * 압축해서 이메일로」 · 「B로하자」 — 첨부로만).
 * 전기차 정산 담당은 agit_post 로 결제일의 아지트 열린구매 글 초안을 올린다(lib/agit — 글은 콘솔이 짓는다 · 한백 2026-11-08 「내가
 * 승인하면 정산담당에이전트가 아지트에 글을 올리는 구조」). 그 초안도 이 답 밑에 서고, 한백이 승인해야 올라간다(app/api/agit/posts/[id]).
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { agentReply } from '@/lib/agents/brain';
import { pricingTableText } from '@/lib/agents/pricing-table';
import { loadAgentBrief } from '@/lib/agents/scope';
import { siteMailOfCpo } from '@/lib/site-mail';
import { requestSiteMail } from '@/lib/site-mail-run';
import { agitUrgentFor, loadAgitDraft } from '@/lib/agit/load';
import { payDateName } from '@/lib/agit/post';
import { OPEN_PURCHASE_AGENT } from '@/lib/agents/open-purchase';
import { awaitsReply, queryOf, searchText } from '@/lib/agents/memory';
import { bundleFileOf, bundleSiteDocs } from '@/lib/agents/bundle-run';
import {
  HISTORY_PER_MEMBER, memberOf, TEAM_DAYS, TEAM_PER_MEMBER, teamBriefOf, teamHistoryOf, teammatesOf,
} from '@/lib/agents/team';
import { isLead } from '@/types/agents';
import type { Actor } from '@/lib/data/repository';

/** team_history 가 읽는 날수의 상한 — 저장소(store/agent-team)와 같다 */
const MAX_HISTORY_DAYS = 90;

export const maxDuration = 300;

export const POST = adminWrite<{ id: string }, undefined>(
  '에이전트는 한백 관리자만 부를 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const detail = await repo.getAgent(params.id, actor);
    const agentId = detail.agent.id;
    /*
     * 담당마다 답은 한 번에 하나 — 답이 도는 50초쯤 사이에 다른 탭 · 새로 고친 화면의 「다시 묻기」가 또 부르면 같은 지시에 모델을
     * 두 번 부르고 답이 둘 선다(2026-11-05 루모라: 한 답에 $1.49, 반은 버린 돈). 대화는 표지를 잡은 뒤에 읽는다 — 앞 답이 막 끝난
     * 뒤에 잡으면 그 답이 보여 「답할 지시가 없습니다」로 끝난다.
     */
    const claim = await repo.claimAgentReply(agentId, actor);
    if (!claim) throw new Error('이 담당이 이미 답하는 중입니다 — 답이 오면 대화에 섭니다. 잠시 뒤 새로 고쳐 보세요.');
    try {
      return await answer(repo, detail, actor);
    } finally {
      await repo.releaseAgentReply(agentId, claim, actor);
    }
  }
);

/** 표지를 잡은 뒤의 한 답 — 대화를 읽고, 부르고, 남긴다 */
async function answer(
  repo: ReturnType<typeof getRepository>,
  detail: Awaited<ReturnType<ReturnType<typeof getRepository>['getAgent']>>,
  actor: Actor,
) {
  const agentId = detail.agent.id;
  const recent = await repo.agentRecent(agentId, actor);
  if (!awaitsReply(recent)) throw new Error('답할 지시가 없습니다 — 먼저 말을 남겨 주세요.');

  /*
   * 사업마다의 자료 — 전기차 정산 담당은 열린구매 글에 쓸 지급처 사업자·계좌까지 읽는다. 팀(목표 · 방향)과 다른 팀원들의
   * 최근 기록은 모두가 읽는다
   */
  const { biz } = detail.agent;
  const lead = isLead(detail.agent.kind);
  const [{ today, brief, siteOf }, team, logs, memos] = await Promise.all([
    loadAgentBrief(detail.agent, actor),
    repo.agentTeam(actor, biz),
    repo.agentTeamLog(actor, biz, { days: TEAM_DAYS, perMember: TEAM_PER_MEMBER, exclude: agentId }),
    repo.agentMemos(actor, agentId),
  ]);
  const mates = teammatesOf(detail.agent, team);
  const drafted: string[] = [];
  /* 이 답에서 올린 아지트 글 초안 — 답을 남긴 뒤 그 답 밑으로 잇는다 */
  const agitDrafted: string[] = [];
  const siteSpec = detail.agent.kind === 'operator' ? siteMailOfCpo(detail.agent.cpo) : null;
  /* 운영사 담당은 그 운영사의 단가표를 읽는다(읽기만 — 부를 때만 저장소에서) */
  const operatorCpo = detail.agent.kind === 'operator' ? detail.agent.cpo : null;
  const turn = await agentReply({
    agent: detail.agent,
    duties: detail.duties,
    tasks: detail.tasks,
    recent,
    memos,
    brief,
    today,
    team,
    teamBrief: mates.length ? teamBriefOf(logs) : null,
    hands: {
      addTask: async (t) => (await repo.addAgentTask({ agentId, ...t, byAgent: true }, actor)).id,
      completeTask: async (id) => (await repo.setAgentTaskDone({ agentId, id, done: true, byAgent: true }, actor)).title,
      draftMail: async (m) => {
        const made = await repo.addAgentMail({ agentId, ...m }, actor);
        drafted.push(made.id);
        return made.id;
      },
      siteOf,
      /* 여러 현장의 같은 서류를 zip 하나로 — 전기차 담당만(태양광 현장의 파일은 아직 · lib/agents/bundle-run) */
      ...(biz === 'ev' ? {
        bundleSiteDocs: (q: { sites: string[]; doc: string; maxMb: number | null }) =>
          bundleSiteDocs({ agent: detail.agent, refs: q.sites, doc: q.doc, maxMb: q.maxMb, siteOf, actor }),
        bundleFile: (id: string) => bundleFileOf(agentId, id),
      } : {}),
      ...(siteSpec ? {
        siteMail: async (projectId: string, force: boolean) => {
          const { plan, mail } = await requestSiteMail(projectId, actor, siteSpec, { force });
          if (!mail) throw new Error('초안을 쓰지 못했습니다.');
          drafted.push(mail.id);
          return { id: mail.id, subject: mail.subject, plan, to: mail.to, checks: mail.checks };
        },
      } : {}),
      /* 업무 정의 — 한백이 대화에서 시킬 때 담당이 넣고 고치고 뺀다(감사기록에 「에이전트가 적음」) */
      saveDuty: (d) => repo.saveAgentDuty({ agentId, id: d.id ?? undefined, title: d.title, body: d.body, byAgent: true }, actor),
      deleteDuty: async (id) => (await repo.deleteAgentDuty({ agentId, id, byAgent: true }, actor)).title,
      /* 기억의 손 — 메모장(적은 쪽에 담당 이름) · 대화 원문 찾기 · 지난 파일 */
      saveMemo: (m) => repo.saveAgentMemo({ agentId, ...m, byAgent: true }, actor),
      deleteMemo: async (m) => (await repo.deleteAgentMemo({ agentId, ...m, byAgent: true }, actor)).title,
      searchHistory: async (q) => {
        const query = queryOf(q);
        if (!query) return '찾을 낱말(query)이나 날짜(from · to)를 준다.';
        const { hits, total } = await repo.searchAgentMessages(agentId, actor, query);
        return searchText(hits, total, query);
      },
      readFile: (id) => repo.agentFileOf(agentId, id, actor),
      /* 아지트 열린구매 글 초안 — 전기차 정산 담당만. 글은 콘솔이 거래명세서로 짓는다 */
      ...(agentId === OPEN_PURCHASE_AGENT && biz === 'ev' ? {
        agitDraft: async (q: { payDate: string; again: boolean; urgent?: string | null }) => {
          /* 긴급사유 — 주면 긴급 글(빈 글이면 보통 글로), 안 주면 지금 초안의 모양 그대로(lib/agit/load agitUrgentFor) */
          const draft = await loadAgitDraft(actor, q.payDate, await agitUrgentFor(actor, q.payDate, q.urgent));
          if (draft.blocked) throw new Error(`${payDateName(q.payDate)} 글을 지을 수 없다 — ${draft.blocked}`);
          const { post, plan } = await repo.draftAgitPost({
            payDate: draft.payDate, body: draft.text, total: draft.total, batches: draft.batches, again: q.again, messageId: null,
            urgent: draft.urgent,
          }, actor);
          agitDrafted.push(post.id);
          return { id: post.id, plan, name: payDateName(post.payDate), batches: post.batches, total: post.total, urgent: post.urgent };
        },
      } : {}),
      ...(operatorCpo ? {
        pricingTable: async () => pricingTableText(await repo.listPricingRules(actor), operatorCpo),
      } : {}),
      /* 팀의 손 — 같은 사업의 다른 담당만(자기 자신 · 다른 사업은 memberOf 가 못 찾는다) */
      ...(mates.length ? {
        teamHistory: async (ref: string, days: number, query?: string) => {
          const member = memberOf(mates, ref);
          if (!member) throw new Error(`팀원 「${ref}」를 찾지 못했다 — [팀 현황]의 id 를 쓴다.`);
          /* 낱말을 주면 그 팀원의 대화 전부에서 — 날수 상한이 없다(한백의 말을 팀이 다 나눠 알게) */
          const q = query ? queryOf({ query }) : null;
          if (q) {
            const { hits, total } = await repo.searchAgentMessages(member.id, actor, q);
            return searchText(hits, total, q, member.name);
          }
          const span = Math.min(MAX_HISTORY_DAYS, Math.max(1, Math.round(days)));
          const [log] = await repo.agentTeamLog(actor, biz, { days: span, perMember: HISTORY_PER_MEMBER, memberId: member.id });
          if (!log) throw new Error(`팀원 「${ref}」의 기록을 읽지 못했다.`);
          return teamHistoryOf(log, span);
        },
        tellTeammate: async (ref: string, body: string) => {
          const member = memberOf(mates, ref);
          if (!member) throw new Error(`팀원 「${ref}」를 찾지 못했다 — [팀 현황]의 id 를 쓴다.`);
          return (await repo.tellAgent({ fromId: agentId, toId: member.id, body }, actor)).name;
        },
      } : {}),
      /* 팀장의 손 — 목표 · 방향은 적은 쪽에 팀장 이름이 남는다 */
      ...(lead ? {
        saveDirection: (d: { id: string | null; title: string; body: string }) =>
          repo.saveAgentDirection({ leadId: agentId, ...d, byAgent: true }, actor),
        deleteDirection: async (id: string) =>
          (await repo.deleteAgentDirection({ leadId: agentId, id, byAgent: true }, actor)).title,
      } : {}),
    },
  });
  const message = await repo.addAgentMessage({ agentId, role: 'agent', body: turn.text, meta: turn.meta }, actor);
  if (agitDrafted.length) await repo.linkAgitPosts({ ids: agitDrafted, messageId: message.id }, actor);
  if (drafted.length === 0) return { message, mails: [] };
  await repo.linkAgentMails({ agentId, ids: drafted, messageId: message.id }, actor);
  const mails = (await repo.getAgent(agentId, actor)).mails.filter((m) => drafted.includes(m.id));
  return { message, mails };
}

/**
 * AI에이전트의 팀을 에이전트가 읽을 글로 (순수 — 저장소 · 세션을 안 끌어온다).
 *
 * 한백 2026-11-04 「결국엔 전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는 실무자들이야. 각 실무자들이 알고 있는 히스토리에
 * 대해서 전략 및 기획이 알고있어야하고, 전략및기획에서 세우는 목표나 OKR 방향성 또는 다른 사업구조에 대해서도 밑에 실무자들이
 * 알아야하는 상호보완구조여야해. 이건 전기차, 태양광 둘 다 같아」 — 팀장 = 전략·기획, 실무자 = 나머지(types/agents isLead).
 *
 * 한백 2026-11-05 「각 담당자들끼리 서로 정보 공유 필요해. 즉 모든 에이전트들간 대화필요」 — 그전에는 팀장만 실무자의 기록을 읽었다.
 * 이제 ★같은 사업의 담당 모두가 서로 읽고(팀장도 실무자도) 서로에게 말을 남긴다(tell_teammate — types/agents peer)★. 받은 담당을
 * 저절로 부르지는 않는다 — 다음에 한백이 부를 때 읽는다. 전기차와 태양광 사이에는 오가지 않는다(0119 — 나누는 것이 없다).
 *
 *   teamLineOf       시스템 — 팀에서의 자리(팀장 · 실무자)와 서로 무엇을 읽고 남기는지
 *   directionsBlock  시스템 — 팀 목표 · 방향(아래로). 팀 모두가 부를 때마다 읽는다 — 바뀔 때만 바뀌어 캐시에 남는다
 *   teamBriefOf      마지막 지시 곁 — 다른 팀원마다 한 줄(최근 2주의 대화 수 · 열린 할 일 · 마지막 말). 자세히는 team_history 로 꺼내 본다
 *                    (한백 2026-11-05 「모든 대화를 매번 다 읽는건 너무 비효율적」 — 그전에는 팀원마다 말 여섯 줄씩 늘 붙였다)
 *   teamHistoryOf    team_history 도구 — 팀원 하나의 대화 · 할 일 · 업무 정의를 깊이
 *
 * [팀 현황]은 바뀌는 자료라 시스템이 아니라 마지막 지시 곁에 붙는다(lib/agents/brain 「바뀌는 자료는 마지막 지시 곁」) — 앞의
 * 대화가 캐시에서 싸게 읽히게. 팀이 같이 알아야 할 것은 팀 공용 메모(lib/agents/memos)에 있다.
 */
import type { Agent, AgentDirection, AgentMessage, AgentTask, AgentTeam, TeamMemberLog } from '@/types/agents';
import { isLead } from '@/types/agents';

/** 부를 때마다 읽는 [팀 현황] — 최근 날수 · 팀원 한 사람의 마지막 말 하나 */
export const TEAM_DAYS = 14;
export const TEAM_PER_MEMBER = 1;
/** team_history — 기본 날수 · 팀원 한 사람의 말 상한 */
export const HISTORY_DAYS = 30;
export const HISTORY_PER_MEMBER = 80;
/** 한 말의 글자 상한 — [팀 현황]은 마지막 말 앞부분만, team_history 는 넉넉히 */
const BRIEF_CLIP = 80;
const HISTORY_CLIP = 1500;
/** 한 답에서 팀원에게 남기는 말의 상한 — 잘못 돈 답이 팀원들의 대화를 채우지 않게 */
export const TELLS_PER_TURN = 3;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const names = (list: Agent[]) => list.map((a) => a.name).join(' · ');

/** 말 한 줄의 머리 — 누가 어떤 말을 했나 */
function whoSaid(m: AgentMessage): string {
  switch (m.role) {
    case 'user': return `한백 지시(${m.author})`;
    case 'note': return `기록(${m.author})`;
    case 'auto': return '자동';
    case 'agent': return '답';
    case 'peer': return `팀원 ${m.author}의 말`;
  }
}

/** 말에 딸린 것 — 넘긴 파일 이름 · 답이 한 일(할 일 · 메일 초안) */
function tailOf(m: AgentMessage): string {
  const parts = [
    m.files.length ? `넘긴 파일: ${m.files.map((f) => f.name).join(' · ')}` : '',
    m.meta?.added?.length ? `할 일 적음: ${m.meta.added.join(' · ')}` : '',
    m.meta?.done?.length ? `할 일 끝냄: ${m.meta.done.join(' · ')}` : '',
    m.meta?.mails?.length ? `메일 초안: ${m.meta.mails.join(' · ')}` : '',
    m.meta?.told?.length ? `팀원에게 남김: ${m.meta.told.join(' · ')}` : '',
    m.meta?.memos?.length ? `메모: ${m.meta.memos.join(' · ')}` : '',
  ].filter(Boolean);
  return parts.length ? ` [${parts.join(' / ')}]` : '';
}

/** 같은 팀의 다른 담당 — 팀장 먼저, 그다음 실무자(조직 순서) */
export function teammatesOf(agent: Agent, team: Pick<AgentTeam, 'lead' | 'members'>): Agent[] {
  return [...(team.lead ? [team.lead] : []), ...team.members].filter((a) => a.id !== agent.id);
}

/** 팀이 서로 무엇을 읽고 남기는지 — 팀장 · 실무자 모두 같다 */
const SHARE = '팀원들이 한백과 나눈 지시 · 기록 · 답 · 할 일을 너도 꺼내 보고, 네 것도 팀원 모두가 본다 — 마지막 지시 곁의 [팀 현황]이 '
  + '팀원마다 한 줄 현황이고, 자세히는 team_history 로 읽는다(낱말을 주면 기간과 상관없이 그 팀원의 대화 전부에서 찾는다). '
  + '팀이 같이 알아야 할 사실 · 정한 것은 팀 공용 메모에 적는다(save_memo scope team). '
  + '팀원이 알아야 할 것(그 팀원의 운영사 · 사업자 · 일에 걸린 사실, 한백이 전해 '
  + '달라고 한 것, 그 팀원에게 묻거나 맡길 것)은 tell_teammate 로 그 팀원의 대화에 남긴다 — 그 팀원은 다음에 불릴 때 읽는다. '
  + '팀원에게 물을 것이 팀 공용 메모 · team_history 에 이미 있으면 남기지 않고 읽어서 쓴다.';

/** 시스템 — 팀에서의 자리. 팀장은 목표 · 방향을 세우고, 실무자는 그 방향에 맞춰 일한다. 서로의 기록은 모두가 읽는다 */
export function teamLineOf(agent: Agent, team: Pick<AgentTeam, 'lead' | 'members'>): string {
  const mates = teammatesOf(agent, team);
  if (isLead(agent.kind)) {
    return `팀: 너는 이 팀의 팀장이다. 실무자는 ${names(team.members) || '아직 없다'}다. ${SHARE} `
      + '팀의 목표 · OKR · 방향 · 사업 구조를 세우는 것이 너의 몫이다 — 세운 것은 save_direction 으로 [팀 목표 · 방향]에 올리고, '
      + '실무자 모두가 부를 때마다 그것을 읽고 거기에 맞춰 일한다. 올리는 것은 한백이 정하라고 했거나 한백과 합의한 것만이고, '
      + '고칠 때는 같은 줄(id)을 고친다. 세우기 전에 실무자 기록과 콘솔 자료에 비춰 본다.';
  }
  const peers = mates.filter((m) => !isLead(m.kind));
  return `팀: 너는 이 팀의 실무자다. 팀장은 ${team.lead?.name ?? '전략·기획 담당'}이다 — 팀의 목표 · OKR · 방향 · 사업 구조를 세운다`
    + '([팀 목표 · 방향]). 일의 우선순위와 판단을 거기에 맞추고, 받은 지시가 그것과 어긋나면 그 점을 짚는다. '
    + `${SHARE} 막힌 것 · 바뀐 것 · 팀이 알아야 할 것은 답에 분명히 적는다.`
    + (peers.length ? ` 같은 팀의 실무자: ${names(peers)}.` : '');
}

/** 시스템 — 팀 목표 · 방향. 팀장에게는 고칠 줄의 id 를 같이 준다(save_direction · delete_direction) */
export function directionsBlock(directions: AgentDirection[], forLead: boolean): string {
  const head = '[팀 목표 · 방향 — 팀장(전략·기획 담당)이 세운 것. 팀 모두가 이것에 맞춰 일한다]';
  if (directions.length === 0) return `${head}\n${forLead ? '아직 없다 — 한백과 정하면 save_direction 으로 올린다.' : '아직 없다.'}`;
  return [
    head,
    ...directions.map((d, i) => `${i + 1}. ${d.title}${forLead ? ` (id=${d.id})` : ''}${d.body.trim() ? `\n${d.body.trim()}` : ''}`),
  ].join('\n');
}

/** 마지막 지시 곁 — 다른 팀원마다 한 줄: 자리 · 이름 · id · 최근 대화 수 · 열린 할 일 · 마지막 말(앞부분) */
export function teamBriefOf(logs: TeamMemberLog[], days: number = TEAM_DAYS): string {
  const head = `[팀 현황 — 같은 사업의 다른 담당 ${logs.length}명 · 최근 ${days}일. 자세히는 team_history, 같이 알 것은 팀 공용 메모]`;
  if (logs.length === 0) return `${head}\n- 없음`;
  return [head, ...logs.map((l) => {
    const open = l.tasks.filter((t) => !t.doneAt).length;
    const last = l.messages.at(-1);
    const said = last
      ? ` · 마지막 ${last.at.slice(5)} ${whoSaid(last)}: ${cut(oneLine(last.body), BRIEF_CLIP) || '(파일만)'}`
      : '';
    return `- ${isLead(l.agent.kind) ? '팀장' : '실무자'} ${l.agent.name} (id=${l.agent.id}) — 대화 ${l.total}건 · 열린 할 일 ${open}${said}`;
  })].join('\n');
}

/** team_history 도구의 답 — 팀원 하나를 깊이: 업무 정의 전문 · 할 일 · 대화(오래된 것부터) */
export function teamHistoryOf(log: TeamMemberLog, days: number): string {
  const open = log.tasks.filter((t) => !t.doneAt);
  const done = log.tasks.filter((t) => t.doneAt);
  const none = ['- 없음'];
  return [
    `[${log.agent.name} · id=${log.agent.id} — 최근 ${days}일]`,
    '업무 정의:',
    ...(log.duties.length ? log.duties.map((d, i) => `${i + 1}. ${d.title}${d.body.trim() ? `\n${d.body.trim()}` : ''}`) : none),
    '열린 할 일:',
    ...(open.length
      ? open.map((t) => `- ${t.title}${t.due ? ` | 기한 ${t.due}` : ''}${t.projectName ? ` | 현장 ${t.projectName}` : ''}`
        + `${t.note ? ` | ${t.note}` : ''} | 적은 쪽 ${t.author}`)
      : none),
    `${days}일 안에 끝낸 할 일:`,
    ...(done.length ? done.map((t) => `- ${t.doneAt!.slice(5)} 끝냄 · ${t.title}`) : none),
    `대화 — 오래된 것부터 · ${log.total}건${log.total > log.messages.length ? ` 중 최근 ${log.messages.length}건` : ''}:`,
    ...(log.messages.length
      ? log.messages.map((m) => `- ${m.at.slice(5)} ${whoSaid(m)}: ${cut(m.body.trim(), HISTORY_CLIP) || '(파일만)'}${tailOf(m)}`)
      : none),
  ].join('\n');
}

/** team_history · tell_teammate 가 받은 팀원 — id 를 먼저, 그다음 이름 · 맡은 곳(운영사 · 사업자)으로 찾는다 */
export function memberOf(members: Agent[], ref: string): Agent | null {
  const r = ref.trim();
  if (!r) return null;
  return members.find((m) => m.id === r)
    ?? members.find((m) => m.name === r || m.cpo === r || m.company === r)
    ?? null;
}

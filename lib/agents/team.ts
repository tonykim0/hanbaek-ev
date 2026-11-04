/**
 * AI에이전트의 팀을 에이전트가 읽을 글로 (순수 — 저장소 · 세션을 안 끌어온다).
 *
 * 한백 2026-11-04 「결국엔 전략 및 기획담당이 팀장이고 그 운영사/사업자 담당자는 실무자들이야. 각 실무자들이 알고 있는 히스토리에
 * 대해서 전략 및 기획이 알고있어야하고, 전략및기획에서 세우는 목표나 OKR 방향성 또는 다른 사업구조에 대해서도 밑에 실무자들이
 * 알아야하는 상호보완구조여야해. 이건 전기차, 태양광 둘 다 같아」 — 팀장 = 전략·기획, 실무자 = 나머지(types/agents isLead).
 *
 *   teamLineOf       시스템 — 팀에서의 자리(팀장 · 실무자)와 서로 무엇을 읽는지
 *   directionsBlock  시스템 — 팀 목표 · 방향(아래로). 실무자 모두가 부를 때마다 읽는다 — 바뀔 때만 바뀌어 캐시에 남는다
 *   teamDigestOf     팀장의 마지막 지시 곁 — 실무자마다 최근 2주의 업무 정의 · 할 일 · 말 몇 줄(위로)
 *   teamHistoryOf    팀장의 team_history 도구 — 실무자 하나의 대화 · 할 일 · 업무 정의를 깊이
 *
 * [팀 소식]은 바뀌는 자료라 시스템이 아니라 마지막 지시 곁에 붙는다(lib/agents/brain 「바뀌는 자료는 마지막 지시 곁」) — 앞의
 * 대화가 캐시에서 싸게 읽히게. 실무자 여섯이 다 상한까지 차도 몇 천 토큰이다(Opus 5.5 입력 100만에 $4 — 한 번에 몇 센트).
 */
import type { Agent, AgentDirection, AgentMessage, AgentTask, AgentTeam, TeamMemberLog } from '@/types/agents';
import { isLead } from '@/types/agents';

/** 팀장이 부를 때마다 읽는 [팀 소식] — 최근 날수 · 실무자 한 사람의 말 수 */
export const TEAM_DAYS = 14;
export const TEAM_PER_MEMBER = 6;
/** team_history — 기본 날수 · 실무자 한 사람의 말 상한 */
export const HISTORY_DAYS = 30;
export const HISTORY_PER_MEMBER = 80;
/** 한 말의 글자 상한 — [팀 소식]은 한 줄로(답은 길어 더 짧게), team_history 는 넉넉히 */
const DIGEST_CLIP = { said: 200, agent: 160 } as const;
const HISTORY_CLIP = 1500;
/** [팀 소식]에 적는 할 일 수 — 넘으면 「…」 */
const DIGEST_TASKS = { open: 8, done: 5 } as const;

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
  }
}

/** 말에 딸린 것 — 넘긴 파일 이름 · 답이 한 일(할 일 · 메일 초안) */
function tailOf(m: AgentMessage): string {
  const parts = [
    m.files.length ? `넘긴 파일: ${m.files.map((f) => f.name).join(' · ')}` : '',
    m.meta?.added?.length ? `할 일 적음: ${m.meta.added.join(' · ')}` : '',
    m.meta?.done?.length ? `할 일 끝냄: ${m.meta.done.join(' · ')}` : '',
    m.meta?.mails?.length ? `메일 초안: ${m.meta.mails.join(' · ')}` : '',
  ].filter(Boolean);
  return parts.length ? ` [${parts.join(' / ')}]` : '';
}

const taskLine = (t: AgentTask) => `${t.title}${t.due ? `(기한 ${t.due.slice(5)})` : ''}`;
const more = (n: number, shown: number) => (n > shown ? ' …' : '');

/** 시스템 — 팀에서의 자리. 팀장은 실무자의 기록을 읽고 목표 · 방향을 세우고, 실무자는 그 방향에 맞춰 일하며 팀장이 읽을 것을 남긴다 */
export function teamLineOf(agent: Agent, team: Pick<AgentTeam, 'lead' | 'members'>): string {
  if (isLead(agent.kind)) {
    return `팀: 너는 이 팀의 팀장이다. 실무자는 ${names(team.members) || '아직 없다'}다. `
      + '실무자들이 한백과 나눈 지시 · 기록 · 답 · 할 일을 너도 안다 — 마지막 지시 곁의 [팀 소식]이 최근 것이고, 더 깊이는 '
      + 'team_history 로 읽는다. 팀의 목표 · OKR · 방향 · 사업 구조를 세우는 것이 너의 몫이다 — 세운 것은 save_direction 으로 '
      + '[팀 목표 · 방향]에 올리고, 실무자 모두가 부를 때마다 그것을 읽고 거기에 맞춰 일한다. 올리는 것은 한백이 정하라고 했거나 '
      + '한백과 합의한 것만이고, 고칠 때는 같은 줄(id)을 고친다. 세우기 전에 실무자 기록과 콘솔 자료에 비춰 본다.';
  }
  const peers = team.members.filter((m) => m.id !== agent.id);
  return `팀: 너는 이 팀의 실무자다. 팀장은 ${team.lead?.name ?? '전략·기획 담당'}이다 — 팀의 목표 · OKR · 방향 · 사업 구조를 세운다`
    + '([팀 목표 · 방향]). 일의 우선순위와 판단을 거기에 맞추고, 받은 지시가 그것과 어긋나면 그 점을 짚는다. 네가 한백과 나눈 '
    + '대화와 할 일은 팀장도 읽는다 — 막힌 것 · 바뀐 것 · 팀장이 알아야 할 것은 답에 분명히 적는다.'
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

/** 팀장의 마지막 지시 곁 — 실무자마다 업무 정의 이름 · 할 일 · 최근 말 몇 줄 */
export function teamDigestOf(logs: TeamMemberLog[], days: number = TEAM_DAYS): string {
  const head = `[팀 소식 — 실무자 ${logs.length}명이 최근 ${days}일 동안 한백과 나눈 것. 더 깊이는 team_history]`;
  if (logs.length === 0) return `${head}\n- 실무자 없음`;
  const blocks = logs.map((l) => {
    const open = l.tasks.filter((t) => !t.doneAt);
    const done = l.tasks.filter((t) => t.doneAt);
    return [
      `[실무자 · ${l.agent.name} · id=${l.agent.id}]`,
      `업무 정의 ${l.duties.length}${l.duties.length ? `: ${l.duties.map((d) => d.title).join(' · ')}` : ''}`,
      `열린 할 일 ${open.length}${open.length
        ? `: ${open.slice(0, DIGEST_TASKS.open).map(taskLine).join(' · ')}${more(open.length, DIGEST_TASKS.open)}` : ''}`,
      ...(done.length
        ? [`끝낸 할 일 ${done.length}: ${done.slice(0, DIGEST_TASKS.done).map((t) => t.title).join(' · ')}${more(done.length, DIGEST_TASKS.done)}`]
        : []),
      `대화 ${l.total}건${l.total > l.messages.length ? ` — 최근 ${l.messages.length}건` : ''}`,
      ...l.messages.map((m) => {
        const said = cut(oneLine(m.body), m.role === 'agent' ? DIGEST_CLIP.agent : DIGEST_CLIP.said);
        return `- ${m.at.slice(5)} ${whoSaid(m)}: ${said || '(파일만)'}${tailOf(m)}`;
      }),
    ].join('\n');
  });
  return [head, ...blocks].join('\n\n');
}

/** team_history 도구의 답 — 실무자 하나를 깊이: 업무 정의 전문 · 할 일 · 대화(오래된 것부터) */
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

/** team_history 가 받은 실무자 — id 를 먼저, 그다음 이름 · 맡은 곳(운영사 · 사업자)으로 찾는다 */
export function memberOf(members: Agent[], ref: string): Agent | null {
  const r = ref.trim();
  if (!r) return null;
  return members.find((m) => m.id === r)
    ?? members.find((m) => m.name === r || m.cpo === r || m.company === r)
    ?? null;
}

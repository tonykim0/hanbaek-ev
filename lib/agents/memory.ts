/**
 * 담당의 기억 (순수 — 저장소 · 세션을 안 끌어온다). ★한백이 한 말은 전부 기억한다★ (한백 2026-11-05 「각 담당자들이랑 일할 때
 * 담당자가 내가 말한 모든 정보를 기억해주길 바래」).
 *
 * 그전에는 최근 말 40개만 읽어, 그보다 앞의 지시 · 기록 · 넘긴 파일을 담당이 몰랐다(저장은 다 돼 있었다). 대화를 통째로 싣지는
 * 않는다 — 답은 길고(아지트 글 초안) 넘긴 PDF 는 쪽마다 토큰이라, 쓸수록 한 번 부르는 값이 끝없이 커진다. 그래서 셋으로 나눈다:
 *
 *   최근       splitThread 의 recent — 말 그대로(넘긴 파일도 그 말에 붙여 연다). 40~59개
 *   지난 대화  recallBlock — 그 앞의 것. ★한백이 한 말(지시 · 기록)은 전문★이고, 담당의 답 · 자동 · 팀원의 말은 앞부분만, 넘긴
 *              파일은 이름과 id(read_file 로 다시 연다 · draft_mail 에 붙인다)
 *   찾기       searchThread(search_history) — 지난 대화의 무엇이든 전문으로 · fileIn(read_file) — 지난 파일 하나
 *
 * ★최근의 시작은 20개씩 움직인다★ — 말 하나마다 한 칸씩 밀면 대화의 앞부분이 매번 바뀌어 캐시가 늘 깨진다. 20개마다 한 번 바뀌면
 * 그 사이에 부르는 동안 앞의 대화가 캐시에서 싸게 읽힌다(Opus 5.5 캐시 읽기는 입력 값의 5%).
 */
import type { AgentFile, AgentMessage } from '@/types/agents';

/** 최근 — 말 그대로 싣는 수의 바닥과 시작이 움직이는 칸 */
export const RECENT_MIN = 40;
export const RECENT_STEP = 20;
/**
 * 지난 대화 덩이의 글자 상한 — 넘으면 오래된 것부터 줄인다(먼저 답 · 자동 · 팀원의 줄, 그래도 넘으면 한백의 말). 줄인 것도
 * search_history 로 찾는다. 한백의 말만으로 이만큼 차려면 지시 · 기록 수백 개다.
 */
export const RECALL_CHARS = 80_000;
/** 지난 대화에서 한 줄로 줄이는 말의 글자 수 — 한백의 말(지시 · 기록)은 자르지 않는다 */
const RECALL_CLIP = { agent: 120, auto: 160, peer: 300 } as const;
/** search_history — 한 번에 돌려주는 말 수 · 한 말의 글자 · 전체 글자 */
export const SEARCH_LIMIT = 20;
const SEARCH_CLIP = 3000;
const SEARCH_CHARS = 40_000;

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 한백이 한 말인가 — 지시 · 기록. 지난 대화에서 전문으로 남는 것 */
const fromHanbaek = (m: AgentMessage) => m.role === 'user' || m.role === 'note';

/** 말의 머리 — 담당이 읽는다. owner 가 없으면 자기 대화(「네 답」), 있으면 팀원의 대화(「○○ 담당의 답」) */
function whoSaid(m: AgentMessage, owner?: string): string {
  switch (m.role) {
    case 'user': return `한백 지시(${m.author})`;
    case 'note': return `기록(${m.author})`;
    case 'agent': return owner ? `${owner}의 답` : '네 답';
    case 'auto': return '자동';
    case 'peer': return `팀원 ${m.author}의 말`;
  }
}

/** 말에 딸린 것 — 넘긴 파일(id 까지 — read_file · draft_mail), 답이 한 일 */
function tailOf(m: AgentMessage): string {
  const parts = [
    m.files.length ? `넘긴 파일: ${m.files.map((f) => `${f.name}(id=${f.id})`).join(' · ')}` : '',
    m.meta?.added?.length ? `할 일 적음: ${m.meta.added.join(' · ')}` : '',
    m.meta?.done?.length ? `할 일 끝냄: ${m.meta.done.join(' · ')}` : '',
    m.meta?.mails?.length ? `메일 초안: ${m.meta.mails.join(' · ')}` : '',
    m.meta?.told?.length ? `팀원에게 남김: ${m.meta.told.join(' · ')}` : '',
  ].filter(Boolean);
  return parts.length ? ` [${parts.join(' / ')}]` : '';
}

/**
 * 대화를 지난 것과 최근 것으로 가른다. 최근은 사람 쪽 말로 시작해야 한다(모델 대화의 맨 앞) — 앞머리에 걸린 답은 지난 대화로
 * 넘긴다(그전에는 그 답이 어디에도 실리지 않고 빠졌다).
 */
export function splitThread(thread: AgentMessage[]): { older: AgentMessage[]; recent: AgentMessage[] } {
  let start = thread.length <= RECENT_MIN ? 0 : Math.floor((thread.length - RECENT_MIN) / RECENT_STEP) * RECENT_STEP;
  while (start < thread.length && thread[start].role === 'agent') start++;
  return { older: thread.slice(0, start), recent: thread.slice(start) };
}

/** 지난 대화의 한 줄 — 한백의 말은 전문(여러 줄이면 그대로), 나머지는 한 줄로 줄인다 */
function recallLine(m: AgentMessage): string {
  const body = fromHanbaek(m)
    ? m.body.trim()
    : cut(oneLine(m.body), RECALL_CLIP[m.role as keyof typeof RECALL_CLIP] ?? RECALL_CLIP.auto);
  return `- ${m.at} ${whoSaid(m)}: ${body || '(파일만)'}${tailOf(m)}`;
}

/**
 * 지난 대화 덩이 — 최근 대화 앞에 붙는다(대화의 맨 앞이라 다음 칸이 움직일 때까지 캐시에 남는다). 없으면 null.
 * 상한을 넘으면 오래된 것부터 줄인다: 먼저 답 · 자동 · 팀원의 줄, 그래도 넘으면 한백의 말.
 */
export function recallBlock(older: AgentMessage[], budget: number = RECALL_CHARS): string | null {
  if (older.length === 0) return null;
  const lines = older.map((m) => ({ text: recallLine(m), hanbaek: fromHanbaek(m), keep: true }));
  let size = lines.reduce((n, l) => n + l.text.length + 1, 0);
  for (const pass of [false, true]) {
    for (const l of lines) {
      if (size <= budget) break;
      if (l.hanbaek !== pass || !l.keep) continue;
      l.keep = false;
      size -= l.text.length + 1;
    }
  }
  const kept = lines.filter((l) => l.keep);
  const dropped = lines.length - kept.length;
  return [
    `[지난 대화 — 너와 한백이 나눈 말 중 아래 대화보다 앞의 ${older.length}개. 한백이 한 말(지시 · 기록)은 전문이고 네 답 · 자동 · `
      + '팀원의 말은 앞부분만이다. 전문이 필요하면 search_history 로 찾고, 넘긴 파일은 read_file 로 다시 연다]',
    ...(dropped ? [`(가장 오래된 ${dropped}개는 길어서 줄였다 — search_history 로 찾는다)`] : []),
    ...kept.map((l) => l.text),
  ].join('\n');
}

/** search_history 가 받는 것 — 낱말(띄어 쓴 것 모두가 들어 있어야 한다) · 날짜(YYYY-MM-DD, 그날 포함) */
export interface ThreadQuery {
  query?: string;
  from?: string;
  to?: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 지난 대화 찾기 — 맞는 말을 최근 것부터 전문으로(한 말 3,000자까지). 낱말은 글 · 쓴 사람 · 넘긴 파일 이름에서 찾는다.
 * owner 를 주면 팀원의 대화를 찾는 것이다(team_history 의 query — 날수 상한 없이 그 팀원의 대화 전부에서)
 */
export function searchThread(thread: AgentMessage[], q: ThreadQuery, owner?: string): string {
  const terms = (q.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const from = q.from && DAY_RE.test(q.from) ? q.from : null;
  const to = q.to && DAY_RE.test(q.to) ? q.to : null;
  if (terms.length === 0 && !from && !to) return '찾을 낱말(query)이나 날짜(from · to)를 준다.';
  const hits = thread.filter((m) => {
    const day = m.at.slice(0, 10);
    if ((from && day < from) || (to && day > to)) return false;
    const hay = `${m.body}\n${m.author}\n${m.files.map((f) => f.name).join('\n')}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  }).reverse();
  const what = [terms.length ? `「${terms.join(' ')}」` : '', from || to ? `${from ?? '처음'}~${to ?? '오늘'}` : '']
    .filter(Boolean).join(' · ');
  const where = owner ? `${owner}의 대화 찾기` : '지난 대화 찾기';
  if (hits.length === 0) return `[${where} — ${what}] 맞는 말이 없다.`;
  const out: string[] = [];
  let size = 0;
  for (const m of hits.slice(0, SEARCH_LIMIT)) {
    const line = `- ${m.at} ${whoSaid(m, owner)}: ${cut(m.body.trim(), SEARCH_CLIP) || '(파일만)'}${tailOf(m)}`;
    if (out.length > 0 && size + line.length > SEARCH_CHARS) break;
    out.push(line);
    size += line.length;
  }
  return [
    `[${where} — ${what} · ${hits.length}건${hits.length > out.length ? ` 중 최근 ${out.length}건` : ''}, 최근 것부터]`,
    ...out,
  ].join('\n');
}

/** read_file 이 받은 id 의 파일 — 이 담당에게 넘긴 것만 */
export function fileIn(thread: AgentMessage[], id: string): AgentFile | null {
  for (const m of thread) {
    const f = m.files.find((x) => x.id === id);
    if (f) return f;
  }
  return null;
}

/**
 * 답할 지시가 있는가 — 마지막 지시 뒤에 답이 없으면. 그 뒤에 팀원의 말 · 자동의 말이 끼어도(다른 담당이 대화 중에 남겼거나
 * 계약서가 접수됐거나) 지시는 그대로 기다린다.
 */
export function awaitsReply(thread: AgentMessage[]): boolean {
  for (let i = thread.length - 1; i >= 0; i--) {
    const r = thread[i].role;
    if (r === 'peer' || r === 'auto') continue;
    return r === 'user';
  }
  return false;
}

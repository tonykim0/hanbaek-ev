/**
 * 담당의 대화 기억 (순수 — 저장소 · 세션을 안 끌어온다). 한백 2026-11-05 「각 담당자들이랑 일할 때 담당자가 내가 말한 모든 정보를
 * 기억해주길 바래」 → 「모든 대화를 매번 다 읽는건 너무 비효율적이지않나」 → 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수
 * 있는 방법은 없나?」.
 *
 * 그래서 셋으로 나눈다 — 부를 때마다 읽는 양이 대화가 쌓여도 그대로다:
 *
 *   최근 대화   recentStart — 말 그대로 20~39개(store/agent-memory agentRecent)
 *   메모장     lib/agents/memos — 제목만 늘 읽고, 지시에 제목의 낱말이 나오면 펼쳐 붙이고, 나머지는 담당이 연다
 *   원문       search_history — 대화 원문 전부에서 낱말 · 날짜로 찾는다(store/agent-memory searchAgentMessages) · read_file — 지난 파일
 *
 * ★최근의 시작은 20개씩 움직인다★ — 말 하나마다 한 칸씩 밀면 대화의 앞부분이 매번 바뀌어 캐시가 늘 깨진다. 20개마다 한 번 바뀌면
 * 그 사이에 부르는 동안 앞의 대화가 캐시에서 싸게 읽힌다(Opus 5.5 캐시 읽기는 입력 값의 5%).
 * (하루는 지난 대화를 통째로 실었다 — 한백의 말은 전문, 나머지는 앞부분. 쓸수록 커져 상한에서 7.4만 토큰이었다.)
 */
import type { AgentMessage } from '@/types/agents';

/** 최근 — 말 그대로 싣는 수의 바닥과 시작이 움직이는 칸 */
export const RECENT_MIN = 20;
export const RECENT_STEP = 20;
/** search_history — 한 번에 돌려주는 말 수 · 한 말의 글자 · 전체 글자 */
export const SEARCH_LIMIT = 20;
const SEARCH_CLIP = 3000;
const SEARCH_CHARS = 40_000;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 최근 대화의 시작 자리 — 말이 total 개일 때. 20개마다 한 번 움직인다(그 사이 캐시가 산다) */
export function recentStart(total: number): number {
  return total <= RECENT_MIN ? 0 : Math.floor((total - RECENT_MIN) / RECENT_STEP) * RECENT_STEP;
}

/** 말의 머리 — 담당이 읽는다. owner 가 없으면 자기 대화(「네 답」), 있으면 팀원의 대화(「○○ 담당의 답」) */
export function whoSaid(m: AgentMessage, owner?: string): string {
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

/** search_history 가 받는 것 — 낱말(띄어 쓴 것 모두가 들어 있어야 한다) · 날짜(YYYY-MM-DD, 그날 포함) */
export interface ThreadQuery {
  query?: string;
  from?: string;
  to?: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 찾기의 낱말 · 날짜를 다듬는다 — 낱말은 띄어 쓴 대로, 날짜는 모양이 맞는 것만. 셋 다 비면 null(찾을 것이 없다) */
export function queryOf(q: ThreadQuery): { terms: string[]; from: string | null; to: string | null } | null {
  const terms = (q.query ?? '').split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
  const from = q.from && DAY_RE.test(q.from) ? q.from : null;
  const to = q.to && DAY_RE.test(q.to) ? q.to : null;
  return terms.length || from || to ? { terms, from, to } : null;
}

/**
 * 찾은 말을 담당이 읽을 글로 — 최근 것부터 전문(한 말 3,000자까지). hits 는 최근 것부터, total 은 맞은 말 전체 수.
 * owner 를 주면 팀원의 대화를 찾은 것이다(team_history 의 query)
 */
export function searchText(
  hits: AgentMessage[], total: number, q: { terms: string[]; from: string | null; to: string | null }, owner?: string
): string {
  const what = [q.terms.length ? `「${q.terms.join(' ')}」` : '', q.from || q.to ? `${q.from ?? '처음'}~${q.to ?? '오늘'}` : '']
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
    `[${where} — ${what} · ${total}건${total > out.length ? ` 중 최근 ${out.length}건` : ''}, 최근 것부터]`,
    ...out,
  ].join('\n');
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

/** 이번에 답할 말들 — 마지막 답 뒤의 것(지시 · 기록 · 팀원 · 자동). 메모를 펼칠 낱말을 여기서 찾는다(lib/agents/memos) */
export function pendingOf(thread: AgentMessage[]): AgentMessage[] {
  let i = thread.length;
  while (i > 0 && thread[i - 1].role !== 'agent') i--;
  return thread.slice(i);
}

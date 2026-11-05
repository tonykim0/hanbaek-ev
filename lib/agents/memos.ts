/**
 * 담당의 메모장 (순수 — 저장소 · 세션을 안 끌어온다). 한백 2026-11-05 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는
 * 방법은 없나?」 → 「진행해」 (migrations/0122).
 *
 * 담당이 한백에게서 들은 사실 · 정한 것 · 바라는 방식을 주제마다 한 장씩 적는다 — 자기 메모(mine)와 그 사업의 팀 공용 메모(team).
 * ★부를 때마다 읽는 것은 제목뿐이다★(memoBlock). 내용은:
 *   - 이번에 답할 말(지시 · 기록 · 팀원의 말)에 제목의 낱말이 나오면 콘솔이 펼쳐 붙인다(memosToOpen) — 왕복이 늘지 않는다
 *   - 그 밖에 필요하면 담당이 open_memo 로 연다 — 그때만 한 번 더 왕복
 * Anthropic 의 메모리 도구(memory_20250818)를 그대로 쓰지 않은 까닭: 켜면 API 가 「무엇보다 먼저 메모장을 열어 보라」는 지시를 넣어
 * 부를 때마다 한 번 더 왕복하고, 진행 상황을 계속 적게 하는 긴 코딩 작업용 규약이라서다. 같은 생각(주제마다 메모 · 필요할 때 연다)을
 * 우리 쪽에서 여는 때를 정해 쓴다.
 *
 * 메모와 목록은 마지막 지시 곁에 붙는다 — 메모가 바뀌어도 앞의 대화 캐시가 깨지지 않게(lib/agents/brain 「바뀌는 자료는 마지막 지시 곁」).
 */
import type { AgentMemo, AgentMemos, AgentMessage, MemoScope } from '@/types/agents';

/** 메모의 글 상한 — 제목은 펼칠 낱말이라 짧게, 내용은 업무 정의와 같다 */
export const MEMO_MAX = { title: 80, body: 4000 } as const;
/** 담당 하나(또는 팀 하나)의 메모 수 상한 — 넘으면 합치라고 거절한다(제목 목록이 끝없이 길어지지 않게) */
export const MEMOS_PER_OWNER = 150;
/** 지시 곁에 펼쳐 붙이는 메모 — 장 수 · 글자 상한 */
export const OPEN_LIMIT = { memos: 5, chars: 8000 } as const;

export const MEMO_SCOPE_LABEL: Record<MemoScope, string> = { mine: '내 메모', team: '팀 공용' };

/** 제목에서 낱말을 가르는 것 — 「 · 」 · 띄어쓰기 · 문장부호 */
const TITLE_SPLIT = /[\s·,/|—–:;()「」『』[\]<>"'“”‘’]+/;
/** 말에서 낱말을 가르는 것 — 「-」는 두지 않는다(HB-2026-033 같은 현장 번호를 한 낱말로) */
const TEXT_SPLIT = /[\s·,/|—–:;()「」『』[\]<>"'“”‘’.!?~…]+/;
/** 제목에 흔해 펼칠 까닭이 못 되는 낱말 */
const STOP = new Set(['담당', '현장', '메모', '정리', '관련', '기록', '방식', '한백', '내용', '사항', '확인', '요청', '공용', '팀']);
/** 말 끝의 조사 — 「나이스는」에서 「나이스」를 꺼낸다(긴 것부터) */
const JOSA = ['에서는', '에게는', '한테는', '으로는', '에서', '에게', '한테', '까지', '부터', '으로', '이랑', '하고', '처럼', '보다',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과', '께', '랑', '만'];

const norm = (s: string) => s.normalize('NFC').toLowerCase();

/** 제목의 낱말 — 두 글자 이상, 흔한 말 빼고 */
export function titleTerms(title: string): string[] {
  return [...new Set(norm(title).split(TITLE_SPLIT).filter((t) => t.length >= 2 && !STOP.has(t)))];
}

/** 말의 낱말 — 두 글자 이상, 끝의 조사를 뗀 것도 같이 */
function textWords(text: string): string[] {
  const out = new Set<string>();
  for (const w of norm(text).split(TEXT_SPLIT)) {
    if (w.length < 2) continue;
    out.add(w);
    const josa = JOSA.find((j) => w.length - j.length >= 2 && w.endsWith(j));
    if (josa) out.add(w.slice(0, -josa.length));
  }
  return [...out];
}

/**
 * 이번에 답할 말에 제목의 낱말이 나온 메모 — 낱말이 말에 그대로 있거나, 말의 낱말이 제목 낱말의 앞머리면(「나이스」 → 「나이스인프라」).
 * 많이 맞은 것 · 최근에 고친 것부터, 장 수 · 글자 상한까지.
 */
export function memosToOpen(memos: AgentMemo[], pending: AgentMessage[], limit = OPEN_LIMIT): AgentMemo[] {
  const text = norm(pending.map((m) => `${m.body}\n${m.files.map((f) => f.name).join('\n')}`).join('\n'));
  if (!text.trim()) return [];
  const words = textWords(text);
  const scored = memos.map((memo, i) => {
    const hits = titleTerms(memo.title).filter((t) => text.includes(t) || words.some((w) => t.startsWith(w)));
    return { memo, n: hits.length, i };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i);
  const out: AgentMemo[] = [];
  let size = 0;
  for (const { memo } of scored) {
    if (out.length >= limit.memos) break;
    if (out.length > 0 && size + memo.body.length > limit.chars) continue;
    out.push(memo);
    size += memo.body.length;
  }
  return out;
}

/** 메모 한 장 — 담당이 읽는 꼴(id 는 고치고 지울 때 쓴다) */
export function memoText(m: AgentMemo): string {
  const when = m.updatedAt ?? m.createdAt;
  return `(id=${m.id} · ${MEMO_SCOPE_LABEL[m.scope]} · ${when.slice(0, 10)} · ${m.author})\n${m.title}\n${m.body.trim() || '(내용 없음)'}`;
}

/**
 * 지시 곁의 메모 덩이 — 제목 목록(늘) + 펼친 메모(낱말이 맞은 것). 목록은 내 메모 먼저, 그다음 팀 공용(각각 최근에 고친 것부터).
 */
export function memoBlock(memos: AgentMemos, opened: AgentMemo[]): string {
  const all = [...memos.mine, ...memos.team];
  const head = '[메모 — 내 메모 · 팀 공용 메모의 제목. 내용은 펼친 것만 아래에 있고, 나머지는 open_memo 로 연다]';
  const list = all.length
    ? all.map((m) => `- id=${m.id} · ${MEMO_SCOPE_LABEL[m.scope]} · ${m.title} (${m.body.length}자)`)
    : ['- 아직 없다'];
  const shown = opened.length
    ? ['', '[펼친 메모 — 이번 말에 제목의 낱말이 나와 펼쳤다]', ...opened.map(memoText).flatMap((t) => [t, ''])].slice(0, -1)
    : [];
  return [head, ...list, ...shown].join('\n');
}

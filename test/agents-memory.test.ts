/**
 * 담당의 기억 — lib/agents/memory · memos (한백 2026-11-05 「담당자가 내가 말한 모든 정보를 기억해주길 바래」 → 「모든 대화를 매번 다
 * 읽는건 너무 비효율적」 → 「비용을 줄이면서 장기기억으로 두면서 그때그때 꺼내 쓸 수 있는 방법」 → 「진행해」).
 *
 * 부를 때 읽는 것은 최근 대화 20~39개와 메모 제목뿐이다. 이번 말에 제목의 낱말이 나온 메모만 펼쳐 붙이고, 나머지는 담당이 연다.
 * 대화 원문은 찾을 때만(search_history).
 */
import { describe, expect, it } from 'vitest';
import {
  awaitsReply, pendingOf, queryOf, RECENT_MIN, RECENT_STEP, recentStart, searchText,
} from '@/lib/agents/memory';
import { memoBlock, memosToOpen, memoText, OPEN_LIMIT, titleTerms } from '@/lib/agents/memos';
import { pushSaid, toMessages, withContext } from '@/lib/agents/brain';
import type { AgentFile, AgentMemo, AgentMessage, AgentMessageRole } from '@/types/agents';

let seq = 0;
function said(role: AgentMessageRole, body: string, over: Partial<AgentMessage> = {}): AgentMessage {
  seq += 1;
  return { id: `m${seq}`, role, author: role === 'agent' ? '나이스인프라 담당' : '김정우', body, at: '2026-11-05 10:00', meta: null, files: [], ...over };
}
const file = (id: string, name: string): AgentFile => ({ id, name, url: `https://blob/${name}`, size: 10, contentType: null });
function memo(id: string, title: string, body = '내용', over: Partial<AgentMemo> = {}): AgentMemo {
  return { id, scope: 'mine', title, body, author: '나이스인프라 담당', byAgent: true, updatedAt: null, createdAt: '2026-11-05 10:00', ...over };
}

describe('최근 대화의 시작 (recentStart)', () => {
  it(`${RECENT_MIN}개까지는 처음부터, 그 뒤로는 ${RECENT_STEP}개씩 움직인다 — 그 사이에는 앞부분이 그대로라 캐시에 남는다`, () => {
    for (const [n, start] of [[0, 0], [20, 0], [21, 0], [39, 0], [40, 20], [59, 20], [60, 40], [1000, 980]] as const) {
      expect(recentStart(n), `${n}`).toBe(start);
      expect(n - recentStart(n)).toBeLessThan(RECENT_MIN + RECENT_STEP);
    }
  });
});

describe('답할 지시 (awaitsReply) · 이번에 답할 말 (pendingOf)', () => {
  it('마지막 지시 뒤에 답이 없으면 답한다 — 그 뒤에 팀원 · 자동의 말이 끼어도', () => {
    expect(awaitsReply([said('user', '지시')])).toBe(true);
    expect(awaitsReply([said('user', '지시'), said('peer', '팀원'), said('auto', '자동')])).toBe(true);
    expect(awaitsReply([said('user', '지시'), said('agent', '답')])).toBe(false);
    expect(awaitsReply([said('user', '지시'), said('note', '기록')])).toBe(false);
    expect(awaitsReply([said('peer', '팀원만')])).toBe(false);
    expect(awaitsReply([])).toBe(false);
  });

  it('이번에 답할 말은 마지막 답 뒤의 것 전부', () => {
    const t = [said('user', '옛 지시'), said('agent', '답'), said('note', '기록'), said('user', '새 지시')];
    expect(pendingOf(t).map((m) => m.body)).toEqual(['기록', '새 지시']);
    expect(pendingOf([said('agent', '답')])).toEqual([]);
  });
});

describe('대화 원문 찾기의 글 (queryOf · searchText)', () => {
  it('낱말 · 날짜를 다듬고, 셋 다 없으면 null', () => {
    expect(queryOf({ query: ' 세아청솔  초안 ', from: '2026-10-01', to: 'bad' })).toEqual({ terms: ['세아청솔', '초안'], from: '2026-10-01', to: null });
    expect(queryOf({ query: '  ' })).toBeNull();
  });

  it('최근 것부터 전문으로 — 맞은 전체 수와, 넘긴 파일은 id 까지', () => {
    const q = queryOf({ query: '세아청솔' })!;
    const text = searchText([
      said('agent', '세아청솔 초안 올렸습니다', { at: '2026-09-01 09:01' }),
      said('user', '세아청솔 계약서 초안 보내줘', { at: '2026-09-01 09:00', files: [file('f1', '세아청솔.docx')] }),
    ], 25, q);
    expect(text).toContain('[지난 대화 찾기 — 「세아청솔」 · 25건 중 최근 2건, 최근 것부터]');
    expect(text.indexOf('네 답: 세아청솔 초안')).toBeLessThan(text.indexOf('한백 지시(김정우): 세아청솔 계약서'));
    expect(text).toContain('[넘긴 파일: 세아청솔.docx(id=f1)]');
  });

  it('팀원의 대화면(team_history 의 query) 그 팀원의 답으로 적는다 — 「네 답」이 아니다', () => {
    const text = searchText([said('agent', '정리했습니다')], 1, queryOf({ query: '정리' })!, '나이스인프라 담당');
    expect(text).toContain('[나이스인프라 담당의 대화 찾기 — 「정리」 · 1건, 최근 것부터]');
    expect(text).toContain('나이스인프라 담당의 답: 정리했습니다');
    expect(text).not.toContain('네 답');
  });

  it('맞은 것이 없으면 그렇다고 — 날짜만이면 기간을 적는다', () => {
    expect(searchText([], 0, queryOf({ from: '2026-10-01' })!)).toBe('[지난 대화 찾기 — 2026-10-01~오늘] 맞는 말이 없다.');
  });
});

describe('메모를 펼칠 낱말 (titleTerms · memosToOpen)', () => {
  it('제목의 낱말 — 「 · 」로 가르고, 두 글자 이상, 흔한 말은 뺀다', () => {
    expect(titleTerms('나이스인프라 · 김민수 대리 · 세금계산서 · 담당')).toEqual(['나이스인프라', '김민수', '대리', '세금계산서']);
    expect(titleTerms('HB-2026-033 청주 리버파크자이')).toEqual(['hb-2026-033', '청주', '리버파크자이']);
  });

  const MEMOS = [
    memo('a', '나이스인프라 · 김민수 대리 · 세금계산서'),
    memo('b', 'HB-2026-033 청주 리버파크자이 · 서류'),
    memo('c', '플러그링크 · 단가 협의', '내용', { scope: 'team' }),
  ];

  it('이번 말에 낱말이 그대로 있거나 말의 낱말이 제목 낱말의 앞머리면 펼친다 — 조사를 떼고 본다', () => {
    const ids = (text: string) => memosToOpen(MEMOS, [said('user', text)]).map((m) => m.id);
    expect(ids('나이스는 세금계산서 어떻게 받기로 했지?')).toEqual(['a']);
    expect(ids('hb-2026-033 어떻게 됐어')).toEqual(['b']);
    expect(ids('플러그링크랑 단가 다시 보자')).toEqual(['c']);
    expect(ids('오늘 할 일 정리해줘')).toEqual([]);
  });

  it('넘긴 파일 이름에서도 찾고, 많이 맞은 것부터', () => {
    const got = memosToOpen(MEMOS, [said('note', '받은 서류', { files: [file('f', '리버파크자이_청주_계약서.pdf')] })]);
    expect(got.map((m) => m.id)).toEqual(['b']);
  });

  it('장 수 · 글자 상한까지만 — 넘치는 장은 건너뛴다(담당이 open_memo 로 연다)', () => {
    const many = Array.from({ length: 8 }, (_, i) => memo(`m${i}`, `나이스인프라 · 주제${i}`, '가'.repeat(100)));
    expect(memosToOpen(many, [said('user', '나이스인프라')])).toHaveLength(OPEN_LIMIT.memos);
    const big = [memo('x', '나이스인프라 · 큰 것', '가'.repeat(7000)), memo('y', '나이스인프라 · 또 큰 것', '나'.repeat(7000))];
    expect(memosToOpen(big, [said('user', '나이스인프라')]).map((m) => m.id)).toEqual(['x']);
  });
});

describe('지시 곁의 메모 덩이 (memoBlock · memoText)', () => {
  it('제목은 늘(내 메모 먼저, 그다음 팀 공용) · 펼친 것만 내용까지', () => {
    const mine = [memo('a', '나이스인프라 · 김민수 대리', '김민수 대리 kim@x · 회신은 화요일 오전 (11-05 김정우)')];
    const team = [memo('t', '세금계산서 · 발행 방식', '나이스는 말일 묶음', { scope: 'team', author: '김정우', byAgent: false })];
    const text = memoBlock({ mine, team }, [mine[0]]);
    expect(text).toContain('- id=a · 내 메모 · 나이스인프라 · 김민수 대리 (');
    expect(text).toContain('- id=t · 팀 공용 · 세금계산서 · 발행 방식 (');
    expect(text).toContain('[펼친 메모 — 이번 말에 제목의 낱말이 나와 펼쳤다]');
    expect(text).toContain('김민수 대리 kim@x · 회신은 화요일 오전');
    expect(text).not.toContain('나이스는 말일 묶음');
  });

  it('메모가 없으면 없다고 — 펼친 것이 없으면 그 덩이도 없다', () => {
    const text = memoBlock({ mine: [], team: [] }, []);
    expect(text).toContain('- 아직 없다');
    expect(text).not.toContain('[펼친 메모');
  });

  it('메모 한 장 — id · 자리 · 날짜 · 적은 쪽 · 제목 · 내용', () => {
    expect(memoText(memo('a', '제목', '', { updatedAt: '2026-11-06 09:00' })))
      .toBe('(id=a · 내 메모 · 2026-11-06 · 나이스인프라 담당)\n제목\n(내용 없음)');
  });
});

describe('모델에 싣는 모양 (toMessages · withContext)', () => {
  it('지금 자료는 마지막 말 뒤에, 캐시 표지는 그 바로 앞에 — 팀원의 말은 표지를 단 사람 쪽 말', () => {
    const recent = [said('user', '지시', { at: '2026-11-05 10:00' }), said('peer', '정산에서 알림', { author: '정산 담당' })];
    const msgs = withContext(toMessages(recent), '[지금 …]');
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toBe('[김정우 · 2026-11-05 10:00] 지시');
    const last = msgs[1].content as Array<{ type: string; text: string; cache_control?: unknown }>;
    expect(msgs[1].role).toBe('user');
    expect(last[0]).toEqual({ type: 'text', text: '[팀원 — 정산 담당 · 2026-11-05 10:00] 정산에서 알림', cache_control: { type: 'ephemeral' } });
    expect(last[1]).toEqual({ type: 'text', text: '[지금 …]' });
  });

  it('파일이 붙은 마지막 말은 마지막 파일 덩이에 표지 — 앞의 말은 건드리지 않는다', () => {
    const msgs = withContext(toMessages([said('user', '봐줘', { files: [file('f1', 'a.pdf')] })]), '[지금 …]');
    const blocks = msgs[0].content as Array<{ type: string; cache_control?: unknown }>;
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text', 'document', 'text']);
    expect(blocks[2].cache_control).toEqual({ type: 'ephemeral' });
    expect(blocks.filter((b) => b.cache_control)).toHaveLength(1);
  });
});

describe('바퀴마다의 글 모으기 (pushSaid)', () => {
  it('같은 글은 한 번 — 도구를 부르며 써 둔 답을 도구 결과 뒤에 다시 써도(2026-11-05 실측)', () => {
    const texts: string[] = [];
    pushSaid(texts, '말일에 발행합니다.\n\n할 일에 적었습니다.');
    pushSaid(texts, '말일에 발행합니다.\n할 일에 적었습니다.');
    expect(texts).toEqual(['말일에 발행합니다.\n\n할 일에 적었습니다.']);
  });

  it('앞 글을 품은 새 글은 갈아 끼우고, 다른 글은 잇는다 · 빈 글은 버린다', () => {
    const texts: string[] = [];
    pushSaid(texts, '확인했습니다.');
    pushSaid(texts, '확인했습니다. 할 일을 적었습니다.');
    pushSaid(texts, '  ');
    pushSaid(texts, '정산 담당에게도 남겼습니다.');
    expect(texts).toEqual(['확인했습니다. 할 일을 적었습니다.', '정산 담당에게도 남겼습니다.']);
  });
});

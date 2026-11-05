/**
 * 담당의 기억 — lib/agents/memory (한백 2026-11-05 「각 담당자들이랑 일할 때 담당자가 내가 말한 모든 정보를 기억해주길 바래」).
 *
 * 그전에는 최근 말 40개만 읽었다. 이제 최근 40~59개는 말 그대로, 그 앞은 [지난 대화]로 싣는데 ★한백이 한 말(지시 · 기록)은 전문★이다.
 * 담당의 답 · 자동 · 팀원의 말은 앞부분만이고 전문은 search_history 로, 지난 파일은 read_file 로 다시 연다.
 */
import { describe, expect, it } from 'vitest';
import {
  awaitsReply, fileIn, RECENT_MIN, RECENT_STEP, recallBlock, searchThread, splitThread,
} from '@/lib/agents/memory';
import { toMessages, withContext, withRecall } from '@/lib/agents/brain';
import type { AgentFile, AgentMessage, AgentMessageRole } from '@/types/agents';

let seq = 0;
function said(role: AgentMessageRole, body: string, over: Partial<AgentMessage> = {}): AgentMessage {
  seq += 1;
  return { id: `m${seq}`, role, author: role === 'agent' ? '나이스인프라 담당' : '김정우', body, at: '2026-11-05 10:00', meta: null, files: [], ...over };
}
const file = (id: string, name: string): AgentFile => ({ id, name, url: `https://blob/${name}`, size: 10, contentType: null });

/** 지시 · 답이 번갈아 n개 — 짝수 자리가 지시 */
const turns = (n: number) => Array.from({ length: n }, (_, i) => said(i % 2 === 0 ? 'user' : 'agent', `말 ${i}`));

describe('지난 것과 최근 것 (splitThread)', () => {
  it(`${RECENT_MIN}개까지는 모두 최근이다`, () => {
    const t = turns(RECENT_MIN);
    expect(splitThread(t)).toEqual({ older: [], recent: t });
  });

  it(`최근의 시작은 ${RECENT_STEP}개씩 움직인다 — 그 사이에는 앞부분이 그대로라 캐시에 남는다`, () => {
    for (const [n, start] of [[41, 0], [59, 0], [60, 20], [79, 20], [80, 40], [300, 260]] as const) {
      const { older, recent } = splitThread(turns(n));
      expect(older.length, `${n}`).toBe(start);
      expect(recent.length, `${n}`).toBe(n - start);
      expect(recent.length).toBeGreaterThanOrEqual(RECENT_MIN);
    }
  });

  it('최근은 사람 쪽 말로 시작한다 — 앞머리의 답은 지난 대화로 넘어간다(빠지지 않는다)', () => {
    const t = [said('agent', '먼저 한 답'), said('user', '지시')];
    expect(splitThread(t).older.map((m) => m.body)).toEqual(['먼저 한 답']);
    const long = [said('user', '0'), ...turns(60).slice(1)];
    long[20] = said('agent', '스무 번째가 답');
    long[21] = said('user', '스물한 번째가 지시');
    const { older, recent } = splitThread(long);
    expect(older.length).toBe(21);
    expect(recent[0].role).not.toBe('agent');
  });
});

describe('지난 대화 덩이 (recallBlock)', () => {
  it('없으면 null', () => {
    expect(recallBlock([])).toBeNull();
  });

  it('한백이 한 말(지시 · 기록)은 전문, 답 · 자동 · 팀원의 말은 앞부분만 — 넘긴 파일은 id 까지', () => {
    const long = '가'.repeat(2000);
    const text = recallBlock([
      said('user', `${long}\n둘째 줄`, { at: '2026-09-01 09:00', files: [file('f1', '정책.pdf')] }),
      said('note', `나이스 김대리 통화 ${long}`),
      said('agent', long, { meta: { added: ['단가 회신 확인'] } }),
      said('auto', long),
      said('peer', long, { author: '정산 담당' }),
    ])!;
    expect(text).toContain('[지난 대화 — 너와 한백이 나눈 말 중 아래 대화보다 앞의 5개.');
    expect(text).toContain(`- 2026-09-01 09:00 한백 지시(김정우): ${long}\n둘째 줄 [넘긴 파일: 정책.pdf(id=f1)]`);
    expect(text).toContain(`기록(김정우): 나이스 김대리 통화 ${long}`);
    expect(text).toContain(`네 답: ${'가'.repeat(120)}… [할 일 적음: 단가 회신 확인]`);
    expect(text).toContain(`자동: ${'가'.repeat(160)}…`);
    expect(text).toContain(`팀원 정산 담당의 말: ${'가'.repeat(300)}…`);
  });

  it('상한을 넘으면 오래된 답부터 줄이고, 그래도 넘으면 오래된 한백의 말 — 줄인 수를 적는다', () => {
    const old = [
      said('user', `첫 지시 ${'가'.repeat(100)}`),
      said('agent', '나'.repeat(100)),
      said('user', `둘째 지시 ${'다'.repeat(100)}`),
      said('agent', '라'.repeat(100)),
    ];
    const both = recallBlock(old, 300)!;
    expect(both).toContain('첫 지시');
    expect(both).toContain('둘째 지시');
    expect(both).not.toContain('나나나');
    expect(both).toContain('(가장 오래된 2개는 길어서 줄였다 — search_history 로 찾는다)');

    const tight = recallBlock(old, 150)!;
    expect(tight).not.toContain('첫 지시');
    expect(tight).toContain('둘째 지시');
    expect(tight).toContain('(가장 오래된 3개는');
  });
});

describe('지난 대화 찾기 (searchThread)', () => {
  const thread = [
    said('user', '세아청솔 계약서 초안 보내줘', { at: '2026-09-01 09:00' }),
    said('agent', '세아청솔 초안 올렸습니다', { at: '2026-09-01 09:01' }),
    said('note', '나이스 김대리: 11월부터 단가 인하', { at: '2026-10-02 14:00', files: [file('f9', '나이스_정책.pdf')] }),
    said('user', '반달마을 건 확인', { at: '2026-11-01 08:00' }),
  ];

  it('띄어 쓴 낱말이 모두 든 말만 — 최근 것부터, 전문으로', () => {
    const text = searchThread(thread, { query: '세아청솔 초안' });
    expect(text).toContain('「세아청솔 초안」 · 2건, 최근 것부터');
    expect(text.indexOf('네 답: 세아청솔 초안 올렸습니다')).toBeLessThan(text.indexOf('한백 지시(김정우): 세아청솔 계약서'));
  });

  it('넘긴 파일 이름 · 쓴 사람에서도 찾고, 대소문자를 가리지 않는다', () => {
    expect(searchThread(thread, { query: '정책.PDF' })).toContain('나이스 김대리: 11월부터 단가 인하 [넘긴 파일: 나이스_정책.pdf(id=f9)]');
  });

  it('팀원의 대화를 찾으면(team_history query) 그 팀원의 답으로 적는다 — 「네 답」이 아니다', () => {
    const text = searchThread(thread, { query: '세아청솔' }, '나이스인프라 담당');
    expect(text).toContain('[나이스인프라 담당의 대화 찾기 — 「세아청솔」 · 2건');
    expect(text).toContain('나이스인프라 담당의 답: 세아청솔 초안 올렸습니다');
    expect(text).not.toContain('네 답');
  });

  it('날짜로만도 찾는다 — 그날 포함', () => {
    const text = searchThread(thread, { from: '2026-10-01', to: '2026-11-01' });
    expect(text).toContain('2026-10-01~2026-11-01 · 2건');
    expect(text).not.toContain('세아청솔');
  });

  it('맞는 말이 없거나 묻는 것이 없으면 그렇다고', () => {
    expect(searchThread(thread, { query: '없는말' })).toContain('맞는 말이 없다');
    expect(searchThread(thread, { query: ' ', from: 'bad' })).toBe('찾을 낱말(query)이나 날짜(from · to)를 준다.');
  });
});

describe('지난 파일 (fileIn) · 답할 지시 (awaitsReply)', () => {
  it('이 대화창에 넘긴 파일만 id 로 찾는다', () => {
    const t = [said('user', 'x', { files: [file('f1', 'a.pdf')] }), said('note', 'y', { files: [file('f2', 'b.xlsx')] })];
    expect(fileIn(t, 'f2')?.name).toBe('b.xlsx');
    expect(fileIn(t, 'nope')).toBeNull();
  });

  it('마지막 지시 뒤에 답이 없으면 답한다 — 그 뒤에 팀원 · 자동의 말이 끼어도', () => {
    expect(awaitsReply([said('user', '지시')])).toBe(true);
    expect(awaitsReply([said('user', '지시'), said('peer', '팀원'), said('auto', '자동')])).toBe(true);
    expect(awaitsReply([said('user', '지시'), said('agent', '답')])).toBe(false);
    expect(awaitsReply([said('user', '지시'), said('note', '기록')])).toBe(false);
    expect(awaitsReply([said('peer', '팀원만')])).toBe(false);
    expect(awaitsReply([])).toBe(false);
  });
});

describe('모델에 싣는 모양 (toMessages · withRecall · withContext)', () => {
  it('지난 대화는 대화 맨 앞에, 지금 자료는 마지막 지시에 — 팀원의 말은 표지를 단 사람 쪽 말', () => {
    const recent = [said('user', '지시', { at: '2026-11-05 10:00' }), said('peer', '정산에서 알림', { author: '정산 담당' })];
    const msgs = withContext(withRecall(toMessages(recent), '[지난 대화 — …]'), '[지금 …]');
    expect(msgs).toHaveLength(2);
    const first = msgs[0].content as Array<{ type: string; text: string }>;
    expect(first[0].text).toBe('[지난 대화 — …]');
    expect(first[1].text).toBe('[김정우 · 2026-11-05 10:00] 지시');
    const last = msgs[1].content as Array<{ type: string; text: string }>;
    expect(msgs[1].role).toBe('user');
    expect(last[0].text).toBe('[지금 …]');
    expect(last[1].text).toBe('[팀원 — 정산 담당 · 2026-11-05 10:00] 정산에서 알림');
  });

  it('지난 대화가 없으면 그대로', () => {
    const m = toMessages([said('user', '지시')]);
    expect(withRecall(m, null)).toBe(m);
  });
});

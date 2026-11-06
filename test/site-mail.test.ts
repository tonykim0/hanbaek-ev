/**
 * 현장 양식 메일의 판정과 말 (lib/site-mail) — 한백 지시 2026-11-03·04.
 * 같은 일을 두 번 하지 않는 판정(planSiteDraft)과, 담당이 대화에 남기는 말 · 알림의 글을 본다.
 */
import { describe, expect, it } from 'vitest';
import {
  blockedOf, checkLines, emptyFieldsOf, HEC_APPROVAL_MAIL, intakeSay, invalidAlarm, invalidError, invalidNoteOf, josa, missingAlarm,
  missingError, planSiteDraft, sameLetter, siteMailOfCpo, siteMailOfKind, taskTitleOf,
} from '@/lib/site-mail';
import { NICE_DRAFT_MAIL } from '@/lib/nice-submit';

const NICE = siteMailOfCpo('나이스인프라')!;
const HEC = siteMailOfCpo('현대엔지니어링')!;
const letter = (urls: string[], body = '안녕하세요\n본문') => ({ subject: '계약서 초안 송부 — 현장', body, docFiles: urls.map((url) => ({ url })) });

describe('양식', () => {
  it('운영사 둘 — 나이스는 계약서 초안, 현대엔지니어링은 설치승인서. 나머지는 없다', () => {
    expect(NICE).toMatchObject({ kind: NICE_DRAFT_MAIL, agentId: 'op-nice', slot: 'contractDraft' });
    expect(HEC).toMatchObject({ kind: HEC_APPROVAL_MAIL, agentId: 'op-hec', slot: 'approval' });
    expect(siteMailOfCpo('SK일렉링크')).toBeNull();
    expect(siteMailOfCpo(null)).toBeNull();
    expect(siteMailOfKind(HEC_APPROVAL_MAIL)).toBe(HEC);
    expect(taskTitleOf(HEC)).toBe('설치승인서 메일 보내기');
  });

  it('현대엔지니어링은 한백 양식 — 「[한백] 설치승인서 1개 국소 (현장명 N기)」 · 인사 · 맺음(2026-11-05)', () => {
    const site = { name: '코리아골프클럽', addr: '경기도 1', parkTotal: null, bizType: null, installLoc: null };
    const { subject, body } = HEC.letter(site, 4);
    expect(subject).toBe('[한백] 설치승인서 1개 국소 (코리아골프클럽 4기)');
    expect(body).toBe('안녕하세요, 매니저님.\n\n한백 김정우입니다.\n\n설치승인서 송부드립니다.\n\n감사합니다.\n김정우 드림');
    /* 대수를 모르면 현장명만 */
    expect(HEC.letter(site, 0).subject).toBe('[한백] 설치승인서 1개 국소 (코리아골프클럽)');
  });

  it('조사는 받침을 본다', () => {
    expect(josa('계약서 초안', '이', '가')).toBe('계약서 초안이');
    expect(josa('설치승인서', '이', '가')).toBe('설치승인서가');
    expect(missingError(HEC)).toBe('설치승인서가 없습니다 — 먼저 올려 주세요.');
    expect(missingError(NICE)).toBe('계약서 초안이 없습니다 — 먼저 올려 주세요.');
  });
});

describe('planSiteDraft — 같은 일을 두 번 하지 않는다', () => {
  const none = { open: null, sent: [] };
  it('서류가 없으면 missing', () => {
    expect(planSiteDraft(null, none, false)).toBe('missing');
    expect(planSiteDraft(null, { open: letter(['a']), sent: [] }, true)).toBe('missing');
  });
  it('보내지 않은 초안이 같으면 keep, 다르면 replace — 본문 앞뒤 빈칸 · CRLF 는 같은 것으로', () => {
    expect(planSiteDraft(letter(['a']), { open: letter(['a'], '안녕하세요\r\n본문\n'), sent: [] }, false)).toBe('keep');
    expect(planSiteDraft(letter(['b']), { open: letter(['a']), sent: [] }, false)).toBe('replace');
    expect(planSiteDraft(letter(['a'], '다른 본문'), { open: letter(['a']), sent: [] }, true)).toBe('replace');
  });
  it('같은 서류로 이미 보냈으면 저절로 돌 때는 sent — 한백이 요청하면 다시 쓴다', () => {
    expect(planSiteDraft(letter(['a']), { open: null, sent: [['a']] }, false)).toBe('sent');
    expect(planSiteDraft(letter(['a']), { open: null, sent: [['a']] }, true)).toBe('create');
    expect(planSiteDraft(letter(['b']), { open: null, sent: [['a']] }, false)).toBe('create');
  });
  it('붙일 파일은 순서까지 견준다', () => {
    expect(sameLetter(letter(['a', 'b']), letter(['b', 'a']))).toBe(false);
  });
});

describe('말과 알림', () => {
  it('비어 나가는 줄 — 나이스 제출 정보에서 값이 없는 것만', () => {
    const p = { name: '현장', addr: '주소', parkTotal: 510, bizType: '환경부' as const, installLoc: null, consultDup: null };
    expect(emptyFieldsOf(NICE, p, 12)).toEqual(['5번 설치위치', '7번 기설치 현황']);
    expect(emptyFieldsOf(HEC, p, 12)).toEqual([]);
  });

  it('새로 썼을 때 — 받는 사람이 비면 넣을 자리를, 비어 나가는 줄을 짚는다', () => {
    expect(intakeSay(NICE, 'HB 현장', { plan: 'create', to: [], taskAdded: true, empty: ['7번 기설치 현황'] })).toBe([
      'HB 현장 — 계약서가 접수됐습니다.',
      '계약서 초안 메일을 썼습니다(계약서 초안 첨부) — 할 일에도 올렸습니다.',
      '받는 사람이 미지정입니다 — 「고치기」로 받는 사람을 넣고 승인해 주세요.',
      '비어 있는 줄: 7번 기설치 현황 — 「고치기」로 채워 주세요.',
    ].join('\n'));
    expect(intakeSay(HEC, 'HB 현장', { plan: 'replace', to: ['a@b.kr'], taskAdded: false, empty: [] })).toBe([
      'HB 현장 — 계약서가 다시 접수됐습니다.',
      '서류가 바뀌어 설치승인서 메일을 새로 썼습니다(앞 초안은 버렸습니다).',
      '받는 사람 a@b.kr — 확인하고 「승인하고 보내기」를 눌러 주세요.',
    ].join('\n'));
  });

  it('보내지 않은 같은 초안이 있었으면 — 그것을 할 일에 올렸다고만', () => {
    expect(intakeSay(NICE, 'HB 현장', { plan: 'keep', to: [], taskAdded: true, empty: [] }).split('\n')[1])
      .toBe('보내지 않은 계약서 초안 메일이 이미 있습니다 — 할 일에 올렸습니다.');
  });

  it('서류가 없을 때 — 못 보낸다 · 할 일로 남김 · 채워지면 다시 요청', () => {
    expect(intakeSay(HEC, 'HB 현장', { plan: 'missing', to: [], taskAdded: true, empty: [] })).toBe([
      'HB 현장 — 계약서가 접수됐습니다.',
      '설치승인서가 없어 설치승인서 메일을 보내지 못합니다. 할 일로 남겨 두었습니다 — 설치승인서가 채워지면 이 대화에서 다시 요청해 주세요.',
    ].join('\n'));
    expect(missingAlarm(HEC, '현대엔지니어링 담당')).toEqual({
      title: '설치승인서 없음 — 메일 못 보냄',
      body: '설치승인서가 없어 설치승인서 메일을 보내지 못했습니다 — 채워지면 현대엔지니어링 담당에게 다시 요청해 주세요.',
    });
  });
});

describe('붙일 서류가 맞지 않을 때 (DocCheck — lib/hec-approval · 2026-11-06)', () => {
  const none = { open: null, sent: [] };
  const checked = (level: 'block' | 'warn', why: string) => ({
    subject: '[한백] 설치승인서 1개 국소 (현장)', body: '본문', docFiles: [{ url: 'a', name: '승인서.pptx', checks: [{ level, why }] }],
  });

  it('block 이면 invalid — 보내지 않은 초안이 있어도 · 한백이 그래도 쓰라면(force) 쓴다', () => {
    expect(planSiteDraft(checked('block', '빈 양식입니다'), none, false)).toBe('invalid');
    expect(planSiteDraft(checked('block', '빈 양식입니다'), { open: letter(['a']), sent: [] }, true)).toBe('invalid');
    expect(planSiteDraft(checked('block', '빈 양식입니다'), none, true, true)).toBe('create');
    expect(planSiteDraft(checked('warn', '기수가 다릅니다'), none, false)).toBe('create');
  });

  it('같은 서류로 이미 보냈으면 서류를 보기 전에 sent — 보낸 뒤 콘솔 값이 바뀌어도 「못 보냄」이 울리지 않게', () => {
    expect(planSiteDraft(checked('block', '다른 현장'), { open: null, sent: [['a']] }, false)).toBe('sent');
  });

  it('까닭은 파일 이름을 붙여 한 줄씩', () => {
    const l = checked('block', '빈 양식입니다');
    expect(blockedOf(l)).toEqual(['「승인서.pptx」 빈 양식입니다']);
    expect(blockedOf(checked('warn', 'x'))).toEqual([]);
    expect(checkLines(checked('warn', '기수가 다릅니다').docFiles)).toEqual(['「승인서.pptx」 기수가 다릅니다']);
    expect(invalidError(HEC, blockedOf(l))).toBe('설치승인서를 붙일 수 없습니다 — 「승인서.pptx」 빈 양식입니다. 고쳐 올려 주세요.');
    expect(invalidNoteOf(HEC)).toBe('설치승인서 확인 필요 — 고쳐지면 다시 요청');
  });

  it('접수 때 맞지 않으면 — 까닭 · 할 일로 남김 · 그대로 보낼 길을 말한다 / 확인 필요는 초안 말 끝에', () => {
    expect(intakeSay(HEC, 'HB 현장', { plan: 'invalid', to: [], taskAdded: true, empty: [], checks: ['「승인서.pptx」 빈 양식입니다'] })).toBe([
      'HB 현장 — 계약서가 접수됐습니다.',
      '설치승인서가 맞지 않아 설치승인서 메일을 보내지 못합니다 — 「승인서.pptx」 빈 양식입니다.',
      '할 일로 남겨 두었습니다 — 고쳐 올리면 이 대화에서 다시 요청해 주세요. 그대로 보내야 하면 그렇게 말씀해 주세요.',
    ].join('\n'));
    expect(intakeSay(HEC, 'HB 현장', { plan: 'create', to: ['a@b.kr'], taskAdded: false, empty: [], checks: ['「승인서.pptx」 기수가 다릅니다'] })
      .split('\n').at(-1)).toBe('확인 필요: 「승인서.pptx」 기수가 다릅니다 — 열어 보고 승인해 주세요.');
    expect(invalidAlarm(HEC, '현대엔지니어링 담당', ['「승인서.pptx」 빈 양식입니다'])).toEqual({
      title: '설치승인서 확인 필요 — 메일 못 보냄',
      body: '「승인서.pptx」 빈 양식입니다 — 고쳐 올린 뒤 현대엔지니어링 담당에게 다시 요청해 주세요.',
    });
  });
});

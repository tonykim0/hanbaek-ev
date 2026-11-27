/**
 * 메일을 보낸 뒤 담당의 대화에 남는 말(lib/agents/mail-say) — 한백 2026-11-27 「메일이 정상적으로 발신되었다면 에이전트 통해 알려줘」.
 * 저장소가 이 말을 대화에 싣는지는 test/db/agents-mail.test.ts 가 본다.
 */
import { describe, expect, it } from 'vitest';
import { mailSentSay, scheduledMailFailedSay } from '@/lib/agents/mail-say';

const base = {
  subject: '[한백] 설치승인서 1개 국소 (시험아파트 5기)',
  to: ['ops@example.com'],
  cc: ['a@example.com', 'b@example.com'],
  files: ['HB-2026-001 시험아파트 - 설치승인서.pptx'],
  from: 'sender@example.com',
  by: '한백관리자',
  scheduled: false,
};

describe('보냈습니다 (mailSentSay)', () => {
  it('제목 · 받는 사람 · 참조 · 첨부 · 보낸 주소 · 승인한 사람 — 메일 서버가 받았다는 뜻과 반송이 오는 곳까지', () => {
    expect(mailSentSay(base)).toBe([
      '메일을 보냈습니다 — [한백] 설치승인서 1개 국소 (시험아파트 5기)',
      '받는 사람 ops@example.com · 참조 a@example.com, b@example.com',
      '첨부 1개 — HB-2026-001 시험아파트 - 설치승인서.pptx',
      '보낸 주소 sender@example.com (승인 한백관리자) — 메일 서버가 받았습니다. 받는 쪽에서 반송되면 이 메일함으로 옵니다.',
    ].join('\n'));
  });

  it('예약이면 「예약한 메일」 · 예약한 사람', () => {
    const say = mailSentSay({ ...base, scheduled: true });
    expect(say.split('\n')[0]).toBe('예약한 메일을 보냈습니다 — [한백] 설치승인서 1개 국소 (시험아파트 5기)');
    expect(say).toContain('(예약 한백관리자)');
  });

  it('참조 · 첨부가 없으면 그 자리를 적지 않는다', () => {
    const say = mailSentSay({ ...base, cc: [], files: [] });
    expect(say.split('\n')).toHaveLength(3);
    expect(say).toContain('받는 사람 ops@example.com\n');
    expect(say).not.toContain('참조');
    expect(say).not.toContain('첨부');
  });

  it('첨부 이름은 셋까지 — 넘으면 「외 N개」', () => {
    const say = mailSentSay({ ...base, files: ['1.zip', '2.zip', '3.zip', '4.zip', '5.zip'] });
    expect(say).toContain('첨부 5개 — 1.zip, 2.zip, 3.zip 외 2개');
  });
});

describe('예약한 메일을 보내지 못했습니다 (scheduledMailFailedSay)', () => {
  it('제목 · 까닭 · 다시 보내는 길', () => {
    expect(scheduledMailFailedSay({ subject: '11월 기성 청구', error: '메일 연결 전입니다', by: '한백관리자' })).toBe([
      '예약한 메일을 보내지 못했습니다 — 11월 기성 청구',
      '까닭: 메일 연결 전입니다',
      '예약 한백관리자 · 카드에서 고친 뒤 「승인하고 보내기」로 다시 보내 주세요.',
    ].join('\n'));
  });
});

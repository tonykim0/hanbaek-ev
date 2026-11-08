/**
 * 정산 계좌 — 은행마다의 하이픈(lib/bank-account formatAccountNo) · 은행 이름 맞추기(matchBankName).
 * ★숫자는 한 자리도 바뀌면 안 된다★ — 계좌번호 한 자리가 틀리면 돈이 남에게 간다. 끊는 자리만 고른다.
 * 계좌번호는 모두 지어낸 숫자다.
 */
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_LAYOUTS,
  BANKS,
  accountLayoutOf,
  accountPlaceholder,
  formatAccountNo,
  matchBankName,
  type Bank,
} from '@/lib/bank-account';

describe('formatAccountNo — 은행마다 끊는 자리', () => {
  const cases: Array<[bank: string, digits: string, shown: string]> = [
    // 지급 내역(구매요청간소화 엑셀)에 나온 모양 — 협력사 계좌가 실제로 이렇게 적혀 있었다
    ['KB국민은행', '12345678901234', '123456-78-901234'],
    ['KB국민은행', '123456789012', '123-45-6789-012'],
    ['IBK기업은행', '12345678901234', '123-456789-01-234'],
    ['NH농협은행', '3021234567890', '302-1234-5678-90'],
    ['신한은행', '110123456789', '110-123-456789'],
    ['우리은행', '1002123456789', '1002-123-456789'],
    ['하나은행', '12345678901234', '123-456789-01234'],
    ['카카오뱅크', '3333012345678', '3333-01-2345678'],
    ['케이뱅크', '100123456789', '100-123-456789'],
    ['새마을금고', '9002123456789', '9002-1234-5678-9'],
    ['광주은행', '123123456789', '123-123-456789'],
    // 나무위키 「계좌번호」의 지금 형식
    ['토스뱅크', '100012345678', '1000-1234-5678'],
    ['SC제일은행', '12345678901', '123-45-678901'],
    ['부산은행', '1011234567890', '101-1234-5678-90'],
    ['iM뱅크(대구)', '508101234567', '508-10-123456-7'],
    ['수협은행', '101012345678', '1010-1234-5678'],
    ['신협', '131123456789', '131-123-456789'],
    ['우체국', '12345612345678', '123456-12-345678'],
    ['KDB산업은행', '02012345678901', '020-1234-5678-901'],
    ['제주은행', '700123456789', '700-123-456789'],
    ['한국씨티은행', '1234567890123', '123-45678-901-23'],
    // 옛 형식 — 같은 은행의 다른 자릿수
    ['신한은행', '12345678901', '123-45-678901'],
    ['NH농협은행', '12345612345678', '123456-12-345678'],
    ['우리은행', '12345678901234', '123-456789-01-234'],
    ['광주은행', '1234123456789', '1234-123-456789'],
  ];
  it.each(cases)('%s %s → %s', (bank, digits, shown) => {
    expect(formatAccountNo(bank, digits)).toBe(shown);
  });

  it('자릿수가 같으면 앞자리로 가른다', () => {
    // 새마을금고 13자리: 9 로 시작하면 지금 계좌, 아니면 옛 계좌(금고 번호 4자리가 앞)
    expect(formatAccountNo('새마을금고', '1234561234567')).toBe('1234-56-123456-7');
    // 케이뱅크 12자리: 7 · 9 로 시작하면 간편송금 · 안심계좌
    expect(formatAccountNo('케이뱅크', '912341231234')).toBe('9-1234-123-1234');
    // 산업은행 14자리: 과목 010 · 036 은 입금 전용
    expect(formatAccountNo('KDB산업은행', '01012345678901')).toBe('010-12345678-901');
  });

  it('평생 · 맞춤계좌(0 으로 시작 · 휴대폰 번호)는 끊지 않는다 — 정해진 자리가 없다', () => {
    expect(formatAccountNo('신한은행', '012345678901')).toBe('012345678901');
    expect(formatAccountNo('수협은행', '012345678901')).toBe('012345678901');
    expect(formatAccountNo('우리은행', '01012345678')).toBe('01012345678');
    expect(formatAccountNo('NH농협은행', '01012345678')).toBe('01012345678');
  });

  it('모르는 은행 · 자릿수는 받은 그대로 — 틀린 하이픈보다 없는 하이픈이 낫다', () => {
    expect(formatAccountNo('전북은행', '1234567890123')).toBe('1234567890123');
    expect(formatAccountNo('경남은행', '123456789012')).toBe('123456789012');
    expect(formatAccountNo('하나은행', '123456789012')).toBe('123456789012'); // 12자리는 자료가 엇갈린다
    expect(formatAccountNo('KB국민은행', '1234567890123')).toBe('1234567890123');
    expect(formatAccountNo(null, '12345678901234')).toBe('12345678901234');
    expect(formatAccountNo('', '12345678901234')).toBe('12345678901234');
    expect(formatAccountNo('저축은행', '12345678901234')).toBe('12345678901234');
  });

  it('하이픈이 섞여 와도 숫자로 다시 끊는다 · 빈 값은 빈 글자', () => {
    expect(formatAccountNo('KB국민은행', '123-456-78-901234')).toBe('123456-78-901234');
    expect(formatAccountNo('KB국민은행', ' 1234 5678 9012 34 ')).toBe('123456-78-901234');
    expect(formatAccountNo('KB국민은행', null)).toBe('');
    expect(formatAccountNo('KB국민은행', '')).toBe('');
    // 모르는 자릿수면 적힌 하이픈도 그대로 둔다
    expect(formatAccountNo('전북은행', '1234-56-7890123')).toBe('1234-56-7890123');
  });

  it('자유 입력 시절의 은행 이름도 맞춘다', () => {
    expect(formatAccountNo('국민', '12345678901234')).toBe('123456-78-901234');
    expect(formatAccountNo('기업', '12345678901234')).toBe('123-456789-01-234');
    expect(formatAccountNo('농협', '3021234567890')).toBe('302-1234-5678-90');
    expect(formatAccountNo('MG새마을금고', '9002123456789')).toBe('9002-1234-5678-9');
    expect(formatAccountNo('지역농협', '3561234567891')).toBe('356-1234-5678-91');
    expect(formatAccountNo('외환은행', '12345678901234')).toBe('123-456789-01234');
  });

  it('★어느 은행 · 어느 자릿수에서도 숫자는 그대로다★ — 하이픈만 더한다', () => {
    for (const bank of BANKS) {
      for (let len = 8; len <= 16; len++) {
        for (const lead of ['0', '1', '3', '7', '9', '01', '010', '036']) {
          const digits = (lead + '4820517396'.repeat(2)).slice(0, len);
          const shown = formatAccountNo(bank, digits);
          expect(shown.replace(/-/g, ''), `${bank} ${digits}`).toBe(digits);
          expect(shown.startsWith('-') || shown.endsWith('-') || shown.includes('--'), `${bank} ${shown}`).toBe(false);
        }
      }
    }
  });
});

describe('ACCOUNT_LAYOUTS — 표의 모양', () => {
  it('은행 목록과 표가 1:1 이다', () => {
    expect(Object.keys(ACCOUNT_LAYOUTS).sort()).toEqual([...BANKS].sort());
  });

  it('끊는 자리는 숫자 칸들이고 합이 저장 범위(8~16) 안이다', () => {
    for (const [bank, layouts] of Object.entries(ACCOUNT_LAYOUTS)) {
      for (const [groups] of layouts) {
        expect(groups, bank).toMatch(/^\d+(-\d+)+$/);
        const len = groups.split('-').reduce((a, n) => a + Number(n), 0);
        expect(len, `${bank} ${groups}`).toBeGreaterThanOrEqual(8);
        expect(len, `${bank} ${groups}`).toBeLessThanOrEqual(16);
      }
    }
  });

  it('가르는 앞자리 없이 같은 자릿수 줄이 앞에 있으면 뒤 줄은 영영 안 쓰인다 — 그런 줄이 없다', () => {
    for (const [bank, layouts] of Object.entries(ACCOUNT_LAYOUTS)) {
      const lens = layouts.map(([groups]) => groups.split('-').reduce((a, n) => a + Number(n), 0));
      layouts.forEach(([groups], i) => {
        const shadow = layouts.findIndex(([, when], j) => j < i && lens[j] === lens[i] && !when);
        expect(shadow, `${bank} ${groups}`).toBe(-1);
      });
    }
  });

  it('accountLayoutOf — 고른 형식을 돌려준다, 없으면 null', () => {
    expect(accountLayoutOf('KB국민은행', '12345678901234')).toBe('6-2-6');
    expect(accountLayoutOf('KB국민은행', '1234')).toBeNull();
    expect(accountLayoutOf(undefined, '12345678901234')).toBeNull();
  });
});

describe('accountPlaceholder — 입력칸의 자리표시', () => {
  it('그 은행의 지금 형식, 모르면 「숫자만」', () => {
    expect(accountPlaceholder('KB국민은행')).toBe('000000-00-000000');
    expect(accountPlaceholder('케이뱅크')).toBe('000-000-000000');
    expect(accountPlaceholder('KDB산업은행')).toBe('000-0000-0000-000');
    expect(accountPlaceholder('새마을금고')).toBe('0000-0000-0000-0');
    expect(accountPlaceholder('전북은행')).toBe('숫자만');
    expect(accountPlaceholder('')).toBe('숫자만');
  });
});

describe('matchBankName — 목록의 이름으로 되돌린다', () => {
  const cases: Array<[string, Bank | null]> = [
    ['KB국민은행', 'KB국민은행'],
    ['국민', 'KB국민은행'],
    ['국민은행', 'KB국민은행'],
    ['기업은행', 'IBK기업은행'],
    ['농협', 'NH농협은행'],
    ['단위농협', 'NH농협은행'],
    ['대구은행', 'iM뱅크(대구)'],
    ['MG새마을금고', '새마을금고'],
    ['K뱅크', '케이뱅크'],
    ['신용협동조합', '신협'],
    ['외환', '하나은행'],
    ['주식회사 신한은행', '신한은행'],
    ['은행', null],
    ['', null],
  ];
  it.each(cases)('%s → %s', (name, bank) => {
    expect(matchBankName(name)).toBe(bank);
  });
});

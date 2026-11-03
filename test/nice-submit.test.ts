/**
 * 나이스인프라 제출 정보와 계약서 초안 메일의 글 — lib/nice-submit · lib/consult-dup (한백 지시 2026-11-03).
 *
 * 7번 「기설치 현황」은 사전현장컨설팅 결과서 「6. 중복설치」에서 온다 — 접수 때 협력사가 고른 기설치 있음/없음이 아니다.
 * 못 읽었으면 빈칸이다(지어낸 값이 복사돼 나가면 안 된다). 메일 본문은 한백이 준 본보기 그대로다.
 */
import { describe, expect, it } from 'vitest';
import { consultDupOf, dupTextOf, sameDupFiles, type ConsultDup } from '@/lib/consult-dup';
import { niceDraftMail, niceSubmitLines, niceSubmitText } from '@/lib/nice-submit';

const dup = (over: Partial<ConsultDup> = {}): ConsultDup => ({
  found: true, none: false, items: {}, files: ['https://blob/a.pdf'], readAt: '2026-11-03T00:00:00Z', ...over,
});

const SITE = {
  name: '울산 남구 대공원코오롱파크폴리스 (기후부 12기)',
  addr: '울산광역시 남구 대공원로 241 (신정동)',
  parkTotal: 510,
  bizType: '환경부' as const,
  installLoc: '실내' as const,
  consultDup: dup({ none: true }),
};

describe('결과서 「6. 중복설치」', () => {
  it('체크된 칸만 수량과 함께 — 「해당사항 없음」이나 아무 체크도 없으면 「없음」', () => {
    expect(dupTextOf(dup({ none: true }))).toBe('없음');
    expect(dupTextOf(dup())).toBe('없음');
    expect(dupTextOf(dup({ items: { slow: 5 } }))).toBe('완속 5기');
    expect(dupTextOf(dup({ items: { slow: 4, fast: 1, kiosk: null } }))).toBe('급속 1기, 완속 4기, 키오스크 (수량 미기재)');
  });

  it('못 읽었으면(없거나 6번을 못 찾음) null — 빈칸으로 둔다', () => {
    expect(dupTextOf(null)).toBeNull();
    expect(dupTextOf(undefined)).toBeNull();
    expect(dupTextOf(dup({ found: false }))).toBeNull();
  });

  it('판독의 답 — 체크 안 된 칸에 적힌 수(키오스크 「0」)는 빠지고, 「4대」 같은 수량은 숫자로', () => {
    expect(consultDupOf({
      found: true, none: false, fast: { checked: false, qty: null }, slow: { checked: true, qty: '4대' },
      dist: { checked: false, qty: null }, outlet: { checked: false, qty: null }, kiosk: { checked: false, qty: 0 },
    })).toEqual({ none: false, items: { slow: 4 } });
    expect(consultDupOf({ found: false })).toBeNull();
    expect(consultDupOf('nope')).toBeNull();
  });

  it('같은 결과서로 읽었는가 — 순서는 보지 않는다', () => {
    expect(sameDupFiles(dup({ files: ['b', 'a'] }), ['a', 'b'])).toBe(true);
    expect(sameDupFiles(dup({ files: ['a'] }), ['a', 'b'])).toBe(false);
    expect(sameDupFiles(null, ['a'])).toBe(false);
  });
});

describe('나이스인프라 제출 정보', () => {
  it('7번은 결과서에서 — 결과서를 못 읽었으면 빈칸(접수 때 고른 기설치는 보지 않는다)', () => {
    expect(niceSubmitLines(SITE, 12)[6]).toBe('7. 기설치 현황 : 없음');
    expect(niceSubmitLines({ ...SITE, consultDup: dup({ items: { slow: 6 } }) }, 12)[6]).toBe('7. 기설치 현황 : 완속 6기');
    expect(niceSubmitLines({ ...SITE, consultDup: null }, 12)[6]).toBe('7. 기설치 현황 : ');
  });

  it('화면의 글은 8번(기타)까지 — 콘솔이 모르는 줄은 비워 둔다', () => {
    expect(niceSubmitText(SITE, 12).split('\n')).toEqual([
      '1. 장소명 : 울산 남구 대공원코오롱파크폴리스 (기후부 12기)',
      '2. 주소 : 울산광역시 남구 대공원로 241 (신정동)',
      '3. 주차면수 : 510면',
      '4. 설치기수 : 12기',
      '5. 설치위치 : 옥내',
      '6. 설치유형 : 보조',
      '7. 기설치 현황 : 없음',
      '8. 기타 : ',
    ]);
  });

  it('계약서 초안 메일 — 한백이 준 본보기 그대로(인사 · 1~7번 · 맺음)', () => {
    const m = niceDraftMail(SITE, 12);
    expect(m.subject).toBe('계약서 초안 송부 — 울산 남구 대공원코오롱파크폴리스 (기후부 12기)');
    expect(m.body).toBe([
      '안녕하세요, 계약서 초안 송부드립니다.',
      '',
      '1. 장소명 : 울산 남구 대공원코오롱파크폴리스 (기후부 12기)',
      '2. 주소 : 울산광역시 남구 대공원로 241 (신정동)',
      '3. 주차면수 : 510면',
      '4. 설치기수 : 12기',
      '5. 설치위치 : 옥내',
      '6. 설치유형 : 보조',
      '7. 기설치 현황 : 없음',
      '',
      '감사합니다',
    ].join('\n'));
  });
});

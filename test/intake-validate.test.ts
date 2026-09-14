/**
 * 접수 검증 — ★기본 현장정보만으로 접수된다★ (한백 지시 2026-09-14).
 *
 * 현장은 이름·운영사·계약조건이 정해지는 순간 존재하는데, 대수와 서류는 그 뒤에 며칠씩
 * 걸려 모인다. 그동안 콘솔에 현장이 없으면 진행 상황을 적을 자리도 없었다 — 만들어 두고
 * 현장 상세에서 마저 채운다. 「필수」는 계약을 ★확인★하려면 있어야 한다는 뜻이지 현장을
 * 만들 수 없다는 뜻이 아니다(판정 정본은 lib/stage 의 docsFilled).
 */
import { describe, expect, it } from 'vitest';
import { checkDraft } from '@/lib/intake-validate';
import type { IntakeDraft } from '@/types/project';

/** 현장 카드의 별표 칸만 채운 초안 — 대수도 서류도 없다 */
const basic = (over: Partial<IntakeDraft> = {}): IntakeDraft => ({
  cpo: '플러그링크',
  salesOrg: null, gcOrg: null,
  name: '서울 강남 행복아파트',
  addr: null, bldgType: null,
  contractParty: '입주자대표회의',
  parkTotal: null, mgr: null, tel: null, mail: null,
  preInstall: '없음', preNote: null,
  powerType: '모자분리', replType: null, bizType: '환경부',
  note: null, lines: [], documents: [],
  ...over,
});

describe('checkDraft — 기본 현장정보만으로 접수된다', () => {
  it('대수도 서류도 없이 접수된다', () => {
    expect(checkDraft(basic()).errors).toEqual([]);
  });

  it('빠진 것은 막지 않고 말한다 — 대수와 필수 서류가 경고로 온다', () => {
    const { warnings } = checkDraft(basic());
    expect(warnings.some((w) => w.includes('대수'))).toBe(true);
    expect(warnings.some((w) => w.includes('필수 서류'))).toBe(true);
  });

  it('필수 서류 수는 그대로 센다 — 화면의 「필수 n/m」이 이 값을 쓴다', () => {
    const c = checkDraft(basic());
    expect(c.requiredCount).toBeGreaterThan(0);
    expect(c.satisfiedCount).toBe(0);
  });
});

describe('checkDraft — 현장 카드의 별표 칸은 그대로 막는다', () => {
  const first = (over: Partial<IntakeDraft>) => checkDraft(basic(over)).errors;

  it('현장명', () => expect(first({ name: '  ' })).toContain('현장명을 입력하세요.'));
  it('운영사', () => expect(first({ cpo: null as never }).length).toBeGreaterThan(0));
  it('계약주체', () => expect(first({ contractParty: null }).length).toBeGreaterThan(0));
  it('수전방식', () => expect(first({ powerType: null }).length).toBeGreaterThan(0));
  it('사업구분', () => expect(first({ bizType: null }).length).toBeGreaterThan(0));

  /* 기설치가 「있음」인데 현황이 비면 나중에 아무도 그 사실을 모른다 */
  it('기설치 있음이면 현황을 적어야 한다', () => {
    expect(first({ preInstall: '있음' }).some((e) => e.includes('기설치'))).toBe(true);
  });
});

/* ★없는 것과 잘못된 것은 다른 말이다★ — 안 적은 대수는 통과, 적어 놓고 틀린 것은 막는다 */
describe('checkDraft — 적힌 대수가 틀리면 그대로 막는다', () => {
  const line = (over: Partial<IntakeDraft['lines'][number]> = {}) =>
    ({ termYears: 7, qty: 1, powerType: null, replType: null, memo: null, ...over });

  it('대수가 0 이면 막는다', () => {
    expect(checkDraft(basic({ lines: [line({ qty: 0 })] })).errors.length).toBeGreaterThan(0);
  });

  it('계약기간이 목록 밖이면 막는다', () => {
    expect(checkDraft(basic({ lines: [line({ termYears: 3 })] })).errors.length).toBeGreaterThan(0);
  });

  it('혼용 현장은 라인마다 수전방식을 골라야 한다', () => {
    const errors = checkDraft(basic({
      powerType: '한전불입+모자분리', lines: [line({ powerType: null })],
    })).errors;
    expect(errors.some((e) => e.includes('수전방식'))).toBe(true);
  });

  it('제대로 적은 대수는 통과한다', () => {
    expect(checkDraft(basic({ lines: [line()] })).errors).toEqual([]);
  });
});

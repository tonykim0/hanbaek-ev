/**
 * 계약자 구분으로 견본 글 거르기(lib/solar/proposal/party) — 개인사업자 제안서는 지원금을 말하지 않고, 법인 제안서는 개인사업자 전용 글을 뺀다.
 *
 * ★견본의 실제 문장 · 금액은 쓰지 않는다★(저장소가 공개다) — 꼴(머리 표 · 문장 · 「, 」 · 「 + 」 구절 · 괄호)만 같은 꾸민 글이다.
 * 실제 견본 「_최종」으로 두 계약자를 지어 장마다 대 본 것은 저장소 밖에서 했다(2026-11-10).
 */
import { describe, expect, it } from 'vitest';
import type { TextEdit } from '@/lib/pptx/deck';
import { markerOf, partyEdits, partyOf, type Party } from '@/lib/solar/proposal/party';

const apply = (text: string, edits: TextEdit[]) => [...edits].sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), text);
const keepOnly = (text: string, keep: Party) => apply(text, partyEdits(text, keep).edits);

describe('누구의 글인가', () => {
  it('지원금이 든 글은 법인 · 「법인」만은 법인 · 「개인」만은 개인사업자 · 둘 다거나 없으면 함께', () => {
    expect(partyOf('B안을 고른 법인에는 지원금을 더 준다')).toBe('corporate');
    expect(partyOf('A안과 개인사업자는 지원금 대상이 아니다')).toBe('corporate');
    expect(partyOf('법인 등기부등본')).toBe('corporate');
    expect(partyOf('개인사업자는 A안이 더 받는다')).toBe('personal');
    expect(partyOf('개인 임대인')).toBe('personal');
    expect(partyOf('개인/법인 무관')).toBeNull();
    expect(partyOf('개인정보 수집 동의')).toBeNull();
    expect(partyOf('연 10원/kW')).toBeNull();
  });
  it('머리 표 — 앞 빈칸 · 「※ 」 · 「* 」', () => {
    expect(markerOf('※ 가나다')).toBe('※ ');
    expect(markerOf('    가나다')).toBe('    ');
    expect(markerOf('* 가')).toBe('* ');
    expect(markerOf('가나다')).toBe('');
  });
});

describe('거르기', () => {
  it('문장 — 첫 구절이 다른 계약자의 것이면 문장째, 머리 표는 남긴다', () => {
    const text = '※ B안을 고른 법인에는 지원금 3원/kW(10kW 기준 30원, 1회)를 따로 주며, 이 경우 합은 130원입니다. 금액은 VAT 별도입니다.';
    expect(keepOnly(text, 'personal')).toBe('※ 금액은 VAT 별도입니다.');
    expect(partyEdits(text, 'corporate').edits).toEqual([]);
  });
  it('구절 — 「, …」 · 「 + …」 뒤 구절이 다른 계약자의 것이면 그 구절만(끊은 표째)', () => {
    expect(keepOnly('예상 수익: 약 1.1만원 (해마다 약 5원), B안 법인은 지원금 포함 약 1.2만원', 'personal')).toBe('예상 수익: 약 1.1만원 (해마다 약 5원)');
    expect(keepOnly('100원 (운영 시) + 법인 지원금 50원 (신고 후)', 'personal')).toBe('100원 (운영 시)');
    expect(keepOnly('100원 (운영 시) + 법인 지원금 50원 (신고 후)', 'corporate')).toBe('100원 (운영 시) + 법인 지원금 50원 (신고 후)');
  });
  it('괄호 — 다른 계약자의 괄호만(앞 빈칸 하나와)', () => {
    expect(keepOnly('200원 (법인: 지원금 포함 250원)', 'personal')).toBe('200원');
    expect(keepOnly('200원 (개인사업자는 없음) 기준', 'corporate')).toBe('200원 기준');
  });
  it('통째로 다른 계약자의 글이면 empty — 표 칸은 「-」, 글상자는 덩이째(부르는 쪽)', () => {
    expect(partyEdits('법인은 B안이 50원 많음 (지원금 포함)', 'personal').empty).toBe(true);
    expect(partyEdits('개인사업자는 A안이 30원 많음', 'corporate').empty).toBe(true);
    expect(partyEdits('(B안 법인) 지원금 계산서 발행 → 20일 안에 받음', 'personal').empty).toBe(true);
    expect(partyEdits('※ B안 법인에는 지원금을 준다.', 'personal')).toMatchObject({ empty: true });
    expect(partyEdits('개인사업자는 A안이 30원 많음', 'personal')).toEqual({ edits: [], empty: false });
  });
  it('지원금을 말하는 개인사업자 문장은 법인 제안서에만 — 개인사업자 제안서는 지원금을 아예 말하지 않는다', () => {
    const text = '    A안과 개인사업자 임대인은 지원금 대상이 아닙니다. 금액은 VAT 별도이며, 운영 뒤 줍니다.';
    expect(keepOnly(text, 'personal')).toBe('    금액은 VAT 별도이며, 운영 뒤 줍니다.');
    expect(keepOnly(text, 'corporate')).toBe(text);
  });
  it('글 끝까지 걷으면 남는 글 끝의 빈칸도 · 숫자의 점(「1.1」)은 문장 끝이 아니다', () => {
    expect(keepOnly('A는 1.1만원입니다. B 법인은 지원금 1.2만원입니다.', 'personal')).toBe('A는 1.1만원입니다.');
    expect(keepOnly('가 · 나 · 다', 'personal')).toBe('가 · 나 · 다');
  });
  it('걸러도 남는 다른 계약자 글은 없다 — 한 번 더 거르면 고칠 것이 없다', () => {
    const texts = [
      '※ B안을 고른 법인에는 지원금을 따로 주며, 이 경우 합은 130원입니다. 금액은 VAT 별도입니다.',
      '100원 (운영 시) + 법인 지원금 50원 (신고 후)',
      '200원 (법인: 지원금 포함 250원)',
      '예상 수익: 약 1.1만원 (해마다 약 5원), B안 법인은 지원금 포함 약 1.2만원',
    ];
    for (const s of texts) expect(partyEdits(keepOnly(s, 'personal'), 'personal').edits).toEqual([]);
  });
});

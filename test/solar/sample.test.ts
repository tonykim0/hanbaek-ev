/**
 * 견본 읽기 — 사업자 견본이 바꿀 자리로 적어 둔 빈칸 · 예시 숫자를 글에서 찾고, 이 현장 값으로 바꿀 자리를 낸다(lib/solar/proposal/sample).
 *
 * ★사업자의 실제 조건 · 견본 금액 · 견본 문장은 쓰지 않는다★(저장소가 공개다) — 꾸민 셈과 꾸민 글로 모양만 본다. 실제 견본 두 판
 * (「복구됨」 · 「_최종」)으로 지어 견본과 글자까지 맞춘 것은 저장소 밖에서 했다(2026-11-09).
 */
import { describe, expect, it } from 'vitest';
import { editRuns, type TextEdit } from '@/lib/pptx/deck';
import { blanksIn, exampleEdits, exampleKwOf, fieldOf, kwIn, moneyIn, swapTableOf, wattsIn, type Amounts } from '@/lib/solar/proposal/sample';

/** 꾸민 셈 — 해마다 kW × 10,000원 · 선지급 kW × 45,000원 · 20년 합 */
const amounts = (kw: number): Amounts => ({ yearly: Math.round(kw * 10_000), upfront: Math.round(kw * 45_000), total: Math.round(kw * 10_000) * 20 });
const apply = (text: string, edits: TextEdit[]) => [...edits].sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), text);

describe('빈칸', () => {
  it('대괄호 · 빈 대괄호 뒤의 단위 · 그림 제목도 대괄호다', () => {
    expect(blanksIn('[(주)고객명] ([현장 주소])').map((b) => b.name)).toEqual(['(주)고객명', '현장 주소']);
    const [area] = blanksIn('[    ] ㎡');
    expect(area).toMatchObject({ name: '', unit: '㎡', start: 0, end: 6, unitEnd: 8 });
    expect(blanksIn('[   ]MW ([접속 조건])').map((b) => [b.name, b.unit])).toEqual([
      ['', 'MW'],
      ['접속 조건', ''],
    ]);
    expect(blanksIn('( [   ]EA × 600Wp )')[0].unit).toBe('EA');
    expect(blanksIn('[  ]도')[0]).toMatchObject({ unit: '도', unitEnd: 5 });
    expect(blanksIn('[    ] kWh')[0].unit).toBe('');
  });
  it('어느 값의 자리인가 — 이름으로, 빈 대괄호는 단위로, 면적은 줄 이름으로 대지 · 건축을 가른다', () => {
    const of = (text: string, context = '') => fieldOf(blanksIn(text)[0], context);
    expect([of('[(주)고객사명]'), of('[현장 주소]'), of('[용도지역]'), of('[지목]'), of('[건물용도]'), of('[YYYY.MM.DD]'), of('[변전소명]'), of('[접속 조건]')]).toEqual([
      'customer',
      'address',
      'zoning',
      'landCategory',
      'buildingUse',
      'approvedOn',
      'substation',
      'gridCondition',
    ]);
    expect([of('[    ] ㎡', '대지면적'), of('[    ] ㎡', '건축면적'), of('[    ] ㎡', '연면적')]).toEqual(['landArea', 'buildingArea', null]);
    expect([of('[   ]MW'), of('[    ] kW'), of('[   ]EA'), of('[  ]도')]).toEqual(['spareMw', 'capacity', 'panels', 'tilt']);
    expect([of('[전국 기본풍속]'), of('[    ]')]).toEqual([null, null]);
  });
});

describe('예시 숫자', () => {
  it('금액 — 원 단위 · 어림(억 · 만), 단가(「…원/kW」)는 금액이 아니다', () => {
    expect(moneyIn('연 10,000원/kW → 1,005,000 원 · 약 2,010만원 · 1.2억원 · 3만원/KW').map((m) => [m.kind, m.value, m.unit])).toEqual([
      ['won', 1_005_000, '원'],
      ['rough', 2010, '만원'],
      ['rough', 1.2, '억원'],
    ]);
  });
  it('용량 — 「(예시)」 · 「 예시」 표시까지 · kWh 는 아니다', () => {
    expect(kwIn('100.5kW(예시) 기준').map((k) => [k.value, k.marker?.text])).toEqual([[100.5, '(예시)']]);
    expect(kwIn('(100.5kW 예시, VAT 별도)')[0].marker?.text).toBe(' 예시');
    expect(kwIn('1,234.5 kW 기준 · 연 500kWh · 원/kW')).toMatchObject([{ value: 1234.5, marker: null }]);
  });
  it('예시 용량 — 견본 금액을 가장 많이 설명하는 용량, 금액이 하나도 안 맞으면 「(예시)」가 붙은 것, 용량이 없으면 null', () => {
    const texts = ['100.5kW(예시) 기준', '연 1,005,000원 · 선지급 4,522,500원', '3kW 이하는 따로'];
    expect(exampleKwOf(texts, amounts)).toBe(100.5);
    // 조건이 견본과 다르면(셈이 견본 금액을 못 낸다) 표시가 붙은 용량을 골라 어느 금액이 안 맞는지 짚게 한다
    expect(exampleKwOf(texts, (kw) => ({ yearly: kw * 11_000 }))).toBe(100.5);
    expect(exampleKwOf(['연 1,005,000원', '100.5kW 기준'], amounts)).toBe(100.5);
    expect(exampleKwOf(['연 1,005,000원'], amounts)).toBeNull();
  });
  it('바꾸기 — 문장은 견본 그대로, 숫자만 이 현장 숫자로 · 「(예시)」는 걷고 「 예시」는 「 기준」', () => {
    const t = swapTableOf(100.5, 480.35, amounts);
    const head = '100.5kW(예시) 기준 예상 수익: 20년간 약 2,010만원 (해마다 1,005,000 원)';
    const r = exampleEdits(head, t);
    expect(r.unknown).toEqual([]);
    expect(r.matched).toBe(3);
    expect(apply(head, r.edits)).toBe('480.35kW 기준 예상 수익: 20년간 약 9,607만원 (해마다 4,803,500 원)');
    const title = '두 방식 비교 (100.5kW 예시, VAT 별도)';
    expect(apply(title, exampleEdits(title, t).edits)).toBe('두 방식 비교 (480.35kW 기준, VAT 별도)');
    // 단가는 그대로
    const rate = '연 10,000원/kW (1~20년차) → 선지급 4,522,500원';
    expect(apply(rate, exampleEdits(rate, t).edits)).toBe('연 10,000원/kW (1~20년차) → 선지급 21,615,750원');
  });
  it('어림이 만원 ↔ 억원으로 넘어가면 단위까지 바꾼다', () => {
    const t = swapTableOf(100.5, 1000, amounts);
    const text = '20년간 약 2,010만원';
    expect(apply(text, exampleEdits(text, t).edits)).toBe('20년간 약 2억원');
  });
  it('못 바꾸는 금액 · 다른 용량 · 꼴이 다른 금액은 짚는다 — 조건이 견본과 다르거나 견본에 새로 생긴 셈', () => {
    const t = swapTableOf(100.5, 480.35, amounts);
    expect(exampleEdits('10년 합계 10,050,000원', t).unknown).toEqual(['10,050,000원']);
    expect(exampleEdits('3kW 이하', t).unknown).toEqual(['3kW']);
    expect(exampleEdits('약 1억 1천만원', t).unknown).toEqual(['1억', '1천']);
    expect(exampleEdits('제11조 · 20영업일 · 3.3시간', t).unknown).toEqual([]);
  });
  it('두 셈이 같은 견본 금액을 내면 어느 것인지 몰라 짚는다', () => {
    const twin = (kw: number): Amounts => ({ a: Math.round(kw * 10_000), b: kw === 100.5 ? 1_005_000 : 7 });
    const t = swapTableOf(100.5, 200, twin);
    expect(t.won.get(1_005_000)).toBeNull();
    expect(exampleEdits('1,005,000원', t).unknown).toEqual(['1,005,000원']);
  });
  it('모듈 출력 「…Wp」', () => expect(wattsIn('모듈 600Wp 양면 · ( 12EA × 600Wp )')).toEqual([600, 600]));
});

describe('토막을 살려 고치기', () => {
  it('숫자만 따로 쓴 토막 · 단위 · 표시가 다른 토막에 있어도 그 글자만 고친다', () => {
    // 「100.5」(크게) | 「kW(예시) 기준 …」 — 바꾼 숫자는 큰 토막에, 「(예시)」만 뒤 토막에서 빠진다
    expect(
      editRuns(
        ['100.5', 'kW(예시) 기준'],
        [
          { start: 0, end: 5, text: '480.35' },
          { start: 7, end: 11, text: '' },
        ],
      ),
    ).toEqual(['480.35', 'kW 기준']);
  });
  it('걸친 자리는 시작 토막에 넣고 뒤 토막에서 빼고 · 한 토막의 두 자리도 · 줄바꿈을 걸치면 멈춘다', () => {
    expect(editRuns(['[변전소명] ', '변전소'], [{ start: 0, end: 6, text: '북충주' }])).toEqual(['북충주 ', '변전소']);
    expect(editRuns(['54', '9만원'], [{ start: 0, end: 5, text: '1.05억원' }])).toEqual(['1.05억원', '']);
    expect(
      editRuns(
        ['[   ]MW ([접속 조건])'],
        [
          { start: 0, end: 5, text: '8.39' },
          { start: 9, end: 16, text: '접속 가능' },
        ],
      ),
    ).toEqual(['8.39MW (접속 가능)']);
    expect(() => editRuns(['가', null, '나'], [{ start: 0, end: 3, text: 'x' }])).toThrow('줄바꿈');
  });
});

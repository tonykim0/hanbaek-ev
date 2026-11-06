/**
 * 태양광 제안서의 셈 · 표기 · 조건 다듬기 · 파워포인트 글 짓기.
 *
 * ★사업자의 실제 조건 값은 쓰지 않는다★(저장소가 공개다 — lib/solar/proposal/products 머리말) — 꾸민 숫자로 셈의 모양만 본다.
 * 실제 값으로 사업자 자료의 견본 숫자(1MW · 194.95kW)와 원 단위까지 맞춘 것은 2026-11-06 저장소 밖에서 했다.
 */
import { describe, expect, it } from 'vitest';
import {
  capacityKw, eok2, eokManText, kwText, lumoraRent, manwonText, millionText, monthAfter, profileAngleDeg, solar15, solarShare,
} from '@/lib/solar/proposal/calc';
import { mountText, proposalFileName, splitAddress } from '@/lib/solar/proposal/fill-common';
import { cleanTerms, missingTerms, PRODUCTS, TEMPLATES } from '@/lib/solar/proposal/products';
import { paraXml, tableXml, textBoxXml } from '@/lib/pptx/xml';

describe('용량 · 숫자 표기', () => {
  it('패널 장수 × 모듈 출력 → kW 소수 둘째', () => {
    expect(capacityKw(1000, 600)).toBe(600);
    expect(capacityKw(797, 615)).toBe(490.16);
    expect(kwText(490.16)).toBe('490.16');
    expect(kwText(1000)).toBe('1,000');
  });
  it('만원 소수 한 자리(아래 버림) · 억 묶음', () => {
    expect(manwonText(12_345_678)).toBe('1,234.5 만 원');
    expect(manwonText(30_000_000)).toBe('3,000 만 원');
    expect(manwonText(123_456_789)).toBe('1억 2,345.6 만 원');
    expect(manwonText(200_000_000)).toBe('2억 원');
  });
  it('억 · 만원 반올림', () => {
    expect(eokManText(123_456_789)).toBe('1억 2,346만원');
    expect(eokManText(50_000_000)).toBe('5,000만원');
    expect(eokManText(300_000_000)).toBe('3억원');
  });
  it('연차표 칸 — 백만원 소수 첫째, 없는 해는 「-」', () => {
    expect(millionText(42_000_000)).toBe('42');
    expect(millionText(20_638_800)).toBe('20.6');
    expect(millionText(null)).toBe('-');
  });
  it('억원 소수 둘째', () => expect(eok2(0.4)).toBe('0.40'));
});

describe('솔라15 — 임대료 15년 뒤 발전수익', () => {
  const t = { moduleWatt: 600, rentPerKw: 10_000, prepayPerKw: 50_000, prepayRentPerKw: 8_000, hoursPerDay: 3, smp: 100, rec: 50, recWeight: 1, degradationPct: 1 };
  it('기본형 — 1~15년 kW × 임대료, 16년부터 발전수익(열화는 1년차부터 센다)', () => {
    const r = solar15(1000, t, 'basic');
    expect(r.years).toHaveLength(35);
    expect(r.years[0]).toBeCloseTo(0.1, 10); // 1000kW × 1만원 = 1천만원 = 0.1억
    expect(r.years[15]).toBeCloseTo((1000 * 3 * 365 * 150 * 0.99 ** 15) / 1e8, 10);
    expect(r.sum1to20).toBeCloseTo(r.sum1to15 + r.sum16to20, 10);
    expect(r.sum35).toBeCloseTo(r.sum1to20 + r.sum21to35, 10);
    expect(r.monthlyManwon).toBeCloseTo((r.sum35 * 1e8) / 420 / 1e4, 10);
    expect(r.unitPrice).toBe(150);
  });
  it('5년 선납형 — 1년차 선지급, 2~5년 「-」, 6~15년 낮은 임대료', () => {
    const r = solar15(1000, t, 'prepay');
    expect(r.years[0]).toBeCloseTo(0.5, 10);
    expect(r.years.slice(1, 5)).toEqual([null, null, null, null]);
    expect(r.years[5]).toBeCloseTo(0.08, 10);
    expect(r.sum1to15).toBeCloseTo(0.5 + 0.08 * 10, 10);
  });
});

describe('솔라쉐어 2.0 — 두 지급 방식', () => {
  it('5년치 선지급 · 매년 지급의 칸과 합계', () => {
    const r = solarShare(100, { moduleWatt: 600, rentPerKw: 10_000, prepayBasePerKw: 8_000, prepayEventPerKw: 2_000, annualEventPerKw: 30_000 });
    expect(r.prepay.year1).toBe(100 * 10_000 * 5);
    expect(r.prepay.y6to20).toBe(100 * 10_000 * 15);
    expect(r.annual.year1).toBe(100 * 40_000);
    expect(r.annual.y2to5).toBe(100 * 10_000 * 4);
    expect(r.prepay.total).toBe(r.prepay.year1 + r.prepay.y6to20);
    expect(r.annual.total).toBe(r.annual.year1 + r.annual.y2to5 + r.annual.y6to20);
  });
});

describe('루모라 임대 — 세 선납 안', () => {
  const t = { moduleWatt: 600, price1: 10_000, price5: 9_000, price10: 7_000 };
  it('선납 기간의 나머지 해는 null, 합계는 20년치(선납 할인 없음)', () => {
    const r = lumoraRent(100, t);
    expect(r.options[5].years[0]).toBe(100 * 9_000 * 5);
    expect(r.options[5].years.slice(1, 5)).toEqual([null, null, null, null]);
    expect(r.options[10].years[10]).toBe(100 * 7_000);
    expect(r.options[1].total).toBe(100 * 10_000 * 20);
    expect(r.monthly).toBeCloseTo((100 * 10_000) / 12, 10);
  });
  it('누적으로 1년 선납이 10년 선납을 처음 앞서는 해', () => {
    const r = lumoraRent(100, t);
    // 10년 선납 누적 700만(1~10년) · 1년 선납 누적 100만 × n → 8년차 800만 > 700만
    expect(r.crossover).toMatchObject({ year: 8, one: 8_000_000, ten: 7_000_000, before: 7_000_000 });
  });
  it('끝내 못 앞서면 null', () => expect(lumoraRent(100, { moduleWatt: 600, price1: 1_000, price5: 9_000, price10: 9_000 }).crossover).toBeNull());
});

describe('조건 다듬기', () => {
  it('그 틀의 칸 전부를 숫자로 — 쉼표 붙은 글도 받는다', () => {
    const raw = Object.fromEntries(TEMPLATES['lumora-rent'].terms.map((f) => [f.key, String(f.min).replace(/\B(?=(\d{3})+(?!\d))/g, ',')]));
    expect(cleanTerms('lumora-rent', raw)).toEqual(Object.fromEntries(TEMPLATES['lumora-rent'].terms.map((f) => [f.key, f.min])));
  });
  it('빠진 칸 · 울타리 밖은 그 칸의 말로 던진다', () => {
    expect(() => cleanTerms('lumora-rent', {})).toThrow('모듈 출력');
    const ok = Object.fromEntries(TEMPLATES['lumora-rent'].terms.map((f) => [f.key, f.min]));
    expect(() => cleanTerms('lumora-rent', { ...ok, moduleWatt: 10 })).toThrow('사이여야');
  });
  it('빠진 조건의 이름', () => {
    expect(missingTerms('henergy-solarshare2', {})).toHaveLength(TEMPLATES['henergy-solarshare2'].terms.length);
    expect(missingTerms('henergy-solarshare2', null)).toContain('기본 임대료');
  });
  it('상품마다 틀이 있다', () => {
    for (const p of PRODUCTS) expect(TEMPLATES[p.template].company).toBe(p.company);
  });
});

describe('현장 글', () => {
  it('주소 두 줄 — 읍·면·동까지, 없으면 시·군·구까지', () => {
    expect(splitAddress('충청북도 충주시 산척면 동충주산단4길 17')).toEqual(['충청북도 충주시 산척면', '동충주산단4길 17']);
    expect(splitAddress('경기도 과천시 과천대로 7길 74')).toEqual(['경기도 과천시', '과천대로 7길 74']);
    expect(splitAddress('서울특별시 강남구 봉은사로 179')).toEqual(['서울특별시 강남구', '봉은사로 179']);
    expect(splitAddress('어딘가')).toEqual(['어딘가', '']);
  });
  it('설치형식 · 파일 이름', () => {
    expect(mountText({ style: 'tilted', tiltDeg: 12 })).toBe('고정경사형 12도');
    expect(mountText({ style: 'flush', tiltDeg: 12 })).toBe('지붕면 부착형');
    expect(proposalFileName('(주)가/나', '루모라 지붕임대', '2026-11-06')).toBe('(주)가 나_루모라 지붕임대_제안서_261106.pptx');
  });
  it('사업 일정의 달 넘김 · 음영각', () => {
    expect(monthAfter(2026, 11, 3)).toEqual({ year: 2027, month: 2 });
    expect(monthAfter(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(profileAngleDeg(2)).toBe(27); // atan(1/2) ≈ 26.57°
  });
});

describe('파워포인트 글 짓기', () => {
  it('글상자 — 글자를 이스케이프하고 글머리 · 들여쓰기 · 줄 높이를 적는다', () => {
    const p = paraXml({ runs: [{ text: 'A<B & "C"', size: 11, bold: true, color: '112233', font: 'Noto Sans KR' }], bullet: '•', lineSpacingPt: 15.9 });
    expect(p).toContain('A&lt;B &amp; &quot;C&quot;');
    expect(p).toContain('marL="171450" indent="-171450"');
    expect(p).toContain('<a:spcPts val="1590"/>');
    expect(p).toContain('pitchFamily="34"');
    expect(textBoxXml(3, '이름', { x: 0, y: 0, w: 10, h: 10 }, [], { wrap: true })).toContain('wrap="square"');
  });
  it('표 — 줄의 칸 수가 열 수와 다르면 던진다(합친 칸은 그만큼 센다)', () => {
    const o = { font: 'F', size: 10, border: { color: '000000', w: 6350 } };
    expect(tableXml(1, 't', { x: 0, y: 0, w: 30, h: 10 }, [10, 10, 10], [10], [[{ text: 'a', span: 2 }, { text: 'b' }]], o)).toContain('hMerge="1"');
    expect(() => tableXml(1, 't', { x: 0, y: 0, w: 30, h: 10 }, [10, 10, 10], [10], [[{ text: 'a' }]], o)).toThrow('칸 수');
  });
});

/**
 * 태양광 제안서의 셈 · 표기 · 조건 다듬기 · 파워포인트 글 짓기.
 *
 * ★사업자의 실제 조건 값은 쓰지 않는다★(저장소가 공개다 — lib/solar/proposal/products 머리말) — 꾸민 숫자로 셈의 모양만 본다.
 * 실제 값으로 사업자 자료의 견본 숫자(1MW · 194.95kW)와 원 단위까지 맞춘 것은 2026-11-06 저장소 밖에서 했다.
 */
import { describe, expect, it } from 'vitest';
import {
  capacityKw, eok2, eokManText, kwText, lumoraLease, lumoraRent, millionText, mohaet, monthAfter, profileAngleDeg, roughWonText, solar15, wonText,
} from '@/lib/solar/proposal/calc';
import {
  estWidthPt, fitSizePt, fitText, mountText, PHONE_DIGITS, phoneDigitsOf, proposalFileName, sellerBlock, sellerContact, sellerCover, splitAddress, storedSeller,
} from '@/lib/solar/proposal/fill-common';
import { formatKoreanPhone } from '@/lib/contract-form';
import { lumoraPlans } from '@/lib/solar/proposal/fill-lumora';
import { compareCells, compareText, dateText, gridCondition, gridLines, gridNotes, gridTableRows, manText, rentTexts, siteRows } from '@/lib/solar/proposal/fill-henergy';
import type { GridRow, GridView, SiteFacts } from '@/lib/solar/types';
import { cleanTerms, missingTerms, PRODUCTS, TEMPLATE_KEYS, TEMPLATES, UPCOMING } from '@/lib/solar/proposal/products';
import { paraXml, rectXml, tableXml, textBoxXml } from '@/lib/pptx/xml';
import { orphansOf, sha256Hex } from '@/lib/pptx/deck';
import { unprojector, type LngLat } from '@/lib/solar/geo';
import { layoutRoof } from '@/lib/solar/layout';
import { layoutRuleOf, proposalLayout } from '@/lib/solar/proposal/layout-rule';

describe('용량 · 숫자 표기', () => {
  it('패널 장수 × 모듈 출력 → kW 소수 둘째', () => {
    expect(capacityKw(1000, 600)).toBe(600);
    expect(capacityKw(797, 615)).toBe(490.16);
    expect(kwText(490.16)).toBe('490.16');
    expect(kwText(1000)).toBe('1,000');
  });
  it('원 · 「약 ○억원」(억 소수 둘째, 끝 0 뗌) · 1억 아래는 만원 반올림', () => {
    expect(wonText(5_486_000.000001)).toBe('5,486,000');
    expect(roughWonText(109_720_000)).toBe('1.1억원');
    expect(roughWonText(115_891_750)).toBe('1.16억원');
    expect(roughWonText(200_000_000)).toBe('2억원');
    expect(roughWonText(5_486_000)).toBe('549만원');
    expect(roughWonText(24_000_000)).toBe('2,400만원');
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

describe('모햇 — 1년 선납 · 5년 선납 · 참여지원금', () => {
  // 꾸민 조건(실제 값은 DB — 견본 137.15kW 의 숫자는 저장소 밖에서 원 단위까지 맞췄다)
  const t = { moduleWatt: 600, rentPerKw: 10_000, prepay5PerKw: 9_000, subsidyPerKw: 20_000 };
  const r = mohaet(100.5, t);
  it('1년 선납은 해마다 kW × 임대료 · 5년 선납은 1년차에 5년치(낮은 단가), 2~5년 「-」, 6년차부터 임대료', () => {
    expect(r.annual).toBe(1_005_000);
    expect(r.prepay).toBe(4_522_500);
    expect(r.one.years).toEqual(Array(20).fill(1_005_000));
    expect(r.five.years.slice(0, 6)).toEqual([4_522_500, null, null, null, null, 1_005_000]);
    expect(r.one.total).toBe(20_100_000);
    expect(r.five.total).toBe(4_522_500 + 15 * 1_005_000);
    expect(r.subsidy).toBe(2_010_000);
  });
  it('원 단위로 반올림한 해의 합이 합계다(표의 칸을 더하면 합계)', () => {
    const odd = mohaet(33.33, { ...t, rentPerKw: 12_345 });
    expect(odd.annual).toBe(Math.round(33.33 * 12_345));
    expect(odd.one.total).toBe(odd.annual * 20);
  });
  it('임대료 쪽 — 두 머리 · 연차 칸(5년 선납 2~5년은 견본의 「-」 그대로) · 머리말 검정/빨강 · 각주', () => {
    const x = rentTexts(r, t);
    expect(x.oneHead).toBe('1년 선납 (연 10,000원/kW)');
    expect(x.fiveHead).toBe('5년 선납 (1~5년차 연 9,000원/kW)');
    expect(x.years.map(([n]) => n)).toEqual([1, 2, 3, 4, 5, 6, 7, 20]);
    expect(x.years[0]).toEqual([1, '1,005,000 원', '4,522,500 원']);
    expect(x.years[1][2]).toBeNull();
    expect(x.years[5]).toEqual([6, '1,005,000 원', '1,005,000 원']);
    expect(x.oneTotal).toBe('20,100,000 원');
    expect(x.headBlack).toBe('100.5kW 기준 예상 임대수익: ');
    expect(x.headRed).toBe('20년간 약 2,010만원 (연 평균 약 101만원), 5년 선납 법인은 참여지원금 포함 약 2,161만원');
    expect(x.note).toContain('참여지원금 20,000원/kW(100.5kW 기준 2,010,000원, 1회)');
    expect(x.note).toContain(`20년 총 수령액은 ${wonText(r.five.total + r.subsidy)}원입니다.`);
  });
  it('비교표 — 20년 총액이 큰 쪽과 차(개인은 지원금 없이 · 법인은 지원금 포함)', () => {
    const cells = new Map(compareCells(r, t).map(([row, col, text]) => [`${row},${col}`, text]));
    expect(cells.get('4,1')).toBe('100.5kW 기준 지급액');
    expect(cells.get('5,3')).toBe('20,000원/kW → 2,010,000원 (1회)');
    expect(cells.get('8,2')).toBe(`개인 임대인은 1년 선납이 ${wonText(r.one.total - r.five.total)}원 많음`);
    expect(cells.get('8,3')).toBe(`법인 임대인은 5년 선납이 ${wonText(r.five.total + r.subsidy - r.one.total)}원 많음`);
    expect(compareText('개인', 10, 10)).toBe('개인 임대인은 두 방식이 같음');
  });
  it('공유옥상 구조 그림의 임대료 — 만원으로 떨어지면 만원', () => {
    expect(manText(40_000)).toBe('4만원');
    expect(manText(35_000)).toBe('3.5만원');
    expect(manText(42_500)).toBe('42,500원');
  });
});

describe('모햇 부지 검토 — 공적 자료 · 한전 여유용량', () => {
  const layers = (sub: number | null, tr: number | null, feeder: number | null): GridRow['layers'] => ({
    substation: { spareKw: sub, acceptedKw: 91_608, limitKw: 100_000 },
    transformer: { spareKw: tr, acceptedKw: 40_274, limitKw: 50_000 },
    feeder: { spareKw: feeder, acceptedKw: 8_403, limitKw: 12_000 },
  });
  const row = (spare: number | null, l = layers(8_392, 9_726, 3_597)): GridRow => ({ substation: '북충주', transformer: '3', feeder: '영덕', spareKw: spare, layers: l });
  const view = (r: GridRow, basis: GridView['basis'] = { kind: 'own' }, region: string | null = null): GridView => ({ rows: [r], best: 0, basis, capacityKw: null, region });
  const site: SiteFacts = { zoning: ['일반공업지역'], landCategory: '공장용지', landAreaM2: 15_446, buildingAreaM2: 3_521.72, buildingUse: '공장', approvedOn: '20240315' };
  it('표 일곱 칸 — 모르는 칸은 「-」 · 한전선로는 두 줄', () => {
    expect(siteRows('충북 충주시 산척면 동충주산단4길 17', site, view(row(3_597)), 500)).toEqual([
      '충북 충주시 산척면 동충주산단4길 17',
      '일반공업지역',
      '공장용지',
      '15,446 ㎡',
      '3,521.72 ㎡',
      '2024.03.15',
      '북충주 변전소 여유용량\n8.39MW (접속 가능)',
    ]);
    const blank: SiteFacts = { zoning: [], landCategory: null, landAreaM2: null, buildingAreaM2: null, buildingUse: null, approvedOn: null };
    expect(siteRows('주소', blank, null, 500)).toEqual(['주소', '-', '-', '-', '-', '-', '-']);
    expect(dateText('2024')).toBe('2024');
  });
  it('접속 조건 — 여유 0 이면 보강 뒤 · 용량보다 작으면 협의 · 이 번지 기록이 아니거나 지역 사정이 있으면 한전 확인', () => {
    expect(gridCondition(view(row(3_597)), 500)).toBe('접속 가능');
    expect(gridCondition(view(row(300)), 500)).toBe('여유 부족 — 용량 협의');
    expect(gridCondition(view(row(0, layers(0, 9_726, 3_597))), 500)).toBe('한전 보강 후 접속');
    expect(gridCondition(view(row(0, layers(8_392, 9_726, 0))), 500)).toBe('선로 보강 후 접속');
    expect(gridCondition(view(row(3_597), { kind: 'dong', dong: '산척면 영덕리' }), 500)).toBe('접속 선로 한전 확인');
    expect(gridCondition(view(row(3_597), { kind: 'own' }, '호남 접수 제한'), 500)).toBe('계통 제약 지역 — 한전 확인');
    expect(gridCondition(view(row(null)), 500)).toBe('한전 확인 필요');
    expect(gridLines(null, 500)).toBeNull();
  });
  it('한전 표 — 단계마다 접속기준 · 접수 · 여유(MW) · 출처와 어느 번지의 기록인지', () => {
    expect(gridTableRows(view(row(3_597)))).toEqual([
      ['변전소', '북충주', '100', '91.61', '8.39'],
      ['주변압기', '#3', '50', '40.27', '9.73'],
      ['배전선로', '영덕', '12', '8.4', '3.6'],
    ]);
    expect(gridNotes(view(row(3_597), { kind: 'dong', dong: '산척면 영덕리' }), '2026-11-09')).toEqual([
      '단위 MW · 한전 배전선로 여유용량 공개 자료(2026-11-09 조회)',
      '산척면 영덕리 선로 1개 중 여유가 가장 큰 선로 — 접속 선로는 한전 확인',
    ]);
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

describe('루모라 제안서 — 바뀌는 쪽의 칸 계획', () => {
  const t = { moduleWatt: 600, price1: 10_000, price5: 9_000, price10: 7_000 };
  const plan = lumoraPlans(lumoraRent(120, t), {
    customer: '(주)가나',
    address: '충청북도 충주시 산척면 동충주산단4길 17',
    panels: 200,
    mount: { style: 'tilted', tiltDeg: 12 },
    shadeDeg: 23,
    gridSpareKw: null,
    grid: null,
    site: { zoning: [], landCategory: null, landAreaM2: null, buildingAreaM2: null, buildingUse: null, approvedOn: null },
    today: '2026-11-08',
    seller: { company: '(주)가나에너지', person: '홍길동', phone: '010-0000-0000' },
    image: async () => ({ bytes: new Uint8Array(), width: 1, height: 1 }),
  }, 600);
  it('바뀌는 쪽은 표지 · 3 · 4 · 7 · 8 · 마지막(23) — 사진 자리는 4쪽(항공사진) · 8쪽(가배치)', () => {
    expect(Object.keys(plan).map(Number)).toEqual([1, 3, 4, 7, 8, 23]);
    expect(plan[4].picture?.withPanels).toBe(false);
    expect(plan[8].picture?.withPanels).toBe(true);
  });
  it('7쪽 연차표 — 세 안 × (20년 + 합계) 칸마다 지우고 다시 쓴다', () => {
    expect(plan[7].overlays.filter((o) => o.name === '연차표 칸')).toHaveLength(63);
    expect(plan[7].masks).toHaveLength(8 + 63);
  });
});

describe('자가소비형 — 루모라 구독형 리스', () => {
  const leaseTerms = { hoursPerDay: 4, degradationPct: 0, subscriptionPrice: 100, tariffIncreasePct: 2, tariffIncreaseHighPct: 4, excessPrice: 50, recPrice: 30, regoPrice: 10, emissionFactor: 0.5 };
  it('구독형 리스 — 자가소비는 발전량 × 1년차 자가소비율 · 절감 = 한전요금 − 구독료 + 초과 판매', () => {
    const l = lumoraLease(100, leaseTerms, { selfKwh: 73_000, tariff: 200, usageKwh: 730_000 });
    expect(l.selfPct).toBeCloseTo(50);
    expect(l.years[0]).toEqual({ gen: 146_000, self: 73_000, excess: 73_000, bill: 14_600_000, fee: 14_600_000, sale: 3_650_000, saving: 3_650_000, rego: 1_460_000, rec: 4_380_000 });
    expect(l.re100Pct).toBeCloseTo(20);
    expect(l.carbonT).toBeCloseTo(73);
    expect(l.carbonT20).toBeCloseTo(73 * 20);
  });
  it('구독형 리스 — 요금 시나리오 셋(동결 · 기본 · 인상 확대)은 인상률만 바꾼다', () => {
    const l = lumoraLease(100, leaseTerms, { selfKwh: 73_000, tariff: 200, usageKwh: 730_000 });
    expect(l.scenarios.freeze.total).toBeCloseTo(3_650_000 * 20);
    expect(l.scenarios.base.pct).toBe(2);
    expect(l.scenarios.base.total).toBeCloseTo(l.total.saving);
    expect(l.scenarios.high.savings[1]).toBeCloseTo(14_600_000 * 1.04 - 14_600_000 + 3_650_000);
  });
  it('구독형 리스 — 자가소비량이 발전량보다 많으면 자가소비율 100%', () => {
    const l = lumoraLease(100, leaseTerms, { selfKwh: 1e9, tariff: 200, usageKwh: 0 });
    expect(l.selfPct).toBe(100);
    expect(l.total.excess).toBeCloseTo(0);
    expect(l.re100Pct).toBe(0);
  });
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
    expect(missingTerms('henergy-mohaet', {})).toHaveLength(TEMPLATES['henergy-mohaet'].terms.length);
    expect(missingTerms('henergy-mohaet', null)).toContain('5년 선납 임대료(1~5년차)');
  });
  it('모햇 참여지원금은 0 을 받지 않는다 — 틀의 각주 · 비교표가 지원금을 전제로 쓰였다', () => {
    const ok = Object.fromEntries(TEMPLATES['henergy-mohaet'].terms.map((f) => [f.key, f.min]));
    expect(() => cleanTerms('henergy-mohaet', { ...ok, subsidyPerKw: 0 })).toThrow('참여지원금');
  });
  it('에이치에너지는 모햇 하나 — 솔라쉐어 2.0 · 솔라쉐어바로는 걷었다(한백 2026-11-09)', () => {
    expect(PRODUCTS.filter((p) => p.company === '에이치에너지').map((p) => p.label)).toEqual(['모햇']);
    expect(TEMPLATE_KEYS.filter((k) => TEMPLATES[k].company === '에이치에너지')).toEqual(['henergy-mohaet']);
    expect(UPCOMING.some((u) => u.company === '에이치에너지')).toBe(false);
  });
  it('상품마다 틀이 있다', () => {
    for (const p of PRODUCTS) expect(TEMPLATES[p.template].company).toBe(p.company);
  });
  it('못 고르는 칩의 상품은 고르는 상품에 없다 — 이름이 겹치지 않는다', () => {
    for (const u of UPCOMING) expect(PRODUCTS.some((p) => p.company === u.company && p.label === u.label)).toBe(false);
  });
  it('자가소비형 — 템플릿 · 조건은 넣을 수 있고, 고르는 상품에는 아직 없다(파워플래너 견본 받기 전)', () => {
    expect(TEMPLATE_KEYS).toContain('lumora-lease');
    expect(PRODUCTS.some((p) => p.template === 'lumora-lease')).toBe(false);
    expect(UPCOMING.filter((u) => u.why.includes('파워플래너')).map((u) => u.label)).toEqual(['구독형 리스']);
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
  const style = { font: 'F', size: 12, label: 'AA0000', name: '000000', contact: '333333' };
  const width = (p: { runs: { text: string; size?: number }[] }) => p.runs.reduce((s, r) => s + estWidthPt(r.text, r.size ?? 0), 0);
  it('영업사 표지 — 짧으면 한 줄 · 「제안」만 강조색 · 원래 크기', () => {
    const [p, ...rest] = sellerCover({ company: '(주)가나에너지', person: '홍길동', phone: '010-0000-0000' }, style, 390);
    expect(rest).toEqual([]);
    expect(p.runs.map((r) => r.text.trim())).toEqual(['제안', '(주)가나에너지', '홍길동 010-0000-0000']);
    expect(p.runs.map((r) => r.color)).toEqual(['AA0000', '000000', '333333']);
    expect(p.runs.every((r) => r.size === 12)).toBe(true);
  });
  it('영업사 표지 — 길면 두 줄(영업사 / 담당자명 연락처)로 나누고 줄마다 칸 너비 안', () => {
    const long = { company: '(주)가나다라신재생에너지솔루션', person: '홍길동 영업본부 수석부장', phone: '010-1234-5678' };
    const ps = sellerCover(long, style, 390);
    expect(ps).toHaveLength(2);
    expect(ps[1].runs[0].text).toBe('홍길동 영업본부 수석부장 010-1234-5678');
    for (const p of ps) expect(width(p)).toBeLessThanOrEqual(390);
  });
  it('마지막 쪽 — 영업사 · 담당자명 연락처 두 줄, 칸보다 길면 글자를 줄인다', () => {
    const b = sellerBlock({ company: '(주)가나에너지', person: '홍길동', phone: '010-0000-0000' }, { font: 'F', size: 14, contactSize: 11, name: 'FFFFFF', contact: 'CCCCCC' }, 400, 'ctr');
    expect(b.map((x) => x.runs[0].text)).toEqual(['(주)가나에너지', '홍길동 010-0000-0000']);
    expect(b.map((x) => x.runs[0].size)).toEqual([14, 11]);
    const tight = sellerBlock({ company: '(주)가나다라신재생에너지솔루션', person: '홍길동', phone: '010-0000-0000' }, { font: 'F', size: 18, contactSize: 14, name: 'F', contact: 'C' }, 200);
    expect(tight[0].runs[0].size).toBeLessThan(18);
    expect(width(tight[0])).toBeLessThanOrEqual(200);
  });
  it('연락처 — 숫자만 넣어도 하이픈이 저절로(010 은 3-4-4), 11자리만 받는다', () => {
    expect(formatKoreanPhone('01012345678')).toBe('010-1234-5678');
    expect(formatKoreanPhone('0101')).toBe('010-1');
    expect(formatKoreanPhone('010-1234-56789')).toBe('010-1234-5678');
    expect(phoneDigitsOf('010-1234-5678')).toHaveLength(PHONE_DIGITS);
    expect(phoneDigitsOf('010-123-4567')).toHaveLength(10);
    expect(sellerContact({ company: '(주)가', person: ' 홍길동 ', phone: '010-1234-5678' })).toBe('홍길동 010-1234-5678');
    expect(sellerContact({ company: '(주)가', person: '', phone: '010-1234-5678' })).toBe('010-1234-5678');
  });
  it('이 브라우저가 기억한 영업사 — 지금 모양과 옛 모양(연락처 한 칸에 이름 · 번호)을 다 읽는다', () => {
    expect(storedSeller({ company: '(주)가', person: '홍길동', phone: '01012345678' })).toEqual({ company: '(주)가', person: '홍길동', phone: '010-1234-5678' });
    expect(storedSeller({ name: '(주)가', contact: '홍길동 010-1234-5678' })).toEqual({ company: '(주)가', person: '홍길동', phone: '010-1234-5678' });
    expect(storedSeller({ name: '(주)가', contact: '홍길동 과장' })).toEqual({ company: '(주)가', person: '홍길동 과장', phone: '' });
    expect(storedSeller(null)).toEqual({ company: '', person: '', phone: '' });
  });
  it('글 너비 어림 — 한글 0.95em · 숫자 0.66em · 빈칸 0.3em', () => {
    expect(estWidthPt('가나', 10)).toBeCloseTo(19, 6);
    expect(estWidthPt('01 ', 10)).toBeCloseTo(16.2, 6);
    expect(fitSizePt((z) => estWidthPt('가나다라', z), 12, 30)).toBe(8);
  });
  it('채워 넣는 글은 칸의 90% 안 — 짧으면 원래 크기, 길면 줄이되 원래보다 크지 않다', () => {
    expect(fitText('(주)한백시험 충주공장', 32, 595)).toBe(32);
    const long = '(주)한국신재생에너지솔루션 충주 제2공장 물류센터';
    const z = fitText(long, 32, 595);
    expect(z).toBeLessThan(32);
    expect(estWidthPt(long, z)).toBeLessThanOrEqual(595 * 0.9);
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
  it('글 없는 글상자도 덩이 하나는 둔다 — 없으면 파워포인트가 「복구」를 묻는다', () => {
    expect(textBoxXml(4, '빈칸', { x: 0, y: 0, w: 10, h: 10 }, [])).toContain('<a:lstStyle/><a:p/></p:txBody>');
  });
  it('가는 선은 글 몸통 없는 채운 네모 — 테두리 없음', () => {
    const x = rectXml(5, '선', { x: 0, y: 0, w: 100, h: 12_700 }, '919FA7');
    expect(x).toContain('<a:srgbClr val="919FA7"/>');
    expect(x).toContain('<a:ln><a:noFill/></a:ln>');
    expect(x).not.toContain('txBody');
  });
  it('표 — 줄의 칸 수가 열 수와 다르면 던진다(합친 칸은 그만큼 센다)', () => {
    const o = { font: 'F', size: 10, border: { color: '000000', w: 6350 } };
    expect(tableXml(1, 't', { x: 0, y: 0, w: 30, h: 10 }, [10, 10, 10], [10], [[{ text: 'a', span: 2 }, { text: 'b' }]], o)).toContain('hMerge="1"');
    expect(() => tableXml(1, 't', { x: 0, y: 0, w: 30, h: 10 }, [10, 10, 10], [10], [[{ text: 'a' }]], o)).toThrow('칸 수');
  });
});

describe('사업자 기준으로 다시 깔기', () => {
  // 60m × 40m 평지붕(위도 37°) — 미터 고리를 경위도로
  const ORIGIN: LngLat = [127.9, 37.08];
  const toLL = unprojector(ORIGIN);
  const ring = [
    [-30, -20],
    [30, -20],
    [30, 20],
    [-30, 20],
    [-30, -20],
  ].map(([x, y]) => toLL([x, y]));
  const roofs = [{ polygons: [[ring]] }];
  const terms = (tiltDeg: number, shadeAngleDeg: number) => ({ moduleWatt: 600, tiltDeg, shadeAngleDeg });

  // 사업자의 실제 기준 값은 쓰지 않는다(조건과 같이 DB 에만) — 꾸민 각도로 모양만 본다
  it('고도 0 이면 콘솔 기본(동지 10~14시) — 경사각만 바뀐다', () => {
    expect(layoutRuleOf(terms(8, 0))).toEqual({ tiltDeg: 8 });
    expect(layoutRuleOf(terms(18, 21))).toEqual({ tiltDeg: 18, shadeAngleDeg: 21 });
    expect(layoutRuleOf({ ...terms(18, 0), azimuthLimitDeg: 30 })).toEqual({ tiltDeg: 18, azimuthLimitDeg: 30 });
  });
  it('콘솔 기준(12° · 0)이면 부지 검토 지도와 같은 장수 · 음영각은 위도의 동지 10~14시 값', () => {
    const l = proposalLayout(roofs, [], 'tilted', 37.08, terms(12, 0));
    expect(l.count).toBe(layoutRoof([[ring]], 'tilted', 37.08).count);
    expect(l.shadeDeg).toBe(26);
    expect(l.tiltDeg).toBe(12);
  });
  it('기울기가 크고 고도가 낮으면 줄이 벌어져 장수가 준다 — 제안서에는 그 사업자의 각도를 적는다', () => {
    const base = proposalLayout(roofs, [], 'tilted', 37.08, terms(12, 0)).count;
    const steep = proposalLayout(roofs, [], 'tilted', 37.08, terms(18, 21));
    expect(steep.count).toBeLessThan(base);
    expect(steep).toMatchObject({ tiltDeg: 18, shadeDeg: 21 });
    expect(proposalLayout(roofs, [], 'tilted', 37.08, terms(8, 0)).count).toBeGreaterThanOrEqual(base);
  });
  it('지붕면 부착형은 기준을 쓰지 않는다', () => {
    expect(proposalLayout(roofs, [], 'flush', 37.08, terms(18, 21)).count).toBe(layoutRoof([[ring]], 'flush', 37.08).count);
  });
});

describe('파워포인트 장 빼기', () => {
  // 2장을 차례에서 걷은 뒤의 묶음 — 프레젠테이션은 1 · 3장만 가리킨다
  const pkg = () =>
    new Map<string, string[]>([
      ['_rels/.rels', ['ppt/presentation.xml']],
      ['ppt/_rels/presentation.xml.rels', ['ppt/slideMasters/slideMaster1.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide3.xml']],
      ['ppt/slides/_rels/slide1.xml.rels', ['ppt/slideLayouts/slideLayout1.xml', 'ppt/media/a.png', 'ppt/media/shared.png']],
      ['ppt/slides/_rels/slide2.xml.rels', ['ppt/slideLayouts/slideLayout1.xml', 'ppt/media/b.png', 'ppt/media/shared.png', 'ppt/notesSlides/notesSlide2.xml']],
      ['ppt/notesSlides/_rels/notesSlide2.xml.rels', ['ppt/notesMasters/notesMaster1.xml', 'ppt/slides/slide2.xml']],
      ['ppt/slides/_rels/slide3.xml.rels', ['ppt/slideLayouts/slideLayout1.xml']],
    ]);
  it('그 장 · 메모 장 · 둘의 관계 · 그 장만 쓰던 그림을 지운다 — 레이아웃 · 같이 쓰는 그림은 남긴다', () => {
    expect(orphansOf('ppt/slides/slide2.xml', pkg()).sort()).toEqual([
      'ppt/media/b.png',
      'ppt/notesSlides/_rels/notesSlide2.xml.rels',
      'ppt/notesSlides/notesSlide2.xml',
      'ppt/slides/_rels/slide2.xml.rels',
      'ppt/slides/slide2.xml',
    ]);
  });
  it('다른 장이 그 장을 가리키면(하이퍼링크) 아무것도 지우지 않는다', () => {
    const t = pkg();
    t.set('ppt/slides/_rels/slide3.xml.rels', ['ppt/slideLayouts/slideLayout1.xml', 'ppt/slides/slide2.xml']);
    expect(orphansOf('ppt/slides/slide2.xml', t)).toEqual([]);
  });
  it('그림은 내용의 SHA-256 으로 알아본다', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

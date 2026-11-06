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
import { mountText, proposalFileName, sellerBlock, sellerLine, splitAddress } from '@/lib/solar/proposal/fill-common';
import { cleanTerms, missingTerms, PRODUCTS, TEMPLATES, UPCOMING } from '@/lib/solar/proposal/products';
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
  it('틀 받기 전 상품(모햇)은 고르는 상품에 없다 — 이름이 겹치지 않는다', () => {
    for (const u of UPCOMING) expect(PRODUCTS.some((p) => p.company === u.company && p.label === u.label)).toBe(false);
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
  it('영업사 — 표지 한 줄은 「제안」만 강조색, 마지막 쪽은 이름 · 연락처 두 줄', () => {
    const seller = { name: '(주)가나에너지', contact: '홍길동 010-0000-0000' };
    const p = sellerLine(seller, { font: 'F', size: 12, label: 'AA0000', name: '000000', contact: '333333' });
    expect(p.runs.map((r) => r.text.trim())).toEqual(['제안', '(주)가나에너지', '홍길동 010-0000-0000']);
    expect(p.runs.map((r) => r.color)).toEqual(['AA0000', '000000', '333333']);
    const b = sellerBlock(seller, { font: 'F', size: 14, contactSize: 11, name: 'FFFFFF', contact: 'CCCCCC' }, 'ctr');
    expect(b.map((x) => x.runs[0].text)).toEqual(['(주)가나에너지', '홍길동 010-0000-0000']);
    expect(b.every((x) => x.align === 'ctr')).toBe(true);
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

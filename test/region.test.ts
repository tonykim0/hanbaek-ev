/**
 * 현장명 앞의 지역 — ★붙이는 것과 고치는 것은 다른 일이다.★
 *
 * 162건이 되면 「태평아파트」 하나로는 어느 현장인지 모른다(lib/region 머리말). 그런데
 * 붙이기가 접수 화면의 ★권유★였던 탓에, 안 누르고 낸 세 건이 지역 없이 남았다
 * (한백 지적 2026-09-10 「왜 현장명에 도 + 시 안 붙어?」). 이제 서버가 붙인다.
 *
 * 같이 드러난 것이 아래 「틀린 시·도」다 — 덧대기로는 오타가 안 고쳐진다.
 */
import { describe, expect, it } from 'vitest';
import { regionPartsOf, withRegionPrefix } from '@/lib/region';

describe('주소에서 지역 뽑기', () => {
  it('시·도는 줄이고 시 하나만 딴다 — 시 안의 구는 버린다', () => {
    expect(regionPartsOf('경상북도 포항시 북구 우미길 90')).toEqual(['경북', '포항']);
    expect(regionPartsOf('전북특별자치도 전주시 덕진구 천마산로 113')).toEqual(['전북', '전주']);
  });

  it('광역시는 그 아래 구가 도시 자리다', () => {
    expect(regionPartsOf('인천광역시 계양구 오조산로62번길 10')).toEqual(['인천', '계양']);
    expect(regionPartsOf('대구광역시 수성구 동원로 100(만촌동)')).toEqual(['대구', '수성']);
  });

  it('군도 도시로 딴다', () => {
    expect(regionPartsOf('경상북도 의성군 의성읍 의성사곡로 10')).toEqual(['경북', '의성']);
  });

  it('우편번호가 앞에 붙어도 지나친다', () => {
    expect(regionPartsOf('(37675) 경상북도 포항시 남구 대잠동 1')).toEqual(['경북', '포항']);
  });

  it('★통합 시·도는 옛 경계로 되돌린다★ — 구면 광주, 아니면 전남 (한백 결정 2026-09-10)', () => {
    expect(regionPartsOf('전남광주통합특별시 광양시 광양읍 예구1길 8')).toEqual(['전남', '광양']);
    expect(regionPartsOf('전남광주통합특별시 광산구 월계로 109')).toEqual(['광주', '광산']);
    // 한 글자로 줄면 구를 안 뗀다 — 「광주 북」은 지명으로 안 읽힌다
    expect(regionPartsOf('전남광주통합특별시 북구 전남대로 1')).toEqual(['광주', '북구']);
    expect(regionPartsOf('전남광주통합특별시 무안군 삼향읍 남악5로72번길 7')).toEqual(['전남', '무안']);
  });

  it('주소가 없으면 뽑을 것이 없다 — 빈 배열이지 빈 문자열이 아니다', () => {
    expect(regionPartsOf(null)).toEqual([]);
    expect(regionPartsOf('  ')).toEqual([]);
  });
});

describe('현장명에 붙이기', () => {
  it('지역이 없는 이름 앞에 시·도와 시를 붙인다 (한백 지적 2026-09-10 의 세 건)', () => {
    expect(withRegionPrefix('해원하나로타운2차', '경상북도 포항시 북구 우미길 90'))
      .toBe('경북 포항 해원하나로타운2차');
    expect(withRegionPrefix('은행마을태산아파트', '인천광역시 계양구 오조산로62번길 10'))
      .toBe('인천 계양 은행마을태산아파트');
    expect(withRegionPrefix('송천한라비발디1단지입주자대표회의', '전북특별자치도 전주시 덕진구 천마산로 113'))
      .toBe('전북 전주 송천한라비발디1단지입주자대표회의');
  });

  it('★두 번 붙지 않는다★ — 판독이 채운 이름이 서버를 한 번 더 지난다', () => {
    const once = withRegionPrefix('해원하나로타운2차', '경상북도 포항시 북구 우미길 90');
    expect(withRegionPrefix(once, '경상북도 포항시 북구 우미길 90')).toBe(once);
  });

  it('시만 들어 있으면 시·도만 앞에 붙인다', () => {
    expect(withRegionPrefix('포항 해원하나로타운2차', '경상북도 포항시 북구 우미길 90'))
      .toBe('경북 포항 해원하나로타운2차');
  });

  it('시·도만 들어 있으면 손대지 않는다 — 중간에 끼우면 말 순서가 꼬인다', () => {
    expect(withRegionPrefix('전북 태평아파트', '전북특별자치도 전주시 완산구 태평2길 22'))
      .toBe('전북 태평아파트');
  });

  it('★틀린 시·도가 적혀 있으면 덧대지 않는다★ — 그건 붙이기가 아니라 오타다 (HB-2026-072)', () => {
    // 주소는 충청남도 천안시인데 이름은 「충북」이다. 덧대면 「충남 충북 천안 청솔아파트」가 된다.
    expect(withRegionPrefix('충북 천안 청솔아파트', '충청남도 천안시 서북구 직산읍 부송로 355'))
      .toBe('충북 천안 청솔아파트');
  });

  it('주소에서 지역을 못 뽑으면 이름을 그대로 둔다', () => {
    expect(withRegionPrefix('청솔아파트', null)).toBe('청솔아파트');
    expect(withRegionPrefix('청솔아파트', '부송로 355')).toBe('청솔아파트');
  });

  it('통합 시·도의 현장에도 옛 이름으로 붙는다 (HB-2026-151·154)', () => {
    expect(withRegionPrefix('영신그린빌아파트', '전남광주통합특별시 광양시 광양읍 예구1길 8'))
      .toBe('전남 광양 영신그린빌아파트');
    expect(withRegionPrefix('첨단라인2차 입주자대표회의', '전남광주통합특별시 광산구 월계로 109'))
      .toBe('광주 광산 첨단라인2차 입주자대표회의');
  });

  it('시·도로 시작하지 않는 이름의 「광주」는 시·도가 아니다 — 경기 광주는 붙는다', () => {
    expect(withRegionPrefix('광주역푸르지오', '경기도 광주시 역동 1'))
      .toBe('경기 광주역푸르지오');
  });
});

/**
 * 계약서 작성의 모집 담당자 — 소속마다 고를 수 있는 사람 (한백 지시 2026-10-23).
 * 에코일렉은 플러그링크 계약서에서 한비 김종혁(기본) 또는 에코일렉 이용진을 고른다. 다른 소속·운영사는 기본값 그대로다.
 */
import { describe, expect, it } from 'vitest';
import { SALES_DEFAULT, salesChoicesFor } from '@/lib/contract-form';

describe('salesChoicesFor — 고를 수 있는 모집 담당자', () => {
  it('에코일렉 · 플러그링크는 둘 — 첫째가 기본값(한비 김종혁)이다', () => {
    const choices = salesChoicesFor('pluglink', '에코일렉');
    expect(choices).toEqual([
      { company: '한비', name: '김종혁', tel: '010-3627-7047' },
      { company: '에코일렉', name: '이용진', tel: '010-9902-8746' },
    ]);
    expect(choices[0]).toEqual(SALES_DEFAULT.pluglink);
  });

  it('다른 소속·다른 운영사·소속 없음은 고를 것이 없다 — 기본값 그대로', () => {
    expect(salesChoicesFor('pluglink', '대상')).toEqual([]);
    expect(salesChoicesFor('pluglink', null)).toEqual([]);
    expect(salesChoicesFor('hec', '에코일렉')).toEqual([]);
    expect(salesChoicesFor('sk', '에코일렉')).toEqual([]);
  });
});

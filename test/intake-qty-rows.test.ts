/**
 * 판독이 읽은 대수가 갈 칸 — ★한백 지적 2026-09-22★.
 *
 * 「계약서에 다 나와있는데 왜 계약서류 접수단계에서 이걸 그냥 내보낸거야?」
 * (HB-2026-184 서울 강북 번동금호어울림A — 계약서에 「설치수량 5기 · 계약기간 7년」이
 *  찍혀 있는데 계약대수 0 대로 들어왔다.)
 *
 * 접수 화면의 자동채움이 「자체투자면 교체유형이 둘이라 모른다」로 뭉뚱그리고, 칸 이름도
 * 「환경부 신규」로 박아 두고 있었다. 둘 다 틀렸다:
 *   · 플러그링크·나이스·현대엔지니어링은 자체투자를 안 가른다 — 칸이 하나뿐인데 비웠다
 *   · 기설치 연동은 칸이 하나인데 없는 칸 이름에 적어 그대로 사라졌다
 * 어느 쪽이든 조용히 0 대가 됐다. 칸 목록은 화면이 쓰는 것과 ★같은 답★이어야 한다.
 */
import { describe, expect, it } from 'vitest';
import type { CpoName } from '@/types/project';
/* 화면(components/IntakeForm)이 부르는 바로 그 함수다 — 예전에는 여기 옮겨 적어 두어 둘이 갈릴 수 있었다 */
import { carryQty, cellsOf, linesOf, replRowsOf } from '@/lib/intake-qty';

describe('대수가 들어갈 칸', () => {
  it('★안 가르는 운영사의 자체투자는 칸이 하나다★ — 그 현장이 0 대로 들어온 까닭', () => {
    for (const cpo of ['플러그링크', '나이스인프라', '현대엔지니어링'] as CpoName[]) {
      expect(replRowsOf('자체투자', cpo), cpo).toEqual(['자체투자 (제자리교체)']);
    }
  });

  it('가르는 운영사만 둘이다 — 그때는 사람이 나눠 적어야 한다', () => {
    for (const cpo of ['에버온', 'SK일렉링크'] as CpoName[]) {
      expect(replRowsOf('자체투자', cpo), cpo).toHaveLength(2);
    }
  });

  it('★기설치 연동의 칸 이름은 「환경부 신규」가 아니다★ — 없는 칸에 적으면 사라진다', () => {
    expect(replRowsOf('기설치 연동', '플러그링크')).toEqual(['기설치 연동']);
  });

  it('환경부는 환경부 신규 하나다', () => {
    expect(replRowsOf('환경부', '플러그링크')).toEqual(['환경부 신규']);
  });

  it('사업구분을 아직 모르면 환경부로 연다 — 접수의 기본값이다', () => {
    expect(replRowsOf(null, '플러그링크')).toEqual(['환경부 신규']);
  });
});

/**
 * ★수전방식·사업구분·운영사를 바꿔도 적은 대수가 남는다★ — 한백 지적 2026-10-29 「전력인입을 바꾸면 입력된 계약대수가
 * 사라지는 오류」. 대수가 「교체유형|수전방식」 칸 이름에 붙어 있어서, 수전방식을 바꾸면 값은 옛 이름에 남고 새 칸이
 * 비었다. 판독이 대수만 읽고 수전방식을 못 읽은 접수에서 사람이 수전방식을 고르는 순간이 그것이다.
 */
describe('칸이 바뀌어도 대수가 따라간다', () => {
  const PL = '플러그링크' as CpoName;
  const SK = 'SK일렉링크' as CpoName;
  /** 그 축으로 적은 대수를 다른 축으로 옮겨 라인을 본다 — 화면이 하는 그대로 */
  const after = (qty: Record<string, number>, to: Parameters<typeof cellsOf>) => {
    const { qty: carried, unplaced } = carryQty(qty, cellsOf(...to));
    return { lines: linesOf(carried, to[0], to[1], to[2], 10).map((l) => [l.replType, l.powerType, l.qty]), unplaced };
  };

  it('★수전방식을 고르면(미지정 → 한전불입) 판독이 넣은 대수가 그 칸으로 간다★ — 사라지던 바로 그 자리', () => {
    // 고치기 전의 화면: 칸 이름으로만 찾아서 0 대였다
    expect(linesOf({ '환경부 신규|': 7 }, '환경부', PL, '한전불입', 10)).toEqual([]);
    expect(after({ '환경부 신규|': 7 }, ['환경부', PL, '한전불입']))
      .toEqual({ lines: [['환경부 신규', '한전불입', 7]], unplaced: 0 });
  });

  it('한전불입 ↔ 모자분리', () => {
    expect(after({ '환경부 신규|한전불입': 7 }, ['환경부', PL, '모자분리']))
      .toEqual({ lines: [['환경부 신규', '모자분리', 7]], unplaced: 0 });
  });

  it('겸용으로 바꾸면 적은 칸에 남는다 — 나머지 칸은 사람이 나눠 적는다', () => {
    expect(after({ '환경부 신규|한전불입': 7 }, ['환경부', PL, '한전불입+모자분리']))
      .toEqual({ lines: [['환경부 신규', '한전불입', 7]], unplaced: 0 });
  });

  it('겸용 3·4기를 하나로 바꾸면 7기 — 계약서의 총 대수 그대로', () => {
    expect(after({ '환경부 신규|한전불입': 3, '환경부 신규|모자분리': 4 }, ['환경부', PL, '모자분리']))
      .toEqual({ lines: [['환경부 신규', '모자분리', 7]], unplaced: 0 });
  });

  it('★갈 곳이 여럿이면 옮기지 않고 센다★ — 미지정 7기를 겸용으로: 한전불입·모자분리 어디에 몇 기인지 모른다', () => {
    expect(after({ '환경부 신규|': 7 }, ['환경부', PL, '한전불입+모자분리'])).toEqual({ lines: [], unplaced: 7 });
  });

  it('사업구분을 바꿔도 — 안 가르는 운영사의 자체투자는 칸이 하나라 그리로', () => {
    expect(after({ '환경부 신규|한전불입': 7 }, ['자체투자', PL, '한전불입']))
      .toEqual({ lines: [['자체투자 (제자리교체)', '한전불입', 7]], unplaced: 0 });
  });

  it('가르는 운영사(SK) 자체투자 2·5기를 환경부로 — 7기', () => {
    expect(after({ '자체투자 (제자리교체)|한전불입': 2, '자체투자 (신규위치)|한전불입': 5 }, ['환경부', SK, '한전불입']))
      .toEqual({ lines: [['환경부 신규', '한전불입', 7]], unplaced: 0 });
  });

  it('환경부 7기를 가르는 운영사의 자체투자로 — 제자리교체·신규위치 어디인지 몰라 센다', () => {
    expect(after({ '환경부 신규|한전불입': 7 }, ['자체투자', SK, '한전불입'])).toEqual({ lines: [], unplaced: 7 });
  });

  it('0·빈 값은 옮길 것이 없다', () => {
    expect(carryQty({ '환경부 신규|한전불입': 0 }, cellsOf('환경부', PL, '모자분리'))).toEqual({ qty: {}, rest: {}, unplaced: 0 });
  });

  it('못 옮긴 것은 옛 칸 이름 그대로 남아 다음에 축을 바꾸면 또 옮겨 본다 — 겸용으로 갔다 한전불입으로 오면 7기', () => {
    const mixed = carryQty({ '환경부 신규|': 7 }, cellsOf('환경부', PL, '한전불입+모자분리'));
    expect(mixed.rest).toEqual({ '환경부 신규|': 7 });
    // 화면이 축을 바꿀 때 굳히는 상태 = 옮긴 것 + 못 옮긴 것
    const settled = { ...mixed.qty, ...mixed.rest };
    expect(carryQty(settled, cellsOf('환경부', PL, '한전불입')).qty).toEqual({ '환경부 신규|한전불입': 7 });
  });

  it('보이던 칸에서 옮긴다 — 미지정 7기가 모자분리에 보이다가 겸용으로 가면 모자분리 칸에 남는다', () => {
    const shown = carryQty({ '환경부 신규|': 7 }, cellsOf('환경부', PL, '모자분리'));
    const settled = { ...shown.qty, ...shown.rest };
    expect(carryQty(settled, cellsOf('환경부', PL, '한전불입+모자분리')).qty).toEqual({ '환경부 신규|모자분리': 7 });
  });
});

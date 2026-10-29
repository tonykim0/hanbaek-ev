/**
 * 접수 화면의 대수 칸 — 줄은 교체유형, 열은 수전방식 (components/IntakeForm). [순수]
 *
 * 단가 케이스가 교체유형·수전방식별로 갈리므로(lib/pricing-match) 대수도 그 칸마다 받는다. 칸 하나가 계약 라인 하나다.
 * 화면은 클라이언트 부품이라 시험이 못 부른다 — 그래서 규칙을 여기 두고 화면과 시험이 같은 함수를 본다(예전에는 시험이
 * 화면의 replRowsOf 를 옮겨 적어 두고 있었다).
 */
import { SPLITS_SELF_REPL } from '@/types/project';
import type { BizType, CpoName, PowerType, ReplType } from '@/types/project';

/** 라인의 수전방식 — 겸용(한전불입+모자분리)은 현장의 값이고 라인은 둘 중 하나다 */
export type LinePower = Exclude<PowerType, '한전불입+모자분리'>;

/** 자체투자 현장에서 갈리는 교체유형 두 가지 */
const SELF_REPLS = ['자체투자 (제자리교체)', '자체투자 (신규위치)'] as const satisfies readonly ReplType[];

/**
 * 대수 칸의 줄 — 이 사업구분·운영사에서 고를 수 있는 교체유형.
 *
 * ★자동채움과 화면이 같은 답을 봐야 한다★ — 갈라져 있던 탓에 판독이 읽은 대수가 갈 곳을
 * 잃었다(한백 지적 2026-09-22 「계약서에 다 나와있는데 왜 그냥 내보낸거야」).
 * 자동채움은 「자체투자면 모른다」로 뭉뚱그리고 칸 이름도 「환경부 신규」로 박아 두었는데,
 *   · 플러그링크·나이스·현대엔지니어링은 자체투자를 안 가른다 — 칸이 하나뿐인데 비웠다
 *   · 기설치 연동은 칸이 하나인데 「환경부 신규」라는 없는 칸에 적어 그대로 사라졌다
 * 둘 다 조용히 0 대가 됐다.
 *
 * ★교체유형을 가르는 운영사만 두 줄이다★ (2026-08-26) — 에버온(140/150/160 대 170/180/190만)·SK일렉링크(위치변경
 * 190~210만)는 제자리교체와 신규위치의 단가가 실제로 다르다. 나머지는 같은 금액이라 케이스도 한 칸으로 합쳤다.
 * 안 가르는 운영사에 두 줄을 펴 두었더니 한 현장의 11기가 「10대 + 1대」 두 라인으로 갈렸다(강원 강릉 일송아파트).
 */
export function replRowsOf(bizType: BizType | null, cpo: CpoName): ReplType[] {
  if (bizType === '자체투자') return SPLITS_SELF_REPL.has(cpo) ? [...SELF_REPLS] : [SELF_REPLS[0]];
  if (bizType === '기설치 연동') return ['기설치 연동'];
  return ['환경부 신규'];
}

/** 대수 칸의 열 — 수전방식이 정한다. 겸용이면 둘, 아직 안 골랐으면 이름 없는 하나 */
export function powerColsOf(powerType: PowerType | null): Array<LinePower | null> {
  return powerType === '한전불입+모자분리' ? ['한전불입', '모자분리'] : [powerType ?? null];
}

export const cellKey = (r: ReplType, p: string | null) => `${r}|${p ?? ''}`;

const partsOf = (k: string) => {
  const at = k.indexOf('|');
  return { row: k.slice(0, at), col: k.slice(at + 1) };
};

/** 지금 칸들 — 줄 순서대로, 줄 안에서는 열 순서대로 */
export function cellsOf(bizType: BizType | null, cpo: CpoName, powerType: PowerType | null): string[] {
  return replRowsOf(bizType, cpo).flatMap((r) => powerColsOf(powerType).map((p) => cellKey(r, p)));
}

/**
 * 적어 둔 대수를 지금 칸으로 옮긴다 — ★수전방식·사업구분·운영사를 바꿔도 적은 대수가 사라지지 않게★
 * (한백 지적 2026-10-29 「전력인입을 바꾸면 입력된 계약대수가 사라지는 오류」).
 *
 * 대수는 칸 이름(「교체유형|수전방식」)에 붙어 있다. 수전방식을 바꾸면 칸 이름이 바뀌어, 적은 값은 옛 이름에 남고 새 칸은
 * 비었다 — 판독이 대수만 읽고 수전방식을 못 읽은 접수에서 사람이 수전방식을 고르는 순간 대수가 사라졌다.
 *
 * ★갈 곳이 하나로 정해질 때만 옮긴다★ — 같은 이름의 칸 → 지금 칸이 하나뿐이면 그 칸 → 같은 열(수전방식)이 하나 → 같은
 * 줄(교체유형)이 하나. 겸용 3·4기를 한전불입 하나로 바꾸면 7기가 된다(계약서의 총 대수 그대로). 그래도 갈 곳이 여럿이면
 * 옮기지 않고 rest 에 옛 칸 이름 그대로 남긴다 — 판독이 읽은 총 대수를 칸 여럿 중 하나에 몰아넣지 않는 것과 같은 까닭이다
 * (어느 칸에 몇 기인지 모르는 채 접수되면 단가가 틀어진다). 화면이 그 합(unplaced)을 대수 칸에 말하고, 축을 다시 바꾸면
 * rest 가 또 옮겨 본다.
 */
export function carryQty(
  qty: Record<string, number>,
  cells: string[]
): { qty: Record<string, number>; rest: Record<string, number>; unplaced: number } {
  const out: Record<string, number> = {};
  const rest: Record<string, number> = {};
  let unplaced = 0;
  for (const [k, n] of Object.entries(qty)) {
    if (!(n > 0)) continue;
    let to: string | undefined;
    if (cells.includes(k)) to = k;
    else if (cells.length === 1) to = cells[0];
    else {
      const { row, col } = partsOf(k);
      const sameCol = cells.filter((c) => partsOf(c).col === col);
      const sameRow = cells.filter((c) => partsOf(c).row === row);
      to = sameCol.length === 1 ? sameCol[0] : sameRow.length === 1 ? sameRow[0] : undefined;
    }
    if (to) out[to] = (out[to] ?? 0) + n;
    else {
      rest[k] = n;
      unplaced += n;
    }
  }
  return { qty: out, rest, unplaced };
}

export interface QtyLine { termYears: number; qty: number; powerType: LinePower | null; replType: ReplType; memo: null }

/** 대수가 들어간 칸만 계약 라인이 된다 — 칸 순서대로 */
export function linesOf(
  qty: Record<string, number>,
  bizType: BizType | null,
  cpo: CpoName,
  powerType: PowerType | null,
  termYears: number
): QtyLine[] {
  return replRowsOf(bizType, cpo).flatMap((r) =>
    powerColsOf(powerType)
      .map((p) => ({ r, p, n: qty[cellKey(r, p)] ?? 0 }))
      .filter((c) => c.n > 0)
      .map((c) => ({ termYears, qty: c.n, powerType: c.p, replType: c.r, memo: null }))
  );
}

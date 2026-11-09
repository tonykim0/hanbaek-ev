/**
 * 에이치에너지 모햇 제안서 — 「03. 모햇 제안서_SAMPLE」(22장 · 「HENERGY 사업제안서」 · 공유옥상 임대사업)에 현장 칸을 채운다. [브라우저]
 * (한백 2026-11-09 「에이치에너지에서 솔라쉐어는 우리가 안할거고 모햇만 할 예정」 · 「템플릿 이거에 맞춰줘」 — 그전의 솔라쉐어 2.0 생성기는 걷었다)
 *
 * 견본에서 바뀌는 자리는 여섯 장이다(나머지는 회사 · 상품 · FAQ 의 고정 글):
 *   표지          「[(주)고객사명] ([현장 주소])」 → 고객명 (주소) · 그 밑에 제안하는 영업사 한 줄
 *   공유옥상 구조  그림 속 「연 4만원/KW 임차료」 → 조건의 임대료
 *   부지 검토     왼쪽 표(현장주소 · 용도지역 · 지목 · 대지면적 · 건축면적 · 사용승인 · 한전선로)는 부지 검토가 받은 공적 자료(Report.site · grid),
 *                오른쪽 「한전ON 배전선로 여유용량 조회 화면」 자리는 같은 한전 공개 자료(변전소 · 주변압기 · 배전선로의 접속기준 · 접수 · 여유)의 표
 *   배치계획      표(모듈 · 건물용도 · 용량 · 모듈각도)와 오른쪽 「가배치 도면」 자리에 그 현장의 가배치 그림
 *   임대료        두 연차표(1년 선납 · 5년 선납) · 머리말 한 줄(앞은 검정 · 숫자 쪽은 빨강 — 틀의 가름 그대로) · 참여지원금 각주
 *   비교          1년 선납 vs 5년 선납 표 — 견본의 「137.15kW 예시」는 「○kW 기준」으로
 *   마지막 장     「Have your ENERGY & Share it」 밑에 영업사 두 줄
 * 칸은 표를 다시 그리지 않고 견본 표의 글만 바꾼다(칸 색 · 테두리 · 줄 높이가 틀 그대로 — lib/pptx/deck setCell · setRuns).
 * 장은 차례가 아니라 그 장에만 있는 칸 이름으로 찾고(deck.slideWith), 표의 머리 글이 견본과 다르면 멈춘다 — 사업자가 틀을 바꾸면
 * 「템플릿이 바뀌었습니다」로 서고 여기 자리를 고친다.
 * 견본의 빨강 글자 둘을 가른다: 「FF0000」(채울 자리 표시 — 한전선로 칸 · 두 그림 자리)은 채우면서 검정으로, 「C00000」(강조 — 용량 · 임대수익)은 그대로.
 */
import { Deck, type Slide } from '@/lib/pptx/deck';
import { EMU_PER_PT, pictureXml, tableXml, textBoxXml, type Cell } from '@/lib/pptx/xml';
import type { GridLayerKey, GridView, SiteFacts } from '@/lib/solar/types';
import { capacityKw, kwText, MOHAET_YEARS, mohaet, roughWonText, wonText, type Mohaet } from './calc';
import { fitText, sellerBlock, sellerCover, type FillArgs, type ProposalInput } from './fill-common';
import type { Terms } from './products';

const PT = EMU_PER_PT;
/** 틀의 글꼴(테마 Arial — 한글은 받는 컴퓨터의 고딕으로) · 표 머리 남색 · 칸 테두리 하늘 · 본문 회색 */
const FONT = 'Arial';
const C = { navy: '2F5496', line: 'DDEAF6', head: 'DDEAF6', text: '000000', note: '404040', red: 'C00000', coverBlue: '5B9BF5', soft: 'D9D9D9' };

/** 장마다 그 장에만 있는 칸(2026-11-09 견본 — 구글 프레젠테이션에서 내보낸 이름) */
const SLIDE = {
  cover: 'Google Shape;95;p13',
  structure: 'Google Shape;460;p24',
  site: 'Google Shape;494;p25',
  layout: 'Google Shape;506;p26',
  rent: 'Google Shape;522;p27',
  compare: 'note-902',
} as const;
const GRID_SLOT = 'placeholder-grid';
const DRAWING_SLOT = 'Google Shape;508;p26';
const RENT = { one: 'Google Shape;519;p27', five: 'Google Shape;521;p27', head: 'Google Shape;522;p27', note: 'note-subsidy' } as const;
const COMPARE = { title: 'Google Shape;607;p32', table: 'Google Shape;606;p32' } as const;

export async function fillHenergy({ template, terms, input }: FillArgs): Promise<Blob | Uint8Array> {
  const deck = await Deck.open(template);
  const kw = capacityKw(input.panels, terms.moduleWatt);
  const r = mohaet(kw, terms);
  await fillCover(deck, input);
  fillStructure(await deck.slideWith(SLIDE.structure), terms);
  fillSite(await deck.slideWith(SLIDE.site), input, kw);
  await fillLayout(await deck.slideWith(SLIDE.layout), input, terms, kw);
  fillRent(await deck.slideWith(SLIDE.rent), r, terms);
  fillCompare(await deck.slideWith(SLIDE.compare), r, terms);
  // 마지막 장 — 「Have your ENERGY & Share it」 밑 두 줄. 오른쪽 도시 사진의 비스듬한 가(이 높이에서 약 600pt)에 닿지 않게 가운데 320pt
  const end = await deck.slide(deck.slides.length);
  end.append(
    textBoxXml(end.nextId(), '영업사 연락처', { x: 320 * PT, y: 322 * PT, w: 320 * PT, h: 52 * PT }, sellerBlock(input.seller, { font: FONT, size: 16, contactSize: 13, name: 'FFFFFF', contact: C.soft }, 320, 'ctr'), {
      anchor: 't',
    }),
  );
  return deck.save();
}

/** 틀의 칸이 견본의 그 칸인지 — 머리 글에 그 말이 없으면 멈춘다(엉뚱한 칸을 채우지 않게) */
function mustSay(s: Slide, name: string, cell: { row: number; col: number }, word: string): void {
  if (!s.textOf(name, cell).includes(word)) throw new Error(`템플릿이 바뀌었습니다 — ${s.label}의 표 ${cell.row}행 ${cell.col}열이 「${word}」 칸이 아닙니다.`);
}

/** 표 칸에 글을 넣되 칸 너비에 들게 — 칸의 좌우 여백(견본 8.2pt)을 빼고, 틀의 크기에서 줄인다(min 까지) */
function fitCell(s: Slide, name: string, row: number, col: number, text: string, size: number, opts: { color?: string; min?: number } = {}): void {
  const width = s.columnWidthPt(name, col) - 16.4;
  const longest = text.split('\n').reduce((a, b) => (b.length > a.length ? b : a), '');
  const z = fitText(longest, size, width, opts.min ?? 11);
  s.setCell(name, row, col, text, { ...(z < size ? { size: z } : {}), ...(opts.color ? { color: opts.color } : {}) });
}

/* ------------------------------------------------------------------ 표지 */

async function fillCover(deck: Deck, input: ProposalInput): Promise<void> {
  const s = await deck.slideWith(SLIDE.cover);
  // 오른쪽 도시 사진(약 640pt 부터)에 닿지 않게 — 한 줄로 두고 길면 글자를 줄인다
  const line = `${input.customer} (${input.address})`;
  const size = s.fontSizeOf(SLIDE.cover) ?? 28;
  const z = fitText(line, size, 640, 14);
  s.setText(SLIDE.cover, line, z < size ? { size: z } : {});
  const seller = sellerCover(input.seller, { font: FONT, size: 14, label: C.coverBlue, name: 'FFFFFF', contact: C.soft }, 560);
  s.append(textBoxXml(s.nextId(), '영업사', { x: 40.3 * PT, y: 350 * PT, w: 560 * PT, h: (seller.length > 1 ? 40 : 22) * PT }, seller, { anchor: 't', wrap: false }));
}

/* ------------------------------------------------------------ 공유옥상 구조 */

/** 그림 속 「연 4만원/KW 임차료」 — 숫자만 조건의 임대료로(「4만원」 · 「3.5만원」) */
function fillStructure(s: Slide, terms: Terms): void {
  const cur = s.textOf(SLIDE.structure);
  const next = cur.replace(/연\s*[\d.,]+\s*만원/, `연 ${manText(terms.rentPerKw)}`);
  if (next !== cur) s.setText(SLIDE.structure, next);
}

/** 「4만원」 · 「3.5만원」 · 「45,000원」(만원으로 안 떨어지면 원) */
export const manText = (won: number): string => (won % 1000 === 0 ? `${(won / 10_000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만원` : `${wonText(won)}원`);

/* --------------------------------------------------------------- 부지 검토 */

/** 부지 검토 표의 값 칸(2열) 일곱 — 모르는 칸은 「-」 */
export function siteRows(address: string, site: SiteFacts, grid: GridView | null, kw: number): string[] {
  const g = gridLines(grid, kw);
  return [
    address,
    site.zoning.length ? site.zoning.join(' · ') : '-',
    site.landCategory ?? '-',
    site.landAreaM2 ? `${areaText(site.landAreaM2)} ㎡` : '-',
    site.buildingAreaM2 ? `${areaText(site.buildingAreaM2)} ㎡` : '-',
    dateText(site.approvedOn),
    g ? g.join('\n') : '-',
  ];
}

export const areaText = (m2: number): string => m2.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

/** 「20240315」 → 「2024.03.15」 · 연도만이면 그대로 · 없으면 「-」 */
export function dateText(yyyymmdd: string | null): string {
  const m = yyyymmdd?.match(/^(\d{4})(\d{2})?(\d{2})?$/);
  if (!m) return '-';
  return [m[1], m[2], m[3]].filter(Boolean).join('.');
}

/** 「8.39MW」 — kW 를 MW 소수 둘째까지 */
export const mwText = (kw: number): string => `${(kw / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}MW`;

const bestOf = (grid: GridView | null) => (grid && grid.best !== null ? (grid.rows[grid.best] ?? null) : null);

/**
 * 한전선로 칸 두 줄 — 「북충주 변전소 여유용량」 / 「8.39MW (접속 선로 한전 확인)」. 괄호는 이 용량(kw)이 붙을 수 있는가의 한 마디다:
 * 셋(변전소 · 주변압기 · 배전선로) 중 가장 작은 여유가 0 이면 보강 뒤, 용량보다 작으면 여유 부족, 지역 계통 사정이 있거나 이 번지의
 * 기록이 아니면(옆 번지 · 같은 동) 한전 확인, 그 밖에는 접속 가능. 판정의 말(lib/solar/rules judgeGrid)을 제안서의 짧은 말로 옮겼다.
 */
export function gridLines(grid: GridView | null, kw: number): [string, string] | null {
  const row = bestOf(grid);
  if (!grid || !row) return null;
  const sub = row.layers.substation.spareKw;
  return [`${row.substation} 변전소 여유용량`, `${sub === null ? '-' : mwText(sub)} (${gridCondition(grid, kw)})`];
}

export function gridCondition(grid: GridView, kw: number): string {
  const row = bestOf(grid)!;
  const spare = row.spareKw;
  if (spare === null) return '한전 확인 필요';
  if (spare <= 0) return row.layers.substation.spareKw! <= 0 || row.layers.transformer.spareKw! <= 0 ? '한전 보강 후 접속' : '선로 보강 후 접속';
  if (spare < kw) return '여유 부족 — 용량 협의';
  if (grid.region) return '계통 제약 지역 — 한전 확인';
  if (grid.basis.kind !== 'own') return '접속 선로 한전 확인';
  return '접속 가능';
}

const LAYER: { key: GridLayerKey; label: string }[] = [
  { key: 'substation', label: '변전소' },
  { key: 'transformer', label: '주변압기' },
  { key: 'feeder', label: '배전선로' },
];

/** 오른쪽 한전 표의 줄 — 단계 · 이름 · 접속기준용량 · 접수기준 접속용량 · 여유용량(MW) */
export function gridTableRows(grid: GridView | null): string[][] | null {
  const row = bestOf(grid);
  if (!row) return null;
  const mw = (v: number | null) => (v === null ? '-' : mwText(v).replace('MW', ''));
  const name: Record<GridLayerKey, string> = { substation: row.substation, transformer: row.transformer ? `#${row.transformer}` : '-', feeder: row.feeder };
  return LAYER.map(({ key, label }) => [label, name[key], mw(row.layers[key].limitKw), mw(row.layers[key].acceptedKw), mw(row.layers[key].spareKw)]);
}

/** 오른쪽 표 밑의 출처 · 어느 번지의 기록인가 */
export function gridNotes(grid: GridView, today: string): string[] {
  const basis = grid.basis;
  const where =
    basis.kind === 'neighbor'
      ? `인근 번지(${basis.address} · ${Math.round(basis.distanceM)}m)의 한전 기록 — 접속 선로는 한전 확인`
      : basis.kind === 'dong'
        ? `${basis.dong} 선로 ${grid.rows.length}개 중 여유가 가장 큰 선로 — 접속 선로는 한전 확인`
        : '이 번지의 한전 기록';
  return [`단위 MW · 한전 배전선로 여유용량 공개 자료(${today} 조회)`, where, ...(grid.region ? [grid.region] : [])];
}

function fillSite(s: Slide, input: ProposalInput, kw: number): void {
  const T = SLIDE.site;
  for (const [row, word] of [[1, '현장주소'], [2, '용도지역'], [3, '지목'], [4, '대지면적'], [5, '건축면적'], [6, '사용승인'], [7, '한전선로']] as const)
    mustSay(s, T, { row, col: 1 }, word);
  const values = siteRows(input.address, input.site, input.grid, kw);
  // 값 칸은 견본의 크기(16pt 굵게) — 한전선로 칸만 견본이 채울 자리 표시로 빨강이라 검정으로
  values.forEach((v, i) => fitCell(s, T, i + 1, 2, v, 16, i === 6 ? { color: C.text, min: 10 } : { min: 10 }));

  // 오른쪽 「한전ON 배전선로 여유용량 조회 화면」 자리 — 같은 공개 자료의 표로. 자료가 없으면 자리를 그대로 둔다(영업사가 화면을 붙인다)
  const rows = gridTableRows(input.grid);
  if (!rows || !input.grid) return;
  const box = s.boxOf(GRID_SLOT);
  s.remove(GRID_SLOT);
  let id = s.nextId();
  const head = (text: string): Cell => ({ text, fill: C.head, color: C.text, bold: true, size: 10.5 });
  const best = bestOf(input.grid)!;
  const table: Cell[][] = [
    [{ text: '한전 배전선로 여유용량', fill: C.navy, color: 'FFFFFF', bold: true, size: 14, span: 5 }],
    [head('단계'), head('이름'), head('접속기준용량'), head('접수기준 접속용량'), head('여유용량')],
    ...rows.map((cells) => cells.map((text, i): Cell => ({ text, color: C.text, bold: i === 0 || i === 4, size: 12 }))),
    [
      { text: '접속 여유(셋 중 가장 작은 값)', color: C.text, bold: true, size: 12, span: 4 },
      { text: best.spareKw === null ? '-' : mwText(best.spareKw), color: C.red, bold: true, size: 13 },
    ],
  ];
  const w = box.w;
  const cols = [0.17, 0.21, 0.2, 0.22, 0.2].map((f) => f * w);
  const heights = [30, 36, 38, 38, 38, 34].map((h) => h * PT);
  const tableH = heights.reduce((a, b) => a + b, 0);
  const xml = [
    tableXml(id++, '한전 여유용량', { x: box.x, y: box.y, w, h: tableH }, cols, heights, table, {
      font: FONT,
      size: 12,
      border: { color: C.line, w: 12_700 },
      margin: { x: 45_720, y: 22_860 },
    }),
    textBoxXml(
      id++,
      '한전 자료 출처',
      { x: box.x, y: box.y + tableH + 8 * PT, w, h: 60 * PT },
      // 「※」는 글머리로 걸면 표 왼쪽 밖으로 내밀려 그려졌다(맥 미리보기) — 글 앞에 붙인다(견본의 각주와 같은 모양)
      gridNotes(input.grid, input.today).map((line) => ({ runs: [{ text: `※ ${line}`, size: 10.5, color: C.note, font: FONT }] })),
      { anchor: 't' },
    ),
  ];
  s.append(xml.join(''));
}

/* --------------------------------------------------------------- 배치계획 */

async function fillLayout(s: Slide, input: ProposalInput, terms: Terms, kw: number): Promise<void> {
  const T = SLIDE.layout;
  for (const [row, word] of [[2, '모듈'], [4, '건물용도'], [5, '용량'], [6, '모듈각도']] as const) mustSay(s, T, { row, col: 1 }, word);
  // 모듈 「LONGI 650Wp 양면 모듈」 — 출력만 조건의 것으로
  const moduleText = s.textOf(T, { row: 2, col: 2 });
  const W = terms.moduleWatt;
  if (/\d+(?=\s*Wp)/.test(moduleText)) s.setCell(T, 2, 2, moduleText.replace(/\d+(?=\s*Wp)/, String(W)));
  fitCell(s, T, 4, 2, input.site.buildingUse ?? '-', 14, { min: 10 });
  // 용량 — 첫 줄 「137.15 kW」(빨강 굵게 밑줄 — 견본의 강조) · 둘째 줄 「( 211EA × 650Wp )」
  s.setRuns(T, [{ text: `${kwText(kw)} `, like: 0 }, { text: 'kW', like: 1 }], { cell: { row: 5, col: 2 } });
  s.setRuns(
    T,
    [
      { text: '( ', like: 0 },
      { text: `${input.panels.toLocaleString('ko-KR')}EA`, like: 1 },
      { text: ' × ', like: 2 },
      { text: `${W}Wp )`, like: 3 },
    ],
    { cell: { row: 5, col: 2 }, para: 1 },
  );
  s.setCell(T, 6, 2, input.mount.style === 'flush' ? '지붕면 부착' : `${input.mount.tiltDeg}도`);
  // 오른쪽 「가배치 도면」 자리 — 그 현장의 가배치 그림(패널을 그린 항공사진)
  const slot = s.boxOf(DRAWING_SLOT);
  const pic = await input.image(slot.w / slot.h, true);
  s.remove(DRAWING_SLOT);
  s.append(pictureXml(s.nextId(), '가배치 도면', s.addMedia(pic.bytes, 'jpeg'), slot));
}

/* ----------------------------------------------------------------- 임대료 */

/** 임대료 쪽의 글 — 두 연차표 · 머리말(검정 · 빨강) · 참여지원금 각주 */
export function rentTexts(r: Mohaet, terms: Terms) {
  const won = (v: number) => `${wonText(v)} 원`;
  const yearRows = [1, 2, 3, 4, 5, 6, 7, MOHAET_YEARS];
  return {
    oneHead: `1년 선납 (연 ${wonText(terms.rentPerKw)}원/kW)`,
    fiveHead: `5년 선납 (1~5년차 연 ${wonText(terms.prepay5PerKw)}원/kW)`,
    /** [연차, 1년 선납 칸, 5년 선납 칸(2~5년은 null — 견본의 「-」 그대로)] */
    years: yearRows.map((n) => [n, won(r.one.years[n - 1]!), r.five.years[n - 1] === null ? null : won(r.five.years[n - 1]!)] as const),
    oneTotal: won(r.one.total),
    fiveTotal: won(r.five.total),
    headBlack: `${kwText(r.kw)}kW 기준 예상 임대수익: `,
    headRed: `20년간 약 ${roughWonText(r.one.total)} (연 평균 약 ${roughWonText(r.one.total / MOHAET_YEARS)}), 5년 선납 법인은 참여지원금 포함 약 ${roughWonText(r.five.total + r.subsidy)}`,
    note: `※ 5년 선납을 선택한 법인 임대인에게는 참여지원금 ${wonText(terms.subsidyPerKw)}원/kW(${kwText(r.kw)}kW 기준 ${wonText(r.subsidy)}원, 1회)를 별도로 지급하며, 이 경우 20년 총 수령액은 ${wonText(r.five.total + r.subsidy)}원입니다.`,
  };
}

function fillRent(s: Slide, r: Mohaet, terms: Terms): void {
  const t = rentTexts(r, terms);
  mustSay(s, RENT.one, { row: 1, col: 1 }, '1년 선납');
  mustSay(s, RENT.five, { row: 1, col: 1 }, '5년 선납');
  for (const tbl of [RENT.one, RENT.five]) {
    mustSay(s, tbl, { row: 11, col: 1 }, `${MOHAET_YEARS} 년`);
    mustSay(s, tbl, { row: 13, col: 1 }, '합계');
  }
  s.setCell(RENT.one, 1, 1, t.oneHead);
  s.setCell(RENT.five, 1, 1, t.fiveHead);
  // 연차 칸 — 3~9행이 1~7년, 11행이 20년(10행은 「…」)
  t.years.forEach(([n, one, five]) => {
    const row = n === MOHAET_YEARS ? 11 : n + 2;
    s.setCell(RENT.one, row, 2, one);
    if (five !== null) s.setCell(RENT.five, row, 2, five);
  });
  s.setCell(RENT.one, 13, 2, t.oneTotal);
  s.setCell(RENT.five, 13, 2, t.fiveTotal);
  s.setRuns(RENT.head, [
    { text: t.headBlack, like: 1 },
    { text: t.headRed, like: 2 },
  ]);
  s.setRuns(RENT.note, [{ text: t.note, like: 0 }], { para: 0 });
}

/* ------------------------------------------------------------------ 비교 */

/** 「개인 임대인은 1년 선납이 3,428,750원 많음」 — 20년 총액이 큰 쪽과 그 차 */
export function compareText(who: string, one: number, five: number): string {
  if (one === five) return `${who} 임대인은 두 방식이 같음`;
  return `${who} 임대인은 ${one > five ? '1년' : '5년'} 선납이 ${wonText(Math.abs(one - five))}원 많음`;
}

/** 비교표의 칸 — [행, 열, 글](행 · 열은 1부터). 견본의 지급 방식 · 중도 해지 줄은 고정 글이라 그대로 둔다 */
export function compareCells(r: Mohaet, terms: Terms): [number, number, string][] {
  const w = wonText;
  const sub = r.subsidy;
  return [
    [3, 2, `연 ${w(terms.rentPerKw)}원/kW (1~${MOHAET_YEARS}년차)`],
    [3, 3, `연 ${w(terms.prepay5PerKw)}원/kW (1~5년차) / 연 ${w(terms.rentPerKw)}원/kW (6~${MOHAET_YEARS}년차)`],
    [4, 1, `${kwText(r.kw)}kW 기준 지급액`],
    [4, 2, `매년 ${w(r.annual)}원`],
    [4, 3, `상업운전 시 ${w(r.prepay)}원, 6년차부터 매년 ${w(r.annual)}원`],
    [5, 3, `${w(terms.subsidyPerKw)}원/kW → ${w(sub)}원 (1회)`],
    [6, 2, `${w(r.one.years[0]!)}원`],
    [6, 3, `${w(r.prepay)}원 (법인: 지원금 포함 ${w(r.prepay + sub)}원)`],
    [7, 2, `${w(r.one.total)}원`],
    [7, 3, `${w(r.five.total)}원 (법인: 지원금 포함 ${w(r.five.total + sub)}원)`],
    [8, 2, compareText('개인', r.one.total, r.five.total)],
    [8, 3, compareText('법인', r.one.total, r.five.total + sub)],
  ];
}

function fillCompare(s: Slide, r: Mohaet, terms: Terms): void {
  const T = COMPARE.table;
  mustSay(s, T, { row: 1, col: 2 }, '1년 선납');
  mustSay(s, T, { row: 1, col: 3 }, '5년 선납');
  for (const [row, word] of [[3, 'kW당'], [4, '기준 지급액'], [5, '참여지원금'], [6, '1년차'], [7, '20년 총'], [8, '비교']] as const) mustSay(s, T, { row, col: 1 }, word);
  s.setText(COMPARE.title, `1년 선납 vs 5년 선납 비교 (${kwText(r.kw)}kW 기준, VAT 별도)`);
  for (const [row, col, text] of compareCells(r, terms)) s.setCell(T, row, col, text);
}


/**
 * 에이치에너지 모햇 제안서 — 사업자 견본(「03. 모햇 제안서_SAMPLE」 · 「HENERGY 사업제안서」 · 공유옥상 임대사업)을 채운다. [브라우저]
 * (한백 2026-11-09 「에이치에너지에서 솔라쉐어는 우리가 안할거고 모햇만 할 예정」 · 「템플릿 이거에 맞춰줘」 — 그전의 솔라쉐어 2.0 생성기는 걷었다)
 *
 * ★바꿀 자리는 견본이 정한다★(같은 날 저녁 한백 「템플릿이 있으면 거기서 바뀌어야하는 영역과 그렇지 않은 영역을 구분하고 그에 따라
 * 자동으로 입력되게」 — lib/solar/proposal/sample-fill). 견본이 적어 둔 모양 그대로 찾는다:
 *   빈칸      표지 「[(주)고객사명] ([현장 주소])」 · 부지 검토 표(「[용도지역]」 · 「[    ] ㎡」 · 「[YYYY.MM.DD]」 · 한전선로) · 배치계획 표
 *            (「[건물용도]」 · 「[    ] kW」 · 「[   ]EA」 · 「[  ]도」) — 값은 부지 검토가 받은 공적 자료(Report.site · grid)와 배치(mohaetValue)
 *   예시 숫자  임대료 · 비교 쪽 — 견본이 예시 용량으로 셈해 적은 금액을 같은 셈(mohaetAmounts)으로 이 현장 금액으로 바꾼다. 문장은 견본
 *            그대로라 사업자가 문구를 고쳐 와도(그날 「복구됨」 → 「_최종」의 비교표처럼) 생성기를 안 고친다.
 * 견본에 글로 없는 것만 여기서 한다:
 *   「가배치 도면」 자리         그 현장의 가배치 그림(패널을 그린 항공사진)
 *   「한전ON … 조회 화면」 자리   같은 한전 공개 자료의 단계별 표(변전소 · 주변압기 · 배전선로) — 자료가 없으면 자리를 그대로 둔다
 *   영업사                    표지 고객 줄 밑 한 줄 · 마지막 장 두 줄
 * 견본의 빨강 둘: 「FF0000」(채울 자리 표시)은 채우며 검정으로, 「C00000」(강조 — 용량 · 임대수익)은 그대로.
 */
import { Deck } from '@/lib/pptx/deck';
import { EMU_PER_PT, pictureXml, tableXml, textBoxXml, type Cell } from '@/lib/pptx/xml';
import type { GridLayerKey, GridView } from '@/lib/solar/types';
import { capacityKw, kwText, mohaet } from './calc';
import { sellerBlock, sellerCover, type FillArgs, type ProposalInput } from './fill-common';
import type { Terms } from './products';
import type { Amounts, FieldKey } from './sample';
import { fillSample, findSlot, fitTo, type FieldValue, type FilledBody } from './sample-fill';

const PT = EMU_PER_PT;
/** 틀의 글꼴(테마 Arial — 한글은 받는 컴퓨터의 고딕으로) · 표 머리 남색 · 칸 테두리 하늘 · 본문 회색 */
const FONT = 'Arial';
const C = { navy: '2F5496', line: 'DDEAF6', head: 'DDEAF6', text: '000000', note: '404040', red: 'C00000', coverBlue: '5B9BF5', soft: 'D9D9D9' };
/** 표지 오른쪽 도시 사진이 시작되는 자리(약 640pt) — 고객 줄은 그 앞에서 끝나게 */
const COVER_TEXT_MAX_PT = 640;
/** 그림 · 표를 얹을 자리 — 견본의 빨간 자리 글 */
const DRAWING_SLOT = /배치\s*도면/;
const GRID_SLOT = /여유\s*용량\s*조회/;

export async function fillHenergy({ template, terms, input }: FillArgs): Promise<Blob | Uint8Array> {
  const deck = await Deck.open(template);
  const kw = capacityKw(input.panels, terms.moduleWatt);
  const filled = await fillSample(deck, {
    kw,
    moduleWatt: terms.moduleWatt,
    amounts: (k) => mohaetAmounts(k, terms),
    value: mohaetValue(input, kw),
    required: ['customer', 'capacity'],
  });
  fillCover(filled, input);
  await fillGrid(deck, input);
  await fillDrawing(deck, input);
  // 마지막 장 — 「Have your ENERGY & Share it」 밑 두 줄. 오른쪽 도시 사진의 비스듬한 가(이 높이에서 약 600pt)에 닿지 않게 가운데 320pt
  const end = await deck.slide(deck.slides.length);
  end.append(
    textBoxXml(end.nextId(), '영업사 연락처', { x: 320 * PT, y: 322 * PT, w: 320 * PT, h: 52 * PT }, sellerBlock(input.seller, { font: FONT, size: 16, contactSize: 13, name: 'FFFFFF', contact: C.soft }, 320, 'ctr'), {
      anchor: 't',
    }),
  );
  return deck.save();
}

/* ------------------------------------------------------------- 예시 숫자 */

/**
 * 모햇 견본의 금액들 — 견본이 예시 용량으로 셈해 적은 숫자를 이 셈으로 다시 낸다(sample swapTableOf 가 예시 용량 · 이 현장 용량으로
 * 두 번 부른다). 원 단위(「…원」)와 어림(「약 …억원」 · 「…만원」) 둘 다 이 값들로 찾는다.
 * ★견본에 새 금액이 생기면 여기 한 줄을 더한다★ — 없으면 생성기가 「예시 숫자를 다시 셈하지 못했습니다」로 그 숫자를 짚고 멈춘다.
 */
export function mohaetAmounts(kw: number, terms: Terms): Amounts {
  const r = mohaet(kw, terms);
  return {
    /** 1년 선납 해마다 · 5년 선납 6~20년차 · 연 평균 */
    annual: r.annual,
    /** 5년 선납 상업운전 시 5년치 선지급 */
    prepay: r.prepay,
    subsidy: r.subsidy,
    oneTotal: r.one.total,
    fiveTotal: r.five.total,
    fiveWithSubsidy: r.five.total + r.subsidy,
    /** 「복구됨」 비교표의 「법인: 지원금 포함」 1년차 */
    prepayWithSubsidy: r.prepay + r.subsidy,
    /** 20년 총액의 차 — 개인(지원금 없이) · 법인(지원금 포함) */
    gapPersonal: Math.abs(r.one.total - r.five.total),
    gapCorporate: Math.abs(r.one.total - (r.five.total + r.subsidy)),
  };
}

/* ------------------------------------------------------------------ 빈칸 */

/**
 * 빈칸의 값 — 견본이 빈칸 뒤에 단위를 적었으면(「[    ] ㎡」) 숫자만, 아니면 단위까지. 모르는 값은 null(그 칸 「-」).
 * 부지 검토 쪽은 부지 검토가 받은 공적 자료 그대로다 — 한전선로 칸의 괄호는 이 용량이 붙는가의 한 마디(gridCondition).
 */
export function mohaetValue(input: Pick<ProposalInput, 'customer' | 'address' | 'site' | 'grid' | 'panels' | 'mount'>, kw: number) {
  const { site, grid } = input;
  const best = bestOf(grid);
  return (key: FieldKey, unit: string): FieldValue | null | undefined => {
    const withUnit = (v: string, u: string) => (unit ? v : `${v}${u}`);
    switch (key) {
      case 'customer':
        return input.customer;
      case 'address':
        return input.address;
      case 'zoning':
        return site.zoning.length ? site.zoning.join(' · ') : null;
      case 'landCategory':
        return site.landCategory ?? null;
      case 'landArea':
        return site.landAreaM2 ? withUnit(areaText(site.landAreaM2), ' ㎡') : null;
      case 'buildingArea':
        return site.buildingAreaM2 ? withUnit(areaText(site.buildingAreaM2), ' ㎡') : null;
      case 'buildingUse':
        return site.buildingUse ?? null;
      case 'approvedOn': {
        const d = dateText(site.approvedOn);
        return d === '-' ? null : d;
      }
      case 'substation':
        return best?.substation ?? null;
      case 'spareMw': {
        if (!best) return null;
        const sub = best.layers.substation.spareKw;
        return sub === null ? { text: '-', eatUnit: true } : withUnit(mwNumber(sub), 'MW');
      }
      case 'gridCondition':
        return grid && best ? gridCondition(grid, kw) : null;
      case 'capacity':
        return withUnit(kwText(kw), 'kW');
      case 'panels':
        return withUnit(input.panels.toLocaleString('ko-KR'), '장');
      case 'tilt':
        return input.mount.style === 'flush' ? { text: '지붕면 부착', eatUnit: true } : withUnit(String(input.mount.tiltDeg), '도');
    }
  };
}

export const areaText = (m2: number): string => m2.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

/** 「20240315」 → 「2024.03.15」 · 연도만이면 그대로 · 없으면 「-」 */
export function dateText(yyyymmdd: string | null): string {
  const m = yyyymmdd?.match(/^(\d{4})(\d{2})?(\d{2})?$/);
  if (!m) return '-';
  return [m[1], m[2], m[3]].filter(Boolean).join('.');
}

/** 「8.39」 — kW 를 MW 소수 둘째까지 */
export const mwNumber = (kw: number): string => (kw / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
export const mwText = (kw: number): string => `${mwNumber(kw)}MW`;

const bestOf = (grid: GridView | null) => (grid && grid.best !== null ? (grid.rows[grid.best] ?? null) : null);

/**
 * 한전선로 칸 괄호의 한 마디 — 이 용량(kw)이 붙을 수 있는가. 셋(변전소 · 주변압기 · 배전선로) 중 가장 작은 여유가 0 이면 보강 뒤,
 * 용량보다 작으면 여유 부족, 지역 계통 사정이 있거나 이 번지의 기록이 아니면(옆 번지 · 같은 동) 한전 확인, 그 밖에는 접속 가능.
 * 판정의 말(lib/solar/rules judgeGrid)을 제안서의 짧은 말로 옮겼다.
 */
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

/** 한전 표의 줄 — 단계 · 이름 · 접속기준용량 · 접수기준 접속용량 · 여유용량(MW) */
export function gridTableRows(grid: GridView | null): string[][] | null {
  const row = bestOf(grid);
  if (!row) return null;
  const mw = (v: number | null) => (v === null ? '-' : mwNumber(v));
  const name: Record<GridLayerKey, string> = { substation: row.substation, transformer: row.transformer ? `#${row.transformer}` : '-', feeder: row.feeder };
  return LAYER.map(({ key, label }) => [label, name[key], mw(row.layers[key].limitKw), mw(row.layers[key].acceptedKw), mw(row.layers[key].spareKw)]);
}

/** 한전 표 밑의 출처 · 어느 번지의 기록인가 */
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

/* ---------------------------------------------------- 견본에 글로 없는 것 */

/** 표지 — 고객 줄은 오른쪽 도시 사진 앞에서 끝나게(한 줄 · 길면 14pt 까지 줄인다), 그 밑에 제안하는 영업사 한 줄 */
function fillCover(filled: FilledBody[], input: ProposalInput): void {
  const cover = filled.find((f) => f.keys.includes('customer'));
  if (!cover) return;
  const { slide: s, body, shape } = cover;
  const inner = s.innerWidthPt(body);
  fitTo(s, body, Math.min(inner, COVER_TEXT_MAX_PT), 14);
  const box = s.boxOfEl(shape);
  const inset = (box.w / PT - inner) / 2;
  const seller = sellerCover(input.seller, { font: FONT, size: 14, label: C.coverBlue, name: 'FFFFFF', contact: C.soft }, 560);
  s.append(
    textBoxXml(s.nextId(), '영업사', { x: box.x + inset * PT, y: box.y + box.h + 9.2 * PT, w: 560 * PT, h: (seller.length > 1 ? 40 : 22) * PT }, seller, {
      anchor: 't',
      wrap: false,
    }),
  );
}

/** 「한전ON 배전선로 여유용량 조회 화면」 자리 — 같은 공개 자료의 표로. 자료가 없으면 자리를 그대로 둔다(영업사가 화면을 붙인다) */
async function fillGrid(deck: Deck, input: ProposalInput): Promise<void> {
  const rows = gridTableRows(input.grid);
  if (!rows || !input.grid) return;
  const slot = await findSlot(deck, GRID_SLOT);
  if (!slot) return;
  const s = slot.slide;
  const box = s.boxOfEl(slot.shape);
  s.removeEl(slot.shape);
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
  s.append(
    [
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
    ].join(''),
  );
}

/** 「가배치 도면」 자리 — 그 현장의 가배치 그림(패널을 그린 항공사진) */
async function fillDrawing(deck: Deck, input: ProposalInput): Promise<void> {
  const slot = await findSlot(deck, DRAWING_SLOT);
  if (!slot) throw new Error('템플릿이 바뀌었습니다 — 「가배치 도면」 자리를 찾지 못했습니다.');
  const s = slot.slide;
  const box = s.boxOfEl(slot.shape);
  const pic = await input.image(box.w / box.h, true);
  s.removeEl(slot.shape);
  s.append(pictureXml(s.nextId(), '가배치 도면', s.addMedia(pic.bytes, 'jpeg'), box));
}

/**
 * 타이런트아이 솔라15 제안서 — 사업자가 준 「솔라15 템플릿.pptx」(30장)에 현장 칸 두 장을 채우고 「시공사」 한 장을 뺀다.
 * 표지와 마지막 장에 제안하는 영업사 · 연락처를 얹는다. [브라우저]
 *
 * 틀에서 바뀌는 자리는 둘뿐이다(2026-11-06 틀을 열어 쟀다 — 나머지 28장은 한 장짜리 그림이다):
 *   2장 「Project 요약」 — 이름 붙은 글상자 여덟(고객명 · 설치용량 · 20년 누적 · 35년 총 누적 · 설치위치 두 줄 · 설치형식 · 모듈)과
 *        「이미지 삽입」 그림 자리. 칸 이름 · 「상기 용량은 현장 실측 후 변경 될 수 있음」은 바탕 그림에 박혀 있다.
 *   3장 「Cash Flow」 — 삽입용 엑셀의 표를 그림(EMF)으로 붙인 자리. 그림 대신 고칠 수 있는 파워포인트 표로 다시 짓는다
 *        (한백 「수정가능하게」) — 모양 · 색은 상품설명서의 「Cash Flow (1MW, 기본형 기준)」 쪽을 따랐다.
 * 표의 숫자는 lib/solar/proposal/calc solar15 — 삽입용 엑셀(기본형 · 5년 선납형)의 셈과 같다.
 */
import { Deck, type Slide } from '@/lib/pptx/deck';
import { EMU_PER_PT, paras, pictureXml, tableXml, tagXml, textBoxXml, type Cell } from '@/lib/pptx/xml';
import { capacityKw, eok2, kwText, solar15, SOLAR15_RENT_YEARS, type Solar15, type Solar15Variant } from './calc';
import { mountText, sellerBlock, sellerCover, setFittedText, splitAddress, type FillArgs, type ProposalInput, type Seller } from './fill-common';
import type { Terms } from './products';

const FONT = 'Pretendard';
const PT = EMU_PER_PT;
/** 상품설명서의 Cash Flow 표 색 */
const C = {
  green: '548235',
  greenLight: 'E2EFDA',
  blue: '2E75B6',
  grey: 'F2F2F2',
  greyMid: 'BFBFBF',
  dark: '595959',
  peach: 'FBE5D6',
  orange: 'F4B183',
  tag: 'FFC000',
  text: '2B2B2B',
  line: 'A6A6A6',
  /** 틀 표지의 「SOLAR15」 · 「솔라15」 주황(사업자 색) */
  brand: 'FF5F3E',
};

/** 틀의 칸 이름(2026-05-21 판) — 사업자가 틀을 바꾸면 Deck 이 「칸이 없습니다」로 멈춘다 */
const S2 = {
  project: '직사각형 12',
  kw: '직사각형 1',
  sum20: '직사각형 6',
  sum35: '직사각형 9',
  where1: '직사각형 10',
  where2: '직사각형 16',
  mount: '직사각형 14',
  module: '직사각형 15',
  image: '사각형: 둥근 모서리 11',
} as const;
const S3 = { table: '그림 2', frame1: '직사각형 1', frame2: '직사각형 3' } as const;
/**
 * 뺄 장 — 26장 「시공사」(타이런트와 일하는 시공 협력사 로고 판, 그림 한 장). 한백이 고객에게 내는 제안서라 뺀다
 * (한백 2026-11-06 「페이지 26 삭제해도돼」). 차례(26)가 아니라 그 그림의 내용(SHA-256)으로 찾는다 — 사업자가 장을 더하거나 빼
 * 차례가 밀려도 엉뚱한 장을 빼지 않게. 사업자가 그 그림을 바꾼 새 틀이면 못 찾아 그 장이 남는다 — 그때 새 틀의 그림 값으로 바꾼다.
 */
const DROP_PICTURES = ['bebb8ec6862a529b5c038582d89a29d71aa6f1869258c7c04445df051926e828'];

export async function fillTyrant({ template, terms, input }: FillArgs, variant: Solar15Variant): Promise<Blob | Uint8Array> {
  const deck = await Deck.open(template);
  const kw = capacityKw(input.panels, terms.moduleWatt);
  const cf = solar15(kw, terms, variant);
  await fillSummary(await deck.slide(2), kw, cf, terms, input);
  fillCashFlow(await deck.slide(3), kw, cf, terms, variant);
  await addSeller(deck, input.seller);
  // 뺄 장 — 뒤에서부터(앞을 빼면 뒤의 차례가 당겨진다)
  for (const sha of DROP_PICTURES) for (const n of (await deck.slidesUsing(sha)).reverse()) await deck.dropSlide(n);
  return deck.save();
}

/** 2장 Project 요약 — 고객 글은 칸에 맞춰(길면 틀의 크기에서 줄인다) · 숫자 · 현장 가배치 그림 */
async function fillSummary(s2: Slide, kw: number, cf: Solar15, terms: Terms, input: ProposalInput): Promise<void> {
  const [line1, line2] = splitAddress(input.address);
  setFittedText(s2, S2.project, input.customer);
  s2.setText(S2.kw, `${kwText(kw)} kW`);
  s2.setText(S2.sum20, `${eok2(cf.sum1to20)} 억원`);
  s2.setText(S2.sum35, `${eok2(cf.sum35)} 억원`);
  setFittedText(s2, S2.where1, line1);
  // 둘째 줄은 도로명 쪽만 — 고객명까지 붙이면 칸(212pt)을 넘어 두 줄로 접혀 밑의 선을 덮었다(고객명은 제목에 있다)
  setFittedText(s2, S2.where2, line2 || input.customer);
  s2.setText(S2.mount, mountText(input.mount));
  s2.setText(S2.module, `${terms.moduleWatt} Wp`);
  /*
   * 「이미지 삽입」 자리는 둥근 네모에 그림을 채운 모양(sp 의 blipFill)이다 — 그 그림만 갈면 파워포인트에서는 되지만 구글 프레젠테이션은
   * 모양의 그림 채우기를 그림으로 옮기지 못한다. 같은 자리 · 같은 둥글기(adj 3121)의 그림(pic)으로 바꿔 넣는다.
   */
  const slot = s2.boxOf(S2.image);
  const pic = await input.image(slot.w / slot.h, true);
  s2.remove(S2.image);
  s2.append(pictureXml(s2.nextId(), '현장 가배치', s2.addMedia(pic.bytes, 'jpeg'), slot, 3121));
}

/**
 * 3장 Cash Flow — 엑셀 그림을 걷고 고칠 수 있는 표로: [주요가정] · 요약 · [이익배분] 두 표 · 표 기준.
 * 모양 번호(id)는 그 장의 다음 번호부터 지은 차례대로 매긴다.
 */
function fillCashFlow(s3: Slide, kw: number, cf: Solar15, terms: Terms, variant: Solar15Variant): void {
  const area = s3.boxOf(S3.table);
  s3.remove(S3.table);
  // 그림 위에 얹었던 회색 테두리 둘 — 옛 그림의 칸에 맞춘 것이라 같이 걷는다
  if (s3.find(S3.frame1)) s3.remove(S3.frame1);
  if (s3.find(S3.frame2)) s3.remove(S3.frame2);
  let id = s3.nextId();
  const xml: string[] = [];
  const label = (text: string, x: number, y: number, w = 120 * PT, size = 11) =>
    textBoxXml(id++, text, { x, y, w, h: 16 * PT }, paras(text, { size, bold: true, color: C.text, font: FONT }), { anchor: 'ctr', wrap: false });
  const note = (text: string, x: number, y: number, w: number) =>
    textBoxXml(id++, '각주', { x, y, w, h: 12 * PT }, paras(text, { size: 8, color: C.text, font: FONT }), { anchor: 't', wrap: false });

  const x0 = area.x;
  const y0 = area.y + 2 * PT;
  /*
   * 오른쪽에 여유를 둔다 — 표의 열 폭은 파워포인트가 그대로 쓰지만, 맥의 미리보기(Quick Look)는 열마다 2pt 남짓 넓혀 그려
   * 1~20년 표(21열)가 흰 판 밖으로 나갔다(2026-11-06). 여유 40pt 면 그 렌더러에서도 판 안이다.
   */
  const width = area.w - 40 * PT;
  const rowH = 23 * PT;
  const tableOpts = { font: FONT, size: 10, border: { color: C.line, w: 6350 }, margin: { x: 36_000, y: 9_000 } };

  // [주요가정] — 왼쪽, 3줄 × 4칸
  xml.push(label('[주요가정]', x0, y0));
  const assumeW = width * 0.32;
  const assumeCols = [assumeW * 0.27, assumeW * 0.25, assumeW * 0.2, assumeW * 0.28];
  const g = (text: string): Cell => ({ text, fill: C.greenLight, color: C.text, bold: true, size: 8.5 });
  const v = (text: string): Cell => ({ text, color: C.text });
  const assume: Cell[][] = [
    [{ text: '설치용량', fill: C.green, color: 'FFFFFF', bold: true }, { text: `${kwText(kw)} kW`, fill: C.green, color: 'FFFFFF', bold: true }, g('발전시간'), v(`${terms.hoursPerDay} 시간`)],
    [g('SMP+REC'), v(`${cf.unitPrice.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} 원`), g('SMP'), v(`${terms.smp} 원`)],
    [g('모듈열화율'), v(`${terms.degradationPct} %`), g('REC'), v(`${terms.rec} 원`)],
  ];
  const tableTop = y0 + 20 * PT;
  xml.push(tableXml(id++, '주요가정', { x: x0, y: tableTop, w: assumeW, h: rowH * 3 }, assumeCols, [rowH, rowH, rowH], assume, tableOpts));
  xml.push(note(`* ${SOLAR15_RENT_YEARS + 1}년차~35년차의 운영비 제외`, x0, tableTop + rowH * 3 + 3 * PT, assumeW));

  // 요약 — 오른쪽, 2줄 × 6칸
  const sumW = width * 0.6;
  const sumX = x0 + width - sumW;
  const hd = (text: string, fill: string, color: string): Cell => ({ text, fill, color, bold: true });
  const summary: Cell[][] = [
    [hd('35년 운영시 총 수익', C.blue, 'FFFFFF'), hd('월평균수익', C.blue, 'FFFFFF'), hd('1~15년', C.grey, C.text), hd('16~20년', C.peach, C.text), hd('1~20년', C.peach, C.text), hd('21~35년', C.peach, C.text)],
    [
      v(`${eok2(cf.sum35)} 억원`),
      v(`${Math.round(cf.monthlyManwon).toLocaleString('ko-KR')} 만원`),
      v(`${eok2(cf.sum1to15)} 억원`),
      v(`${eok2(cf.sum16to20)} 억원`),
      v(`${eok2(cf.sum1to20)} 억원`),
      v(`${eok2(cf.sum21to35)} 억원`),
    ],
  ];
  xml.push(tableXml(id++, '요약', { x: sumX, y: tableTop, w: sumW, h: rowH * 2 }, [0.22, 0.16, 0.155, 0.155, 0.155, 0.155].map((r) => r * sumW), [rowH, rowH], summary, tableOpts));
  xml.push(note('* 상기 수치는 주요 가정을 바탕으로 산출된 기대 수익 기준임', sumX, tableTop + rowH * 2 + 3 * PT, sumW));

  // [이익배분] — 1~20년, 21~35년 두 표. 첫 칸(Year · 건물주) 뒤로 해마다 한 칸
  const shareTop = tableTop + rowH * 3 + 22 * PT;
  xml.push(label('[이익배분]', x0, shareTop));
  xml.push(
    textBoxXml(id++, '단위', { x: x0 + width - 80 * PT, y: shareTop + 4 * PT, w: 80 * PT, h: 14 * PT }, paras('단위 : 억', { size: 8, color: C.text, font: FONT }, 'r'), {
      anchor: 'b',
      wrap: false,
    }),
  );
  // 21열 표는 그 렌더러에서 열마다 2.7pt 남짓 넓어져 여유 40pt 로도 8pt 넘쳤다 — 이 두 표만 24pt 더 줄인다
  const shareW = width - 24 * PT;
  const head = 52 * PT;
  const col = (shareW - head) / 20;
  const yearCell = (n: number): Cell => ({ text: String(n), fill: n <= SOLAR15_RENT_YEARS ? C.grey : C.peach, color: C.text, bold: true });
  const valueCell = (n: number): Cell => {
    const y = cf.years[n - 1];
    const own = n > SOLAR15_RENT_YEARS;
    return { text: y === null ? '-' : eok2(y), fill: own ? C.orange : C.greyMid, color: own ? 'FFFFFF' : C.text, bold: own };
  };
  const rowsFor = (from: number, to: number): Cell[][] => {
    const years = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    return [
      [{ text: 'Year', fill: C.dark, color: 'FFFFFF' }, ...years.map(yearCell)],
      [{ text: '건물주', fill: C.dark, color: 'FFFFFF' }, ...years.map(valueCell)],
    ];
  };
  const t1Top = shareTop + 22 * PT;
  xml.push(tableXml(id++, '이익배분 1~20년', { x: x0, y: t1Top, w: shareW, h: rowH * 2 }, [head, ...Array(20).fill(col)], [rowH, rowH], rowsFor(1, 20), tableOpts));
  // 「지분 양도」 꼬리표 — 15년차와 16년차 사이 위
  const tagW = 56 * PT;
  xml.push(tagXml(id++, '지분 양도', { x: x0 + head + col * 15 - tagW / 2, y: t1Top - 18 * PT, w: tagW, h: 15 * PT }, '지분 양도', { fillColor: C.tag, color: C.text, size: 9, font: FONT }));
  const t2Top = t1Top + rowH * 2 + 10 * PT;
  xml.push(tableXml(id++, '이익배분 21~35년', { x: x0, y: t2Top, w: head + col * 15, h: rowH * 2 }, [head, ...Array(15).fill(col)], [rowH, rowH], rowsFor(21, 35), tableOpts));
  // 제목 곁 — 어느 상품 · 몇 kW 의 표인가(상품설명서의 「Cash Flow (1MW, 기본형 기준)」 자리). 제목은 바탕 그림의 (88~242pt, 55~88pt)
  xml.push(
    textBoxXml(id++, '표 기준', { x: 250 * PT, y: 60 * PT, w: 300 * PT, h: 24 * PT }, paras(`(${kwText(kw)}kW, ${variant === 'basic' ? '기본형' : '5년 선납형'} 기준)`, { size: 15, bold: true, color: C.text, font: FONT }), {
      anchor: 'b',
      wrap: false,
    }),
  );
  s3.append(xml.join(''));
}

/** 영업사 — 표지의 부제 밑 한 줄 · 마지막 장(「The end of Document」) 밑 두 줄. 어두운 사진 위라 흰 글자 */
async function addSeller(deck: Deck, seller: Seller): Promise<void> {
  const s1 = await deck.slide(1);
  const cover = sellerCover(seller, { font: FONT, size: 13, label: C.brand, name: 'FFFFFF', contact: 'FFFFFF' }, 620);
  // 두 줄이면 부제(약 463pt 까지)와 밑의 고지 문구(506.7pt 부터) 사이에 둘 다 들게
  const coverBox = cover.length > 1 ? { x: 50 * PT, y: 467 * PT, w: 620 * PT, h: 37 * PT } : { x: 50 * PT, y: 474 * PT, w: 620 * PT, h: 24 * PT };
  s1.append(textBoxXml(s1.nextId(), '영업사', coverBox, cover, { anchor: 'ctr', wrap: false }));
  const end = await deck.slide(deck.slides.length);
  end.append(
    textBoxXml(end.nextId(), '영업사 연락처', { x: 180 * PT, y: 300 * PT, w: 600 * PT, h: 60 * PT }, sellerBlock(seller, { font: FONT, size: 18, contactSize: 14, name: 'FFFFFF', contact: 'FFFFFF' }, 600, 'ctr'), {
      anchor: 't',
    }),
  );
}

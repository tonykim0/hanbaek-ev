/**
 * 루모라 지붕임대 제안서 — 사업자가 준 PDF(「[루모라] 임대형 태양광 사업 제안서」 23쪽)를 고칠 수 있는 파워포인트로 짓는다. [브라우저]
 *
 * 루모라는 PDF 만 줬다(원본 pptx 를 받으면 타이런트처럼 그 파일을 채우면 된다). 그래서 쪽마다 그림으로 굽고, 현장마다 바뀌는 칸은 그림에서
 * 지운 뒤(그 둘레의 바탕색으로 칠한다) 그 자리에 고칠 수 있는 글상자 · 표 · 사진을 얹는다(한백 「수정가능하게」). 고정 쪽은 그림 그대로다.
 * 덱은 「예시」 도장이 찍힌 틀이다 — 바뀌는 쪽 다섯(2026-11-06 PDF 의 글줄 자리를 재어 옮겼다 · 단위 pt, 쪽 841.9 × 595.2):
 *   1 표지      고객명 · 주소를 더하고 날짜(「2026. 10.」)를 오늘 달로
 *   3 제안배경  머리 문장의 금액 · 「임대 후 지붕」 카드(귀사 지붕 kW · 20년 최대 · 매달 · 세 안) · 각주
 *   4 사업개요  머리 문장 · 표의 사업지 · 설치규모 · 연간 임대료(세 안) · 한전연계 · 사업 일정 · 사업지 사진(예시 → 항공사진) · 각주
 *   7 지급조건  카드 셋의 금액 · 연액 · 합계 · 누적 비교 문장 · 20년 연차표 · 각주
 *   8 설비용량  머리 문장 · 가배치 그림(예시 → 패널 그림) + 설계 개요 표 · 오른쪽 필요자료(「예시」 도장을 걷고 다시 쓴다)
 * 숫자는 lib/solar/proposal/calc lumoraRent. 틀 PDF 의 쪽 수 · 머리 글이 다르면(루모라가 덱을 바꾸면) 짓지 않고 멈춘다.
 */
import { loadPdfjs } from '@/lib/pdf-render';
import { buildPptx, type BuildSlide } from '@/lib/pptx/build';
import { Deck } from '@/lib/pptx/deck';
import { EMU_PER_PT, paras, pictureXml, rectXml, tableXml, textBoxXml, type Align, type Cell, type Para, type Run } from '@/lib/pptx/xml';
import { capacityKw, eokManText, kwText, LUMORA_PREPAYS, lumoraRent, millionText, monthAfter, type Lumora, type LumoraOption } from './calc';
import { fitText, sellerContact, sellerCover, type FillArgs, type ProposalInput, type Seller } from './fill-common';

const PT = EMU_PER_PT;
const PAGES = 23;
/** 쪽을 굽는 배율 — 841.9pt 가 약 2,000px. 글자가 그림이라 이보다 낮으면 화면에서 흐리다 */
const SCALE = 2.4;
const C = {
  navy: '052B47',
  red: 'C00000',
  amber: 'F2B632',
  amberDim: 'D7A634',
  cardLight: 'CDD5DA',
  cardDim: '869CAE',
  note: '4E697C',
  grey: '555E69',
  band: '52575B',
  table: '2D2D2D',
  right: '21466B',
};
/*
 * 글꼴 — 루모라 PDF 의 표 글자가 Noto Sans KR 이고, 구글 프레젠테이션에 있는 글꼴이라 그것 하나로 쓴다(머리 글은 원본이 맑은 고딕 굵게로
 * 보이지만 구글 프레젠테이션에 없어 다른 글꼴로 바뀐다). 파워포인트에 Noto Sans KR 이 없으면 고딕으로 갈음한다(lib/pptx/xml 의 pitchFamily).
 */
const HEAD = 'Noto Sans KR';
const BODY = 'Noto Sans KR';

type Rect = [number, number, number, number];
/** 덮어 쓸 글상자 — wrap 은 여러 줄(각주 · 오른쪽 글)만. 한 줄 값은 줄을 바꾸지 않는다(칸이 좁아도 한 줄로 남게) */
type Overlay = { name: string; rect: Rect; paras: Para[]; anchor?: 't' | 'ctr' | 'b'; wrap?: boolean };
type PagePlan = { masks: Rect[]; overlays: Overlay[]; extra?: string; picture?: { name: string; rect: Rect; withPanels: boolean } };

const emu = (r: Rect) => ({ x: r[0] * PT, y: r[1] * PT, w: (r[2] - r[0]) * PT, h: (r[3] - r[1]) * PT });
const run = (text: string, o: Omit<Run, 'text'> = {}): Run => ({ text, font: HEAD, ...o });
const line = (runs: Run[], align?: Align): Para => ({ runs, align });

/* ------------------------------------------------------------------ 쪽마다의 칸 */

/** 쪽마다 같이 쓰는 값 — 세 선납 안 · 용량 글 · 오늘(연 · 월) */
type Ctx = { r: Lumora; input: ProposalInput; o1: LumoraOption; o5: LumoraOption; o10: LumoraOption; kw: string; yy: number; mm: number };

const won = (n: number) => n.toLocaleString('ko-KR');
const body = (text: string, o: Omit<Run, 'text'> = {}) => run(text, { font: BODY, size: 11, color: '161616', ...o });
/** 칸 너비(widthPt)의 90% 에 들게 크기를 줄인 토막 — 한 줄 칸에 채워 넣는 긴 글 */
const fitRun = (text: string, size: number, widthPt: number, o: Omit<Run, 'text' | 'size'>, min?: number) =>
  run(text, { size: fitText(text, size, widthPt, min), ...o });

/** 바뀌는 쪽의 칸 — 쪽 번호 → 지울 자리 · 얹을 글상자 · 표 · 사진. 여기 없는 쪽은 그림 그대로다 */
export function lumoraPlans(r: Lumora, input: ProposalInput, w: number): Record<number, PagePlan> {
  const [yy, mm] = input.today.split('-').map(Number);
  const c: Ctx = { r, input, o1: r.options[1], o5: r.options[5], o10: r.options[10], kw: kwText(r.kw), yy, mm };
  return { 1: coverPage(c), 3: backgroundPage(c), 4: overviewPage(c), 7: paymentPage(c), 8: capacityPage(c, w), 23: sellerPage(input.seller) };
}

/** 1 표지 — 고객명 · 주소를 더한다(틀에 자리가 없다), 날짜는 오늘 달 */
function coverPage({ input, yy, mm }: Ctx): PagePlan {
  const cover = sellerCover(input.seller, { font: HEAD, size: 13, label: C.navy, name: C.navy, contact: '133751' }, 424);
  return {
    masks: [[720, 508, 812, 533]],
    overlays: [
      { name: '고객명', rect: [46, 322, 640, 352], paras: [line([fitRun(`${input.customer} 귀중`, 22, 594, { bold: true, color: C.navy }, 14)])] },
      { name: '고객 주소', rect: [46, 354, 640, 374], paras: [line([run(input.address, { size: 13, color: C.navy })])] },
      { name: '날짜', rect: [720, 508, 810, 533], paras: [line([run(`${yy}. ${String(mm).padStart(2, '0')}.`, { size: 17, bold: false, color: '133751' })], 'r')] },
      // 제안하는 영업사 — 밑줄 왼쪽의 빈자리(오른쪽 「STRICTLY CONFIDENTIAL」은 약 490pt 부터). 두 줄이면 위로 늘려 둘째 줄이 날짜 줄에 선다
      cover.length > 1
        ? { name: '영업사', rect: [46, 494, 470, 529], anchor: 'b', paras: cover }
        : { name: '영업사', rect: [46, 508, 470, 533], paras: cover },
    ],
  };
}

/** 3 제안배경 — 머리 문장의 빨간 쪽 · 카드 넷 줄 · 각주 */
function backgroundPage({ r, o1, o5, o10, kw }: Ctx): PagePlan {
  return {
    // 큰 금액은 위 줄(「20년간 최대」 199.8~215.7)을 건드리지 않게 216.5 부터
    masks: [[214, 86, 482, 111], [504, 182, 724, 199], [504, 216.5, 724, 256], [504, 258, 724, 279], [504, 280, 726, 297], [34, 553, 700, 569]],
    overlays: [
      {
        name: '머리 금액',
        rect: [216.6, 86.9, 700, 110.1],
        paras: [line([fitRun(`빌려주면 20년간 최대 ${eokManText(o1.total)}`, 16, 483, { bold: true, color: C.red }, 12)])],
      },
      { name: '카드 기준', rect: [506.1, 183, 724, 198], paras: [line([run(`수익 · 귀사 지붕 ${kw}kW 기준`, { size: 9, bold: true, color: C.amberDim })])] },
      { name: '카드 금액', rect: [506.1, 216.5, 724, 254], paras: [line([run(eokManText(o1.total), { size: 30, bold: true, color: C.amber })])] },
      { name: '카드 매달', rect: [506.1, 259.7, 724, 277.1], paras: [line([run(`매달 약 ${eokManText(r.monthly)}`, { size: 12, color: C.cardLight })])] },
      {
        name: '카드 세 안',
        // 카드 오른쪽 끝(약 810)까지 — 원본은 722 에서 끝났지만 금액이 길어지거나 글꼴이 다르면 넘쳐 접혔다
        rect: [506.1, 282.4, 800, 294.7],
        paras: [line([run(`1년 선납 기준 · 5년 선납 ${eokManText(o5.total)} · 10년 선납 ${eokManText(o10.total)}`, { size: 8.5, color: C.cardDim })])],
      },
      {
        name: '각주',
        rect: [36.1, 554.7, 790, 580],
        anchor: 't',
        wrap: true,
        paras: [line([run(`※ 예상 임대수익은 실시설계로 확정되는 설비용량에 따라 달라짐. 1년 선납 기준이며 5년 선납은 20년 ${eokManText(o5.total)}, 10년 선납은 ${eokManText(o10.total)}. 기사 내용은 각 언론 보도 기준`, { size: 9, color: C.note })])],
      },
    ],
  };
}

/** 4 사업개요 — 머리 문장 · 표 칸 · 사진 · 각주 */
function overviewPage({ input, o1, o5, o10, kw, yy, mm }: Ctx): PagePlan {
  const plus = (n: number) => {
    const m = monthAfter(yy, mm, 1 + n);
    return `${m.year}년 ${String(m.month).padStart(2, '0')}월`;
  };
  const spare =
    input.gridSpareKw === null
      ? '연계가능 잔여용량 : 한전 확인 필요'
      : `연계가능 잔여용량 : ${input.gridSpareKw >= 1000 ? `${(input.gridSpareKw / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}MW` : `${Math.round(input.gridSpareKw).toLocaleString('ko-KR')}kW`} (${String(yy).slice(2)}년 ${String(mm).padStart(2, '0')}월 조회)`;
  // 머리 문장 — 쪽 폭을 거의 다 쓰는 긴 줄이라 칸의 90% 에 들게(fitText) 글자를 줄인다
  const head = [`${kw}kW 규모 발전소를 SPC가 투자 · 운영하고, 임대인은 `, `20년간 최대 ${eokManText(o1.total)}의 임대료 수령`];
  const headSize = fitText(head.join(''), 16, 764, 12);
  return {
    // 여러 줄 칸(연간 임대료 · 사업 일정)은 글머리 점까지 지우고 다시 찍는다 — 원본 점과 새 줄이 어긋나지 않게(줄 높이는 원본 15.9pt)
    masks: [[34, 85, 760, 112], [140, 165, 414, 186], [140, 197, 414, 217], [128, 292, 414, 391], [140, 404, 414, 423], [128, 451, 414, 517], [34, 553, 700, 569]],
    overlays: [
      {
        name: '머리 문장',
        rect: [36.1, 86.9, 800, 110.1],
        paras: [line([run(head[0], { size: headSize, bold: true, color: C.navy }), run(head[1], { size: headSize, bold: true, color: C.red })])],
      },
      { name: '사업지', rect: [146.7, 166, 414, 186], paras: [line([body(input.address)])] },
      { name: '설치규모', rect: [146.7, 197, 414, 217], paras: [line([body(`${kw}kW (*건축도면 수령 후 실시설계시 확정)`)])] },
      {
        name: '연간 임대료',
        rect: [133.2, 294.6, 414, 392],
        anchor: 't',
        paras: [
          { runs: [body(`1년 선납 : 총 ${eokManText(o1.total)}`, { bold: true, color: '000000' })], bullet: '•' },
          { runs: [body(`- 1~20년차 매년 ${eokManText(o1.annual)}`)], indentPt: 13.5 },
          { runs: [body(`5년 선납 : 총 ${eokManText(o5.total)}`, { bold: true, color: '000000' })], bullet: '•' },
          { runs: [body(`- 최초 5년 ${eokManText(o5.upfront)} · 이후 매년 ${eokManText(o5.annual)}`)], indentPt: 13.5 },
          { runs: [body(`10년 선납 : 총 ${eokManText(o10.total)}`, { bold: true, color: '000000' })], bullet: '•' },
          { runs: [body(`- 최초 10년 ${eokManText(o10.upfront)} · 이후 매년 ${eokManText(o10.annual)}`)], indentPt: 13.5 },
        ].map((q) => ({ ...q, lineSpacingPt: 15.9 })),
      },
      { name: '한전연계', rect: [146.7, 404, 414, 423], paras: [line([body(spare)])] },
      {
        name: '사업 일정',
        rect: [133.2, 452.7, 414, 518],
        anchor: 't',
        paras: [
          `${plus(0)} : 계약체결 및 실시설계`,
          `${plus(3)} : 사업 인허가 완료(+3M)`,
          `${plus(4)} : 착공(+4M)`,
          `${plus(7)} : 상업운전 및 임대료 지급(+7M)`,
        ].map((t) => ({ runs: [body(t)], bullet: '•', lineSpacingPt: 15.85 })),
      },
      {
        name: '각주',
        rect: [36.1, 554.7, 700, 567.8],
        paras: [line([run(`※ 연간 임대료 = 설비용량(kW) × 1년 선납 ${won(o1.price)}원 / 5년 선납 ${won(o5.price)}원 / 10년 선납 ${won(o10.price)}원 (kW당 연간). 설치 규모 · 임대료는 실시설계 용량으로 확정`, { size: 9, color: C.note })])],
      },
    ],
    picture: { name: '사업지 사진', rect: [436.8, 184.0, 811.8, 524.4], withPanels: false },
  };
}

/** 7 지급조건 — 카드 셋 · 누적 문장 · 각주 · 20년 연차표 */
function paymentPage({ r, o1, o5, o10, kw }: Ctx): PagePlan {
  const cards = ([1, 5, 10] as const).flatMap<Overlay>((k, i) => {
    const o = r.options[k];
    const x = [48, 310.7, 573.4][i];
    const later = k === 1 ? `2~20년차 매년 ${eokManText(o.annual)}` : `${k + 1}~20년차 매년 ${eokManText(o.annual)}`;
    return [
      { name: `${k}년 선납 금액`, rect: [x, 158, x + 240, 201.5], paras: [line([run(eokManText(k === 1 ? o.annual : o.upfront), { size: 30, bold: true, color: C.navy })])] },
      {
        name: `${k}년 선납 내용`,
        rect: [x, 239, x + 240, 266],
        anchor: 't',
        paras: [line([run(`· ${later}(매년 1월 선지급)`, { size: 10, color: C.grey })]), line([run(`· 20년 합계 ${eokManText(o.total)}`, { size: 10, color: C.grey })])],
      },
    ];
  });
  const cells = yearCells(r);
  return {
    masks: [
      [46, 157, 290, 202], [46, 238, 290, 267],
      [309, 157, 552, 202], [309, 238, 552, 267],
      [572, 157, 812, 202], [572, 238, 812, 267],
      [89, 320, 640, 337],
      [34, 555, 760, 579],
      ...cells.map((c): Rect => [c.rect[0], c.rect[1], c.rect[2] + 1, c.rect[3]]),
    ],
    overlays: [
      ...cards,
      {
        name: '누적 비교',
        rect: [90.3, 321, 700, 336],
        paras: [
          r.crossover
            ? line([
                run(`${r.crossover.year - 1}년차까지는 10년 선납이 가장 많고(${eokManText(r.crossover.before)}), `, { size: 10.6, color: C.band }),
                run(`${r.crossover.year}년차부터 1년 선납이 앞섬(${eokManText(r.crossover.one)} vs ${eokManText(r.crossover.ten)})`, { size: 10.6, bold: true, color: 'C30C0A' }),
              ])
            : line([run('20년 내내 10년 선납의 누적이 가장 많음', { size: 10.6, color: C.band })]),
        ],
      },
      {
        name: '각주',
        // 두 줄 — 쪽 번호(800~808)에 닿지 않게 790 에서 접는다
        rect: [36.1, 555.5, 790, 580],
        anchor: 't',
        wrap: true,
        paras: [
          line([
            run(
              `※ 1년 선납 = ${kw}kW × ${won(o1.price)}원/kW · 년, 5년 선납 = ${kw}kW × ${won(o5.price)}원/kW · 년(최초 5년분 선납), 10년 선납 = ${kw}kW × ${won(o10.price)}원/kW · 년(최초 10년분 선납). 20년차는 임대차 기간 만료일까지 일할 계산. 표는 백만원 단위(소수 첫째 자리) 반올림, 합계는 실제 금액 기준`,
              { size: 9, color: C.note },
            ),
          ]),
        ],
      },
      ...cells.map(
        (c): Overlay => ({
          name: '연차표 칸',
          rect: [c.rect[0], c.rect[1], c.rect[2] - 2, c.rect[3]],
          paras: [line([run(c.text, { font: BODY, size: 11, bold: c.bold, color: c.bold ? '000000' : C.table })], 'r')],
        }),
      ),
    ],
  };
}

/** 7쪽 연차표의 값 칸 — 값 칸만 지우고 칸마다 글상자(오른쪽 맞춤). 칸 오른쪽 끝: 1~10년차 245.5 + 60.5k, 11~20년차 184.9 + 60.5k, 합계 789 */
function yearCells(r: Lumora): { rect: Rect; text: string; bold?: boolean }[] {
  const rows1 = [386.2, 409.3, 432.2];
  const rows2 = [480.3, 503.3, 526.3];
  const cells: { rect: Rect; text: string; bold?: boolean }[] = [];
  LUMORA_PREPAYS.forEach((k, i) => {
    const ys = r.options[k].years;
    for (let n = 1; n <= 10; n++) {
      const right = 245.5 + (n - 1) * 60.5;
      cells.push({ rect: [right - 54, rows1[i] - 4, right + 2, rows1[i] + 14], text: millionText(ys[n - 1]) });
    }
    for (let n = 11; n <= 20; n++) {
      const right = 184.9 + (n - 11) * 60.5;
      cells.push({ rect: [right - 54, rows2[i] - 4, right + 2, rows2[i] + 14], text: millionText(ys[n - 1]) });
    }
    cells.push({ rect: [789 - 54, rows2[i] - 4, 789 + 2, rows2[i] + 14], text: millionText(r.options[k].total), bold: true });
  });
  return cells;
}

/** 8 설비용량 — 머리 문장 · 오른쪽 필요자료(도장 걷기) · 그림 · 설계 개요 표 */
function capacityPage({ input, kw }: Ctx, w: number): PagePlan {
  const head = ['위성 지도 기준 가배치 용량은 ', `${kw}kW 내외`, '이며, 공장도면 확보 후 구조 안정성 검토 및 실시설계로 최종 용량 확정'];
  const headSize = fitText(head.join(''), 16, 776, 12);
  return {
    masks: [[34, 85, 812, 112], [572, 120, 814, 365]],
    overlays: [
      {
        name: '머리 문장',
        // 원본은 「1,000」(5자)로 쪽 폭을 거의 다 썼다 — 칸의 90% 에 들게 글자를 줄인다(글꼴이 없는 컴퓨터에서 「확 / 정」으로 접혔다).
        // 그래도 넘치면 사진 위 빈자리(110~133)로 접히게 칸은 그대로 키워 둔다
        rect: [36.1, 86.9, 812, 132],
        anchor: 't',
        wrap: true,
        paras: [
          line([
            run(head[0], { size: headSize, bold: true, color: C.navy }),
            run(head[1], { size: headSize, bold: true, color: C.red }),
            run(head[2], { size: headSize, bold: true, color: C.navy }),
          ]),
        ],
      },
      {
        name: '필요자료',
        rect: [600, 232, 805, 362],
        anchor: 't',
        wrap: true,
        paras: [
          line([run('❖  실시설계 시 필요자료', { size: 11, bold: true, color: '0A304E' })]),
          { runs: [run('-  공장(건축 구조/전기) 도면', { size: 11, color: C.right })], spaceBeforePt: 9 },
          { runs: [run('-  공장 구조검토확인서', { size: 11, color: C.right })], spaceBeforePt: 9 },
          { runs: [run('※ 건축구조기술사를 통해 구조안전 검토 후 사업을 진행 합니다.', { size: 11, color: C.right })], spaceBeforePt: 30 },
        ],
      },
    ],
    picture: { name: '가배치 그림', rect: [52.4, 133.2, 571.6, 535.8], withPanels: true },
    extra: designTable(input, kw, w),
  };
}

/** 8쪽 설계 개요 표 — 예시 그림 왼쪽 아래의 표 자리(54~304, 464~534). 사진 위에 얹으니 값 칸도 흰 바탕(비우면 사진이 비친다) */
function designTable(input: ProposalInput, kw: string, w: number): string {
  const deg = (v: number) => `${v}°`;
  const WHITE = 'FFFFFF';
  const rowsXml: Cell[][] = [
    [{ text: '태양광발전 설계 개요', span: 5, bold: true, fill: 'F2F2F2' }],
    [{ text: '위치', bold: true, fill: 'F2F2F2' }, { text: input.address, span: 4, align: 'l', fill: WHITE }],
    [
      { text: '모듈각', bold: true, fill: 'F2F2F2' },
      { text: '음영각', bold: true, fill: 'F2F2F2' },
      { text: '모듈사양', bold: true, fill: 'F2F2F2' },
      { text: '모듈수량', bold: true, fill: 'F2F2F2' },
      { text: '발전용량', bold: true, fill: 'F2F2F2' },
    ],
    [
      { text: input.mount.style === 'flush' ? '지붕면' : deg(input.mount.tiltDeg), fill: WHITE },
      // 지붕면 부착형은 줄을 띄우지 않는다 — 음영각이 없다
      { text: input.mount.style === 'flush' ? '-' : deg(input.shadeDeg), fill: WHITE },
      { text: `${w}W`, fill: WHITE },
      { text: `${input.panels.toLocaleString('ko-KR')}ea`, fill: WHITE },
      { text: `${kw}kW`, fill: WHITE },
    ],
  ];
  return (
    tableXml(0, '설계 개요', emu([58, 452, 330, 528]), [54, 54, 54, 54, 56].map((v) => v * PT), [15, 15, 15, 15].map((v) => v * PT), rowsXml, {
      font: BODY,
      size: 8,
      border: { color: '7F7F7F', w: 6350 },
      margin: { x: 22_860, y: 6_350 },
    }) +
    // 각주는 사진 밑(사진 535.8 · 바닥 선 553 사이)
    textBoxXml(0, '설계 개요 각주', emu([52.4, 538, 571.6, 549]), paras('* 배치도면은 위성사진을 기준으로 작성된 가배치입니다. 실시설계 후 배치가 바뀔 수 있습니다.', { size: 7.5, color: '404040', font: BODY }), {
      anchor: 'ctr',
    })
  );
}

/** 23 마지막 쪽 — 루모라 연락처 묶음(오른쪽 아래 · 이름 491pt 부터) 위에 같은 모양으로 영업사 묶음: 이름 · 가는 선 · 연락처 */
function sellerPage(seller: Seller): PagePlan {
  return {
    masks: [],
    overlays: [
      // 칸(312pt)에 들게 글자를 줄인다 — 한 줄 칸이라 접지 않는다
      { name: '영업사', rect: [518, 416, 830, 436], anchor: 'b', paras: [line([fitRun(seller.company, 13.5, 312, { bold: true, color: 'C9CED2' })])] },
      { name: '영업사 연락처', rect: [518, 446, 830, 464], anchor: 't', paras: [line([fitRun(sellerContact(seller), 11, 312, { color: 'A9B6BF' })])] },
    ],
    extra: rectXml(0, '영업사 선', emu([518, 440, 818, 441]), '919FA7'),
  };
}

/* ------------------------------------------------------------------- 쪽 굽기 */

/** 칸 둘레의 바탕색 — 테두리 픽셀의 가운데 값(글자 · 선이 섞여도 바탕이 이긴다) */
function borderColor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const data = ctx.getImageData(sx, sy, Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h))).data;
  const W = Math.max(1, Math.floor(w));
  const H = Math.max(1, Math.floor(h));
  const samples: number[][] = [];
  const take = (i: number, j: number) => {
    const k = (j * W + i) * 4;
    samples.push([data[k], data[k + 1], data[k + 2]]);
  };
  for (let i = 0; i < W; i += 2) {
    take(i, 0);
    take(i, H - 1);
  }
  for (let j = 0; j < H; j += 2) {
    take(0, j);
    take(W - 1, j);
  }
  const mid = (c: number) => samples.map((s) => s[c]).sort((a, b) => a - b)[samples.length >> 1];
  return `rgb(${mid(0)},${mid(1)},${mid(2)})`;
}

async function renderPages(data: ArrayBuffer, masksOf: (page: number) => Rect[]): Promise<{ jpegs: Uint8Array[]; size: { cx: number; cy: number } }> {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(data) }).promise;
  try {
    if (doc.numPages !== PAGES) throw new Error(`템플릿이 바뀌었습니다 — 루모라 임대형 제안서는 ${PAGES}쪽인데 이 파일은 ${doc.numPages}쪽입니다.`);
    // 덱이 맞는가 — 4쪽 표의 머리(「구분」 · 「내용」)와 7쪽 표의 「건설기간」이 있어야 한다
    for (const [n, word] of [[4, '설치규모'], [7, '건설기간']] as const) {
      const text = (await (await doc.getPage(n)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('').replace(/\s/g, '');
      if (!text.includes(word)) throw new Error(`템플릿이 바뀌었습니다 — ${n}쪽에 「${word}」가 없습니다.`);
    }
    const jpegs: Uint8Array[] = [];
    let size = { cx: 0, cy: 0 };
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      if (n === 1) size = { cx: Math.round(base.width * PT), cy: Math.round(base.height * PT) };
      const vp = page.getViewport({ scale: SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('그림판을 열지 못했습니다.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      for (const [x0, y0, x1, y1] of masksOf(n)) {
        const [x, y, w, h] = [x0 * SCALE, y0 * SCALE, (x1 - x0) * SCALE, (y1 - y0) * SCALE];
        ctx.fillStyle = borderColor(ctx, x, y, w, h);
        ctx.fillRect(x, y, w, h);
      }
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.86));
      if (!blob) throw new Error(`${n}쪽을 굽지 못했습니다.`);
      jpegs.push(new Uint8Array(await blob.arrayBuffer()));
      page.cleanup();
    }
    return { jpegs, size };
  } finally {
    void doc.destroy();
  }
}

/* ------------------------------------------------------------------- 짓기 */

export async function fillLumora({ template, terms, input }: FillArgs): Promise<Blob | Uint8Array> {
  const kw = capacityKw(input.panels, terms.moduleWatt);
  const r = lumoraRent(kw, terms);
  const plan = lumoraPlans(r, input, terms.moduleWatt);
  const { jpegs, size } = await renderPages(template, (n) => plan[n]?.masks ?? []);

  // 쪽마다 바탕 그림 + 글상자 · 표 — 번호는 쪽 안에서 3부터(1 묶음 · 2 바탕)
  const slides: BuildSlide[] = jpegs.map((bg, i) => {
    const pp = plan[i + 1];
    if (!pp) return { background: bg, name: `${i + 1}쪽` };
    let id = 3;
    const shapes = pp.overlays.map((o) => textBoxXml(id++, o.name, emu(o.rect), o.paras, { anchor: o.anchor ?? 'ctr', wrap: o.wrap ?? false }));
    // 표 · 각주 — 지을 때 번호를 0 으로 둔 것을 차례로 매긴다
    const extra = (pp.extra ?? '').replace(/ id="0"/g, () => ` id="${id++}"`);
    return { background: bg, name: `${i + 1}쪽`, shapes: shapes.join('') + extra };
  });
  const title = `${input.customer} 루모라 지붕임대 제안서`;
  const built = await buildPptx(size, slides, title);

  // 사진 둘(4쪽 사업지 · 8쪽 가배치) — 그림 관계가 필요해 다시 열어 붙인다. 8쪽은 사진 위에 설계 개요 표가 와야 해 사진을 표 앞에 끼운다
  const deck = await Deck.open(built);
  for (const n of [4, 8]) {
    const pic = plan[n].picture!;
    const s = await deck.slide(n);
    const box = emu(pic.rect);
    const img = await input.image(box.w / box.h, pic.withPanels);
    const rid = s.addMedia(img.bytes, 'jpeg');
    s.append(pictureXml(s.nextId(), pic.name, rid, box), s.find('설계 개요') ? '설계 개요' : undefined);
  }
  return deck.save();
}

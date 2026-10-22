/**
 * 솔라쉐어바로 제안서를 채운다 — 서식 한 벌 + 값 다섯 개 → 제안서 한 벌.
 *
 * ★무엇이 바뀌고 무엇이 상수인가★ (한백 2026-10-22 「모든 가정과 발전량은 가정이라 그냥
 * 상수야 · 바뀌는 건 고객사 이름과 주소 등」 + 「용량 묶음도 바뀐다」):
 *
 *   적는 것 다섯 — 고객사명 · 주소 · 지역 · 설비용량(kW) · 연 소비가능 발전량(kWh)
 *   유도되는 것 — 모듈 장수 · 연 발전량 · 초과발전량과 비율 · 첫해 이득 · 20년 누적 ·
 *                 19번 슬라이드의 20년 손익표 160칸 전부
 *   상수 — 발전시간 · 임대단가 · 기존 단가 · 상계단가 · 전기요금 상승률 · 효율감소 · 계약기간
 *          (화면에 보이되 못 고친다 — 제안의 전제라 현장마다 흔들리면 안 된다)
 *
 * ★두 가지 길을 쓴다★
 *   · 글 속의 값(요약 문장·개요 표)은 ★글자 찾기★ — 서식에 적힌 샘플 값을 새 값으로 바꾼다.
 *   · 20년 손익표는 ★자리 찾기★ — 160칸이라 숫자가 우연히 겹친다. 글자로 바꾸면 3년차 칸과
 *     7년차 칸이 서로를 먹는다. 23줄 8칸 표를 찾아 줄·칸 번호로 쓴다.
 *
 * ★서식의 샘플 값이 열쇠다★ — 서식이 한백 것이 아니라 에이치에너지에서 실제 값(무창 현장)이
 * 적힌 채로 왔다. 이름표를 박으려면 69MB 서식을 고쳐야 하고 새 서식을 받을 때마다 또 해야 한다.
 * 그래서 샘플 값을 찾아 바꾼다 — 서식이 바뀌면 SAMPLE 을 고친다(그때 fillProposal 이 알려준다).
 */
import type JSZip from 'jszip';
import { econOf, eokLabel, kwh, manLabel, pctLabel, thousand } from './econ';
import {
  cellText, cellsOf, fillSlideXml, rowsOf, setCellText, tablesOf, type Replacements,
} from './pptx-kit';
import { parseXml } from '../survey/xml-safe';
import { packZip } from '../survey/pack';

/** 사람이 적는 다섯 */
export interface ProposalInput {
  /** (주)무창 */
  customer: string;
  /** 충남 아산시 선장면 서부남로 199-32 */
  address: string;
  /** 아산 — 요약 문장이 「<지역> <고객사> 사이트」로 쓴다 */
  region: string;
  /** 설비용량 (kW) — 위성사진 배치에서 넘어온다 */
  capacityKw: number;
  /** 연 소비가능 발전량 (kWh) — 현장 전력사용량 분석 결과 */
  selfUseKwh: number;
}

/**
 * 제안의 전제 — ★상수다★. 바꾸려면 여기를 고치고 서식도 같이 본다
 * (서식의 글에도 「140원/kWh」·「174.8원/kWh」·「연 4%」가 박혀 있다).
 */
export const PROPOSAL_CONST = {
  hoursPerDay: 3.6,
  leaseRate: 140,
  gridRate: 174.8,
  offsetRate: 112.73,
  escalation: 0.04,
  decay: 0.004,
  years: 20,
  moduleWatt: 650,
} as const;

/**
 * 서식에 적힌 샘플 값 — 찾을 글자다.
 * ★서식을 새로 받으면 여기를 맞춘다★ — 안 맞으면 fillProposal 이 「안 걸린 열쇠」로 알린다.
 */
export const SAMPLE = {
  customer: '(주)무창',
  address: '충남 아산시 선장면 서부남로 199-32',
  region: '아산',
  capacityKw: 352.95,
  selfUseKwh: 322_730,
  moduleCount: 543,
} as const;

/** 소수 둘째 자리까지 — 서식이 「352.95」로 적는다 */
const kwLabel = (kw: number): string => kw.toFixed(2);

/** 장수 — 용량을 모듈 출력으로 나눈다. 서식은 「543EA」 */
export const moduleCountOf = (kw: number, watt = PROPOSAL_CONST.moduleWatt): number =>
  Math.round((kw * 1000) / watt);

export interface ProposalNumbers {
  moduleCount: number;
  genKwh: number;
  excessKwh: number;
  excessRatio: number;
  firstYear: number;
  total: number;
  rows: ReturnType<typeof econOf>['rows'];
}

/** 입력에서 유도되는 값 전부 */
export function numbersOf(input: ProposalInput): ProposalNumbers {
  const e = econOf({
    capacityKw: input.capacityKw,
    hoursPerDay: PROPOSAL_CONST.hoursPerDay,
    selfUseKwh: input.selfUseKwh,
    leaseRate: PROPOSAL_CONST.leaseRate,
    gridRate: PROPOSAL_CONST.gridRate,
    offsetRate: PROPOSAL_CONST.offsetRate,
    escalation: PROPOSAL_CONST.escalation,
    decay: PROPOSAL_CONST.decay,
    years: PROPOSAL_CONST.years,
  });
  return {
    moduleCount: moduleCountOf(input.capacityKw),
    genKwh: e.firstGenKwh,
    excessKwh: e.rows[0]?.excessKwh ?? 0,
    excessRatio: e.excessRatio,
    firstYear: e.firstYear,
    total: e.total,
    rows: e.rows,
  };
}

/**
 * 글 속의 값 — 샘플 → 새 값.
 * ★긴 것부터 바뀐다★(pptx-kit orderOf) — 주소가 「아산」보다 먼저 걸려야 주소 안의 「아산」이
 * 두 번 바뀌지 않는다.
 */
export function replacementsOf(input: ProposalInput, n = numbersOf(input)): Replacements {
  return {
    [SAMPLE.address]: input.address,
    [SAMPLE.customer]: input.customer,
    [SAMPLE.region]: input.region,
    [kwLabel(SAMPLE.capacityKw)]: kwLabel(input.capacityKw),
    [`${SAMPLE.moduleCount}EA`]: `${n.moduleCount}EA`,
    [kwh(SAMPLE.selfUseKwh)]: kwh(input.selfUseKwh),
    /* 「30.41」 — 서식이 「(초과발전량 30.41%)」·「초과량이 30.41% 정도」로 쓴다 */
    '30.41': pctLabel(n.excessRatio).replace('%', ''),
    '738만원': manLabel(n.firstYear),
    '7.09억': eokLabel(n.total).replace(' 원', ''),
  };
}

/* ── 20년 손익표 ──────────────────────────────────────────────────────────── */

/** 그 표인가 — 첫 칸이 「년도」고 23줄 8칸이다. 자리로 찾으면 서식이 흔들릴 때 조용히 틀린다 */
function isEconTable(tbl: Element): boolean {
  const rows = rowsOf(tbl);
  if (rows.length < 3) return false;
  const head = cellsOf(rows[0]);
  return cellText(head[0] ?? rows[0]).trim() === '년도' && head.length >= 8;
}

/** 한 줄에 들어갈 글자 여덟 — 표의 칸 차례 그대로 */
export function econRowCells(r: ProposalNumbers['rows'][number]): string[] {
  return [
    String(r.year),
    kwh(r.genKwh),
    kwh(r.selfKwh),
    kwh(r.excessKwh),
    kwh(thousand(r.leaseCost)),
    kwh(thousand(r.gridCost)),
    kwh(thousand(r.saleIncome)),
    kwh(thousand(r.benefit)),
  ];
}

/** 합계 줄 — 서식이 「합 계」로 적는다 */
export function econTotalCells(rows: ProposalNumbers['rows']): string[] {
  const s = (f: (r: ProposalNumbers['rows'][number]) => number) =>
    rows.reduce((n, r) => n + f(r), 0);
  return [
    '합 계',
    kwh(s((r) => r.genKwh)),
    kwh(s((r) => r.selfKwh)),
    kwh(s((r) => r.excessKwh)),
    kwh(thousand(s((r) => r.leaseCost))),
    kwh(thousand(s((r) => r.gridCost))),
    kwh(thousand(s((r) => r.saleIncome))),
    kwh(thousand(s((r) => r.benefit))),
  ];
}

/** 표를 다시 쓴다 — 쓴 줄 수. 0 이면 그 장에 그 표가 없다 */
export function fillEconTableXml(xml: string, n: ProposalNumbers): { xml: string; rows: number } {
  const doc = parseXml(xml);
  const tbl = tablesOf(doc).find(isEconTable);
  if (!tbl) return { xml, rows: 0 };

  const rows = rowsOf(tbl);
  /* 머리 두 줄(년도/구분 · 전력구매비용…)은 그대로 두고 그 뒤부터 쓴다 */
  const body = rows.slice(2);
  let wrote = 0;
  for (let i = 0; i < body.length; i += 1) {
    const cells = cellsOf(body[i]);
    const vals =
      i < n.rows.length ? econRowCells(n.rows[i])
        : i === n.rows.length ? econTotalCells(n.rows)
          : null;
    if (!vals) break;
    for (let c = 0; c < Math.min(cells.length, vals.length); c += 1) {
      setCellText(cells[c], vals[c]);
    }
    wrote += 1;
  }
  if (wrote === 0) return { xml, rows: 0 };
  return { xml: new XMLSerializer().serializeToString(doc), rows: wrote };
}

/* ── 한 벌 채우기 ─────────────────────────────────────────────────────────── */

const SLIDE_RE = /^ppt\/(slides|notesSlides)\/(slide|notesSlide)\d+\.xml$/;

export interface ProposalResult {
  file: Blob | Uint8Array;
  /** 글자로 바꾼 문단 수 */
  hits: number;
  /** 손익표에 쓴 줄 수 — 21(20년 + 합계)이 정상 */
  econRows: number;
  /** 한 장도 안 걸린 열쇠 — 비어 있어야 한다 */
  missed: string[];
}

/**
 * 서식 한 벌을 채운다.
 *
 * ★안 걸린 열쇠를 돌려준다★ — 서식이 바뀌면 샘플 값이 그대로 남은 제안서가 나가는데,
 * 사람은 고객 이름만 보고 보낸다. 화면이 이 목록을 보고 막는다.
 */
export async function fillProposal(zip: JSZip, input: ProposalInput): Promise<ProposalResult> {
  const n = numbersOf(input);
  const r = replacementsOf(input, n);
  const keys = Object.keys(r);
  const seen = new Set<string>();

  let hits = 0;
  let econRows = 0;
  for (const name of Object.keys(zip.files).filter((x) => SLIDE_RE.test(x))) {
    let xml = await zip.file(name)!.async('string');
    let touched = false;

    /* 표를 먼저 — 글자 찾기가 표 안의 숫자를 건드리기 전에 자리로 써 둔다 */
    const t = fillEconTableXml(xml, n);
    if (t.rows > 0) {
      xml = t.xml;
      econRows += t.rows;
      touched = true;
    }

    for (const k of keys) {
      const one = fillSlideXml(xml, { [k]: r[k] });
      if (one.hits > 0) {
        xml = one.xml;
        hits += one.hits;
        seen.add(k);
        touched = true;
      }
    }
    if (touched) zip.file(name, xml);
  }

  return {
    file: await packZip(zip, 'pptx'),
    hits,
    econRows,
    missed: keys.filter((k) => !seen.has(k)),
  };
}

/** 받는 파일 이름 — 「<고객사> 솔라쉐어바로 제안서.pptx」 */
export const proposalFileName = (customer: string): string =>
  `${customer.trim() || '제안'} 솔라쉐어바로 제안서.pptx`;

/**
 * 플러그링크 패스스루 집행 글 — 매달 아지트 열린구매에 올리는 「[긴급] 플러그링크 YYYY년 M월 패스스루 집행」 긴급구매요청 글 하나를 한백이 넘긴
 * 한백사업내역리스트 엑셀로 짓는다. [순수 — 엑셀을 칸으로 읽는 것은 lib/agit/passthru-read]
 * (한백 2026-11-28 「[긴급] 플러그링크 2026년 10월 패스스루 집행 이것도 주기적으로 올리는데」 → 「차수와 지급품목은 … 한백사업내역리스트 …
 *  지급해야할 건수들은 매입내역에 있고 우리가 받아야할건 … 총 매출(원도급사기준) 노랑색 하이라이트되어있는 부분이야. 알림 시점은 매월 25일 필요.
 *  지금은 정기지급일만해」)
 *
 * 무엇인가: 플러그링크 Mother EPC 25년 환경부 사업에서 한백은 원도급사(플러그링크)에게 기성을 받아 하도급사에게 그대로 내려준다(패스스루).
 * 달마다 한 차(HB30차 = 26년 10월 · HB31차 = 26년 11월). 받는 돈은 EPC사업내역리스트의 그 차수 줄 「잔금 세금계산서」(Y — 3행 SUBTOTAL 이
 * 노랑) 합, 내려줄 돈은 매입내역의 그 차수 줄(HB31차 · HB31차_1 …)이다. ★매입내역의 거래처 「한백」 줄은 뺀다★ — 한백이 직접 시공한 현장의
 * 몫이라 나가는 돈이 아니다(10월 글: 매입내역 HB30차 줄 중 하도급사 두 곳의 줄만 「한백 → 하도급사 총」으로 섰다).
 * 숫자는 10월 글과 원 단위까지 맞췄다(30차의 받을 돈 · 지급 · 부가세 포함 셋 — 값은 저장소에 적지 않는다). EPC 의 그 차수 「금회기성」(AB) 합은
 * 매입내역의 그 차수 합(한백 줄 포함)과 같다 — 다르면 엑셀이 덜 맞춰진 것이라 짚는다(막지는 않는다).
 *
 * ★모양은 한백의 26년 10월 29일 글(HB30차) 그대로다★ — 그 글의 HTML 뼈대(h1 · 상자 · h2 · 굵게 · 그림 · cc 멘션)를 줄마다 견줬다:
 *   # [긴급] 플러그링크 2026년 10월 패스스루 집행 [#긴급구매요청](찾기 고리)
 *   > *지급 요청일: [긴급] 2026. 10. 30 (금요일)*
 *   # 1. 배경 · - 공사명 : 플러그링크 마더EPC HB30차 (패스스루) 집행
 *   # 2. 2026년 10월 패스스루 (부가세 전) · > *(플러그링크 → 한백)* · *- … 입금 예정* · *- 총 …원* · 빈 줄 · *(한백 → 하도급사)* · *- … 지급 필요* · *- 총 …원*
 *   ## 청구금액: · *부가세 전 …원* · *부가세 포함 …원* · 엑셀 캡처
 *   # *4. 긴급사유 기재* · > 플러그링크와 합의된 지급일에 지급하기 위함
 *   # *5. 미지급시 예상되는 피해 및 영향* · > 같은 줄
 *   cc @@team.finance
 * 번호에 3 이 없는 것도 그 글 그대로다. 첨부 zip 은 「HB30차 (패스스루)_26년 10월.zip」 — 구매요청간소화 엑셀(열린구매 글과 같은 틀)과 하도급사
 * 세금계산서. 그 글은 재무팀이 물어 공사하도급계약 · 기성산출물 PDF 를 나중에 따로 붙였다 — 여기서는 한백이 넘긴 증빙을 다 zip 에 넣는다.
 *
 * ★금액 · 계좌는 엑셀에서 콘솔이 읽는다 — 정산 담당이 옮겨 적지 않는다★(열린구매 · 위탁운영수수료 글과 같은 원칙). 지급일은 매입내역 「지급일」
 * (L) · 입금 예정일은 엑셀에 없어 한백이 말해야 적는다(10월은 지급 전날이었다 — 지어내지 않는다).
 * ★실제 금액 · 계좌 · 거래처는 공개 저장소에 적지 않는다★ — 시험은 지어낸 값이다.
 */
import { won } from '@/lib/format';
import { businessDayOnOrBefore, dayLabel, WEEKDAYS, weekdayOf } from '@/lib/business-days';
import type { RemindPlan } from '@/lib/agents/open-purchase';
import { AGIT_CC, AGIT_IMAGE_ALT, AGIT_IMAGE_SLOT, AGIT_PASSTHRU_KIND, AGIT_URGENT_TAG, safeName, type AgitPostText } from './post';
import type { PurchaseSheet } from './purchase-xlsx';

/** 엑셀 칸 하나의 값 — 글자 또는 숫자(날짜는 엑셀의 날 수) */
export type Cell = string | number;
/** 시트의 한 행 — 열 글자 → 값 */
export interface SheetRow {
  r: number;
  c: Record<string, Cell>;
}
/** 한백사업내역리스트에서 쓰는 두 시트 */
export interface PassthruBook {
  /** 「매입내역」 — 차수별 지급 줄 */
  purchase: SheetRow[];
  /** 「EPC사업내역리스트」 — 현장별 기성 · 세금계산서 */
  epc: SheetRow[];
}

/** 넘긴 파일 — 정산 담당 대화에 한백이 올린 것(우리 Blob 의 agent-files/…) */
export interface PassthruFile {
  url: string;
  name: string;
}

/** 한백 → 하도급사 한 줄 — 매입내역의 한 행 */
export interface PassthruPayRow {
  /** 엑셀 내용 칸 — 「HB31차_준공」(차수 · 매입내역 「구분」) */
  label: string;
  /** 거래처 */
  org: string;
  /** 구분 — 준공 · 하자보수비 · 추가공사비 … */
  what: string;
  supply: number;
  vat: number;
  bank: string | null;
  account: string | null;
  holder: string | null;
}

/** 패스스루 글의 재료 — agit_posts.passthru(migrations/0141). 승인 때 이것으로 다시 지어 본 글과 견준다 */
export interface AgitPassthruInput {
  /** 차수 — HB31차면 31 */
  round: number;
  /** 그 차의 달 'YYYY-MM' — EPC 「해당년도」 · 「해당월」(글의 「2026년 11월 패스스루」) */
  month: string;
  /** 플러그링크 → 한백(부가세 전) — EPC 그 차수 줄의 「잔금 세금계산서」 합 */
  receive: number;
  /** 플러그링크 입금 예정일 YYYY-MM-DD — 엑셀에 없어 한백이 말했을 때만 */
  inDate: string | null;
  /** 한백 → 하도급사 — 매입내역 그 차수 줄(한백 줄 빼고) */
  rows: PassthruPayRow[];
  /** 넘긴 한백사업내역리스트 — 재료의 출처(zip 에는 안 든다 — 차수 전부 · 한백 계좌까지 든 내부 장부다) */
  sheet: PassthruFile;
  /** 넘긴 증빙 — 하도급사 세금계산서 · 공사하도급계약 · 기성산출물(zip 에 그대로 든다) */
  attach: PassthruFile[];
}

/** 엑셀에서 읽은 것 — 재료(파일 빼고)와 지급일 · 짚을 것 */
export interface PassthruRead {
  round: number;
  month: string;
  receive: number;
  rows: PassthruPayRow[];
  /** 매입내역 「지급일」 — 그 차수 줄에 적힌 하나(없으면 null — 한백이 말해야 한다) */
  payDate: string | null;
  /** 뺀 한백 줄의 공급가 합 · 줄 수(참고 — 글에 안 든다) */
  own: { supply: number; rows: number };
  /** 막지 않고 짚을 것 — 계좌를 다른 줄에서 빌림 · 계좌 없음 · EPC 금회기성 합과 다름 */
  notes: string[];
}

const HANBAEK = '한백';
/** 긴급사유 · 미지급 영향 — 10월 글까지 같은 한 줄 */
export const PASSTHRU_URGENT_REASON = '플러그링크와 합의된 지급일에 지급하기 위함';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 매입내역의 열 — 머리 줄이 공급가 · 부가세 · 합계금액 셋뿐이라 자리로 읽고, 그 셋으로 모양이 그대로인지 본다 */
const P = { round: 'B', org: 'C', what: 'D', supply: 'E', vat: 'F', total: 'G', bank: 'H', account: 'I', holder: 'J', payDate: 'L' } as const;
/** EPC사업내역리스트에서 찾는 머리(빈칸을 걷고 견준다) — 「금회기성」은 둘(하도급 · 매입)이라 앞의 것 */
const EPC_HEAD = { year: '해당년도', month: '해당월', round: '차수', sub: '하도급사', receive: '잔금세금계산서', gross: '금회기성' } as const;

const pad = (n: number): string => String(n).padStart(2, '0');
const text = (v: Cell | undefined): string => (v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
/** 상호에서 회사 꼴 · 빈칸을 걷는다 — 「㈜한백」 · 「한백 」 */
const bareName = (s: string): string => s.replace(/주식회사|\(주\)|㈜|\s/g, '');
/** 숫자 칸 — 엑셀의 떠도는 소수 자리(부가세가 소수 한 자리로 저장된 칸)는 원 단위로. 빈칸 · 글자는 null */
function numOf(v: Cell | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s원]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** 엑셀의 날짜 — 날 수(1900 체계 · 25569 = 1970-01-01) 또는 「2026-11-27」 · 「2026.11.27」 글. 못 읽으면 null */
export function excelDayOf(v: Cell | undefined): string | null {
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  }
  const m = /^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/.exec(text(v));
  return m ? `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}` : null;
}

/** 매입내역의 차수 칸 → 차 번호 — 「HB31차」 · 「HB31차_1」 → 31. 소계(「HB31차 지급액」) · 그 밖은 null */
export function purchaseRoundOf(v: Cell | undefined): number | null {
  const m = /^HB\s*(\d+)\s*차(?:_\d+)?$/.exec(text(v));
  return m ? Number(m[1]) : null;
}
/** EPC 의 차수 칸 → 차 번호 — 「31차」 · 「31차_1」 → 31 */
const epcRoundOf = (v: Cell | undefined): number | null => {
  const m = /^(\d+)\s*차(?:_\d+)?$/.exec(text(v));
  return m ? Number(m[1]) : null;
};

/** 머리 줄에서 열 글자를 찾는다 — 없으면 던진다(엑셀 모양이 바뀌었다) */
function epcColumns(rows: readonly SheetRow[]): { head: number; col: Record<keyof typeof EPC_HEAD, string> } {
  for (const row of rows.slice(0, 20)) {
    const found: Partial<Record<keyof typeof EPC_HEAD, string>> = {};
    for (const [letter, v] of Object.entries(row.c).sort(([a], [b]) => a.length - b.length || a.localeCompare(b))) {
      const name = text(v).replace(/\s/g, '');
      for (const [key, want] of Object.entries(EPC_HEAD) as Array<[keyof typeof EPC_HEAD, string]>) {
        if (name === want && !found[key]) found[key] = letter;
      }
    }
    if (found.round && found.receive) {
      const missing = (Object.keys(EPC_HEAD) as Array<keyof typeof EPC_HEAD>).filter((k) => !found[k]);
      if (missing.length) throw new Error(`EPC사업내역리스트의 머리에 ${missing.map((k) => EPC_HEAD[k]).join(' · ')} 칸이 없습니다 — 엑셀 모양이 바뀌었습니다.`);
      return { head: row.r, col: found as Record<keyof typeof EPC_HEAD, string> };
    }
  }
  throw new Error('EPC사업내역리스트에서 「차수」 · 「잔금 세금계산서」 머리 줄을 찾지 못했습니다 — 한백사업내역리스트 엑셀이 맞는지 봐 주세요.');
}

/** 매입내역의 머리(2행 E · F · G)가 공급가 · 부가세 · 합계금액인가 — 아니면 열 자리가 바뀐 것이라 던진다 */
function checkPurchaseHead(rows: readonly SheetRow[]): void {
  const head = rows.find((r) => text(r.c[P.supply]).replace(/\s/g, '') === '공급가');
  const ok = head && text(head.c[P.vat]).replace(/\s/g, '') === '부가세' && text(head.c[P.total]).replace(/\s/g, '') === '합계금액';
  if (!ok) throw new Error('매입내역 시트의 머리(공급가 · 부가세 · 합계금액)를 찾지 못했습니다 — 엑셀 모양이 바뀌었습니다.');
}

/** 매입내역의 차수 — 가장 큰 차(「지금」 차) */
export function latestPassthruRound(book: PassthruBook): number | null {
  const rounds = book.purchase.map((r) => purchaseRoundOf(r.c[P.round])).filter((n): n is number => n !== null);
  return rounds.length ? Math.max(...rounds) : null;
}

/**
 * 넘긴 엑셀 → 그 차의 재료. round 를 빼면 매입내역의 가장 큰 차. 틀리면 사람 말로 던진다 — 차가 없음 · 금액 셈이 안 맞음 · 지급일이 줄마다 다름 ·
 * 소계와 다름 · 받을 돈 없음 · 내려줄 줄 없음.
 */
export function passthruReadOf(book: PassthruBook, round?: number | null): PassthruRead {
  checkPurchaseHead(book.purchase);
  const at = round ?? latestPassthruRound(book);
  if (!at) throw new Error('매입내역에서 차수(HB○○차) 줄을 찾지 못했습니다 — 한백사업내역리스트 엑셀이 맞는지 봐 주세요.');
  const tag = `HB${at}차`;

  /* 매입내역 — 그 차의 줄(HB31차 · HB31차_1 …) */
  const lines = book.purchase.filter((r) => purchaseRoundOf(r.c[P.round]) === at);
  if (lines.length === 0) throw new Error(`매입내역에 ${tag} 줄이 없습니다 — 차수를 확인해 주세요.`);
  const all = lines.map((r) => {
    const org = text(r.c[P.org]);
    const supply = numOf(r.c[P.supply]);
    const vat = numOf(r.c[P.vat]);
    const total = numOf(r.c[P.total]);
    if (!org) throw new Error(`매입내역 ${r.r}행(${tag})에 거래처가 없습니다.`);
    if (supply === null || vat === null) throw new Error(`매입내역 ${r.r}행(${org})의 공급가 · 부가세를 읽지 못했습니다.`);
    if (total !== null && Math.abs(supply + vat - total) > 1) {
      throw new Error(`매입내역 ${r.r}행(${org})의 금액이 맞지 않습니다(공급가 ${won(supply)} + 부가세 ${won(vat)} ≠ 합계 ${won(total)}).`);
    }
    return { r: r.r, org, what: text(r.c[P.what]), supply, vat, payDate: excelDayOf(r.c[P.payDate]), raw: r };
  });
  /* 소계(「HB31차 지급액」)와 견준다 — 한백 줄까지 다 더한 것 */
  const sub = book.purchase.find((r) => text(r.c[P.round]).replace(/\s/g, '') === `${tag}지급액`);
  const sum = all.reduce((s, x) => s + x.supply, 0);
  const subSupply = sub ? numOf(sub.c[P.supply]) : null;
  if (subSupply !== null && Math.abs(subSupply - sum) > 1) {
    throw new Error(`매입내역 「${tag} 지급액」(${won(subSupply)}원)과 ${tag} 줄의 합(${won(sum)}원)이 다릅니다 — 엑셀을 확인해 주세요.`);
  }
  const days = [...new Set(all.map((x) => x.payDate).filter((d): d is string => Boolean(d)))];
  if (days.length > 1) throw new Error(`매입내역 ${tag} 줄의 지급일이 다릅니다(${days.join(' · ')}) — 한 날로 맞춰 주세요.`);

  const own = all.filter((x) => bareName(x.org) === HANBAEK);
  const pay = all.filter((x) => bareName(x.org) !== HANBAEK);
  if (pay.length === 0) throw new Error(`매입내역 ${tag} 에 하도급사 줄이 없습니다(한백 줄만 있다) — 내려줄 돈이 없습니다.`);
  const notes: string[] = [];
  /* 계좌가 빈 줄은 같은 거래처의 다른 줄(가장 아래 — 최근)에서 빌린다 — 10월 HB30차_2 하자보수비 줄이 비어 한백이 손으로 채웠다 */
  const accountOf = (org: string) => [...book.purchase].reverse().find((r) =>
    bareName(text(r.c[P.org])) === bareName(org) && text(r.c[P.bank]) && /\d/.test(text(r.c[P.account])));
  const rows: PassthruPayRow[] = pay.map((x) => {
    let src = x.raw;
    if (!text(src.c[P.bank]) || !/\d/.test(text(src.c[P.account]))) {
      const other = accountOf(x.org);
      if (other) {
        notes.push(`${x.org} ${x.what || '줄'}(매입내역 ${x.r}행)에 계좌가 없어 같은 거래처의 ${text(other.c[P.round])} 줄(${other.r}행) 계좌를 썼습니다.`);
        src = other;
      } else {
        notes.push(`${x.org} ${x.what || '줄'}(매입내역 ${x.r}행)에 계좌가 없습니다 — 엑셀의 은행 · 계좌가 「-」로 빕니다.`);
      }
    }
    return {
      label: `${tag}_${x.what || '지급'}`,
      org: x.org,
      what: x.what,
      supply: x.supply,
      vat: x.vat,
      bank: text(src.c[P.bank]) || null,
      account: /\d/.test(text(src.c[P.account])) ? text(src.c[P.account]) : null,
      holder: text(src.c[P.holder]) || null,
    };
  });
  const paySum = rows.reduce((s, x) => s + x.supply, 0);
  if (paySum <= 0) throw new Error(`매입내역 ${tag} 하도급사 줄의 공급가 합이 ${won(paySum)}원입니다 — 내려줄 돈이 없습니다.`);

  /* EPC — 그 차의 줄(31차 · 31차_1 …). 받을 돈은 잔금 세금계산서 합, 달은 해당년도 · 해당월 */
  const { head, col } = epcColumns(book.epc);
  const epc = book.epc.filter((r) => r.r > head && epcRoundOf(r.c[col.round]) === at);
  if (epc.length === 0) throw new Error(`EPC사업내역리스트에 ${at}차 줄이 없습니다 — 받을 돈(잔금 세금계산서)을 셀 수 없습니다.`);
  const receive = epc.reduce((s, r) => s + (numOf(r.c[col.receive]) ?? 0), 0);
  if (receive <= 0) throw new Error(`EPC사업내역리스트 ${at}차 줄의 잔금 세금계산서 합이 ${won(receive)}원입니다 — 받을 돈이 없습니다.`);
  const gross = epc.reduce((s, r) => s + (numOf(r.c[col.gross]) ?? 0), 0);
  if (Math.abs(gross - sum) > 1) {
    notes.push(`EPC사업내역리스트 ${at}차 금회기성 합(${won(gross)}원)이 매입내역 ${tag} 합(${won(sum)}원)과 다릅니다 — 엑셀을 한 번 봐 주세요.`);
  }
  const months = [...new Set(epc.map((r) => {
    const y = /^(\d{4})/.exec(text(r.c[col.year]))?.[1];
    const m = /^(\d{1,2})\s*월?$/.exec(text(r.c[col.month]))?.[1];
    return y && m && Number(m) >= 1 && Number(m) <= 12 ? `${y}-${pad(Number(m))}` : null;
  }).filter((x): x is string => Boolean(x)))];
  if (months.length > 1) throw new Error(`EPC사업내역리스트 ${at}차 줄의 해당월이 다릅니다(${months.join(' · ')}) — 엑셀을 확인해 주세요.`);
  const month = months[0] ?? days[0]?.slice(0, 7);
  if (!month || !MONTH_RE.test(month)) throw new Error(`EPC사업내역리스트 ${at}차 줄에서 해당년도 · 해당월을 읽지 못했습니다.`);

  return {
    round: at, month, receive, rows, payDate: days[0] ?? null,
    own: { supply: own.reduce((s, x) => s + x.supply, 0), rows: own.length },
    notes,
  };
}

/** 입금 예정일 · 지급 요청일 — YYYY-MM-DD 만(빈 글 · 없으면 null) */
export function passthruDayOf(raw: unknown, what: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  if (!DAY_RE.test(raw.trim())) throw new Error(`${what}은 YYYY-MM-DD 로 줍니다.`);
  return raw.trim();
}

/* ── 글 ── */

/** 「2026년 11월」 */
const monthName = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return `${y}년 ${m}월`;
};
/** 「26년 11월」 */
export const passthruMonthName = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return `${String(y).slice(2)}년 ${m}월`;
};
/** 「2026년 11월 26일 목요일」 */
const longDay = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일 ${WEEKDAYS[weekdayOf(day)]}요일`;
};

/** 글의 공사명 — 「플러그링크 마더EPC HB31차 (패스스루) 집행」(목록 · 감사기록의 이름 — lib/agit/post agitTitleOf 가 이 줄을 읽는다) */
export const passthruTitleOf = (round: number): string => `플러그링크 마더EPC HB${round}차 (패스스루) 집행`;

/** 부가세 — 매입내역의 값 그대로 더한다(세금계산서가 하도급사마다 한 장) */
export const passthruVatOf = (input: Pick<AgitPassthruInput, 'rows'>): number => input.rows.reduce((s, r) => s + r.vat, 0);
/** 내려줄 공급가 합 */
export const passthruPayOf = (input: Pick<AgitPassthruInput, 'rows'>): number => input.rows.reduce((s, r) => s + r.supply, 0);

/** 패스스루 집행 글 — payDate 는 지급 요청일(보통 매입내역 「지급일」) */
export function agitPassthruPostOf(payDate: string, input: AgitPassthruInput): AgitPostText {
  const [y, m, d] = payDate.split('-').map(Number);
  const title = passthruTitleOf(input.round);
  const pay = passthruPayOf(input);
  const vat = passthruVatOf(input);
  const text = [
    `# [긴급] 플러그링크 ${monthName(input.month)} 패스스루 집행 ${AGIT_URGENT_TAG}`,
    `> *지급 요청일: [긴급] ${y}. ${pad(m)}. ${pad(d)} (${WEEKDAYS[weekdayOf(payDate)]}요일)*`,
    '# 1. 배경',
    `- 공사명 : ${title}`,
    `# 2. ${monthName(input.month)} 패스스루 (부가세 전)`,
    '> *(플러그링크 → 한백)*',
    `> *- ${input.inDate ? `${longDay(input.inDate)} 입금 예정` : '입금 예정일 미정'}*`,
    `> *- 총 ${won(input.receive)}원*`,
    '>',
    '> *(한백 → 하도급사)*',
    `> *- ${longDay(payDate)} 지급 필요*`,
    `> *- 총 ${won(pay)}원*`,
    '## 청구금액:',
    `*부가세 전 ${won(pay)}원*`,
    `*부가세 포함 ${won(pay + vat)}원*`,
    `![${AGIT_IMAGE_ALT}](${AGIT_IMAGE_SLOT})`,
    '# *4. 긴급사유 기재*',
    `> ${PASSTHRU_URGENT_REASON}`,
    '# *5. 미지급시 예상되는 피해 및 영향*',
    `> ${PASSTHRU_URGENT_REASON}`,
    `cc ${AGIT_CC}`,
  ].join('\n');
  return {
    payDate, kind: AGIT_PASSTHRU_KIND, title, text, total: pay, batches: input.rows.length, urgent: PASSTHRU_URGENT_REASON, blocked: null,
  };
}

/* ── 첨부 zip ── */

export interface AgitPassthruPlan {
  /** 「HB31차 (패스스루)_26년 11월.zip」 */
  zipName: string;
  /** 「플러그링크 Mother EPC 26년 11월 하도급 지급요청_261127.xlsx」 */
  xlsxName: string;
  /** 엑셀 캡처 — 글의 청구금액 밑 그림(zip 에는 안 든다 — 10월 zip 그대로) */
  imageName: string;
  sheet: PurchaseSheet;
  /** 넘긴 증빙 — 이름이 겹치면 뒤에 (2) */
  attach: PassthruFile[];
}

/** 파일 이름이 겹치면 「이름 (2).pdf」 */
function uniqueNames(files: readonly PassthruFile[]): PassthruFile[] {
  const seen = new Set<string>();
  return files.map((f) => {
    const clean = safeName(f.name) || '증빙.pdf';
    const dot = clean.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
    let name = clean;
    for (let i = 2; seen.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    seen.add(name.toLowerCase());
    return { url: f.url, name };
  });
}

/** 패스스루 글의 첨부 — 구매요청간소화 엑셀(하도급사마다 한 줄 · 세액은 매입내역 값) · 넘긴 증빙 */
export function agitPassthruBundleOf(payDate: string, input: AgitPassthruInput, madeOn: string): AgitPassthruPlan {
  const [, m] = input.month.split('-').map(Number);
  const mon = passthruMonthName(input.month);
  const base = safeName(`플러그링크 Mother EPC ${mon} 하도급 지급요청_${payDate.slice(2).replace(/-/g, '')}`);
  return {
    zipName: `${safeName(`HB${input.round}차 (패스스루)_${mon}`)}.zip`,
    xlsxName: `${base}.xlsx`,
    imageName: `${base}.png`,
    sheet: {
      subject: `${input.month.slice(0, 4)}년 플러그링크 마더EPC ${mon} 하도급 집행`,
      content: `플러그링크 마더EPC ${mon} 지급요청`,
      year: Number(payDate.slice(0, 4)),
      madeOn,
      month: m,
      rows: input.rows.map((r) => ({
        content: r.label,
        org: r.org,
        supply: r.supply,
        vat: r.vat,
        fixedVat: true,
        bank: r.bank ?? '-',
        account: r.account ?? '-',
        holder: r.holder ?? '-',
        note: '',
      })),
    },
    attach: uniqueNames(input.attach),
  };
}

/* ── 매월 25일 상신 알림 ── (한백 2026-11-28 「알림 시점은 매월 25일 필요」) */

/** 알림 날 — 매월 이날(쉬는 날이면 앞 영업일) */
export const PASSTHRU_REMIND_DAY = 25;

export interface PassthruRemindDue {
  /** 그 달 'YYYY-MM' */
  month: string;
  /** 알림 날 — 25일(쉬는 날이면 앞 영업일) */
  remindOn: string;
}

/** 알림 하나의 열쇠 — 그 달에 한 번(store/agents agentRemind) · 그 달의 패스스루 글을 아지트에 올리면 할 일이 끝난다(store/agit finishAgitPost) */
export const passthruRemindKey = (month: string): string => `pluglink-passthru:${month}`;

/**
 * 오늘 알릴 패스스루 — 그 달 25일(쉬는 날이면 앞 영업일) 아침에 한 번, 그날을 놓쳤으면 그 달 안에 늦게라도 한 번(열린구매 · 위탁운영수수료
 * 상신 알림과 같은 규칙). 지급일은 엑셀이 와야 알아서 25일에 묻는다.
 */
export function passthruRemindDue(today: string): PassthruRemindDue | null {
  const month = today.slice(0, 7);
  const remindOn = businessDayOnOrBefore(`${month}-${PASSTHRU_REMIND_DAY}`);
  return remindOn <= today ? { month, remindOn } : null;
}

/** 그날 남길 것 — 할 일 · 대화의 말 · 알림(lib/agents/remind-run → store/agents agentRemind). 모델을 부르지 않는다 */
export function passthruRemindPlan(due: PassthruRemindDue, today: string): RemindPlan {
  const title = `패스스루 집행 상신 — ${passthruMonthName(due.month)}`;
  const late = today > due.remindOn;
  return {
    key: passthruRemindKey(due.month),
    task: { title, note: '한백사업내역리스트 엑셀(매입내역 · EPC사업내역리스트)을 정산 담당 대화에', due: due.remindOn },
    say: [
      late
        ? `${passthruMonthName(due.month)} 플러그링크 패스스루 집행 상신 — 알림 날(${dayLabel(due.remindOn)})이 지났습니다. 엑셀이 준비됐으면 바로 넘겨 주세요.`
        : `${passthruMonthName(due.month)} 플러그링크 패스스루 집행 상신 — 오늘이 알림 날입니다(매월 ${PASSTHRU_REMIND_DAY}일).`,
      '이번 차수가 든 한백사업내역리스트 엑셀을 이 대화에 넘겨 주세요 — 차수 · 하도급사 지급 줄 · 플러그링크에서 받을 돈 · 지급일은 콘솔이 엑셀에서 '
        + '읽어 긴급구매요청 초안을 짓습니다. 하도급사 세금계산서 · 공사하도급계약서 PDF 도 같이 넘기면 첨부 zip 에 넣고, 플러그링크 입금 예정일도 '
        + '알려 주시면 글에 넣습니다.',
      '아지트에 올리면 이 할 일이 저절로 끝납니다.',
    ].join('\n'),
    alarm: {
      title,
      body: late
        ? `알림 날 ${dayLabel(due.remindOn)} 지남 — 한백사업내역리스트 엑셀을 정산 담당에게`
        : `오늘 ${dayLabel(due.remindOn)} — 한백사업내역리스트 엑셀을 정산 담당에게`,
    },
  };
}

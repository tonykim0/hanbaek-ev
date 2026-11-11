/**
 * 플러그링크 위탁운영수수료 글 — 매달 말 아지트 열린구매에 올리는 긴급구매요청 글 하나를 한백이 넘긴 세금계산서로 짓는다. [순수]
 * (한백 2026-11-10 「플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 > 이것도 글도 매월말에 반복되는 상신인데 자동화시키고싶어」 →
 *  「이건은 내가 에이전트한테 세금계산서를 올려주고 너가 나머지를 처리해주는 방식으로 진행 필요」)
 *
 * 무엇인가: 한백은 플러그링크 Mother EPC 구조에서 쌓인 잉여금을 나눠 처분한다. 26-01 자산양수도 · CSMS 라이선스 계약으로 플러그링크의 충전기를
 * 인수했고, 플러그링크가 그 충전기를 대행 운영한다. 달마다 세금계산서가 양방향으로 오간다 — 충전매출(한백 → 플러그링크 발행, 돈은 플러그링크
 * → 한백)과 위탁운영수수료(플러그링크 → 한백 발행, 돈은 한백 → 플러그링크 — 전기요금 · 위탁운영 비용 · 법정정기검사 수수료). 수수료가 매출보다
 * 커서 그 차이가 잉여금에서 나간다. 글은 그 달 다음 달 말일(쉬는 날이면 앞 영업일)에 나가는 수수료의 긴급구매요청이다.
 *
 * ★모양은 한백의 26년 10월 29일 글(5차 · 9월분) 그대로다★ — 그 글의 HTML 뼈대(h1 · 상자 · h2 · 굵게 · 그림 · cc 멘션)를 줄마다 견줬다:
 *   # [긴급] 플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 5차 [#긴급구매요청](찾기 고리)
 *   > *지급 요청일: [긴급]2026. 10. 30 (금)*
 *   ## 지급요청 항목
 *   > *배경 :* · 네 줄(첫 줄은 26-01 계약 글의 고리) · 빈 줄 · 「플러그링크 > 한백: 충전매출」 표 · 빈 줄 · 「한백 > 플러그링크: 위탁운영수수료」 표
 *   ## 구매 내역 · ## *부가세 전* …*원 / 부가세 포함* …*원* · 엑셀 캡처
 *   ## *긴급사유 기재* · > 매월 말 진행되는 플러그링크 Mother EPC 거래의 일부
 *   cc @@team.finance
 * 다른 것 하나: 배경 둘째 줄은 5차의 「충전기 을 플러그링크측에 대행운영」(낱말이 빠졌다) 대신 1차(6/24)의 「충전기 운영을 플러그링크측에 대행」.
 * 첨부 zip 은 5차 그대로 엑셀(구매요청간소화 양식 — 열린구매 글과 같은 틀) 하나와 플러그링크가 보낸 세금계산서 하나다(폴더 없이).
 *
 * ★금액은 세금계산서에서 콘솔이 읽는다★(lib/agit/fee-read — 담당이 옮겨 적지 않는다, 열린구매 글과 같은 원칙) · 공급자 → 공급받는자로 두 장을
 * 가른다(바뀌어 오면 짓지 않는다) · 합계 = 공급가액 + 세액이어야 짓는다. 세액은 세금계산서의 값 그대로다 — 10% 를 다시 셈하지 않는다
 * (한 달의 충전매출 세액이 공급가액의 10% 절사보다 1원 컸다 — 실제 금액은 공개 저장소에 적지 않는다).
 * 차(N차)는 달에서 센다 — 1차가 26년 1~5월분(26-06-30 지급)이었고 그 뒤로 달마다 하나다(6월분 2차 · 9월분 5차). 1차 같은 묶음 글은 짓지 않는다.
 */
import { won } from '@/lib/format';
import { today } from '@/lib/date';
import { businessDayOnOrBefore, businessDaysBefore, dayLabel, WEEKDAYS, weekdayOf } from '@/lib/business-days';
import type { RemindPlan } from '@/lib/agents/open-purchase';
import { formatAccountNo, isValidAccountNo, matchBankName, normalizeAccountNo } from '@/lib/bank-account';
import {
  AGIT_CC, AGIT_FEE_KIND, AGIT_IMAGE_ALT, AGIT_IMAGE_SLOT, AGIT_URGENT_TAG, safeName, type AgitFeePayee, type AgitPostText,
} from './post';
import type { PurchaseSheet } from './purchase-xlsx';

/** 세금계산서 한 장의 금액 */
export interface AgitInvoice {
  supply: number;
  vat: number;
  total: number;
}

/** 넘긴 파일 — 정산 담당 대화에 한백이 올린 것(우리 Blob 의 agent-files/…) */
export interface AgitFeeFile {
  url: string;
  name: string;
}

/** 위탁운영수수료 글의 재료 — agit_posts.fee(migrations/0131). 승인 때 이것으로 다시 지어 본 글과 견준다 */
export interface AgitFeeInput {
  /** 몇 월분 — 'YYYY-MM' */
  month: string;
  /** 차 — feeRoundOf(month) */
  round: number;
  /** 위탁운영수수료 — 플러그링크가 한백에 끊은 세금계산서(첨부 zip 에 든다) */
  fee: AgitInvoice & { file: AgitFeeFile };
  /** 충전매출 — 한백이 플러그링크에 끊은 세금계산서와 입금 예정일. 없는 달이면 null */
  sales: (AgitInvoice & { inDate: string | null; file: AgitFeeFile | null }) | null;
}

/** 거래처 — 엑셀의 거래처 칸 · 세금계산서의 공급자를 가를 때 */
export const FEE_PAYEE = '플러그링크';
const HANBAEK = '한백';
/** 긴급사유 — 5차까지 같은 한 줄 */
export const FEE_URGENT_REASON = '매월 말 진행되는 플러그링크 Mother EPC 거래의 일부';
/** 배경 첫 줄의 고리 — 26-01-27 한백의 「플러그링크 자산양수도 및 CSMS 라이센스 취득 계약」 글(열린구매 그룹) */
const CONTRACT_POST = 'https://team-hanbaek.agit.io/g/300450579/wall/358905929';
/** 첫 달 — 1차는 26년 1~5월분을 묶었다. 그 뒤로 달마다 한 차 */
const FIRST_MONTH = '2026-05';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number): string => String(n).padStart(2, '0');
const ymOf = (month: string): [number, number] => month.split('-').map(Number) as [number, number];

/** 차 — 2026-06 → 2 · 2026-09 → 5 · 2026-10 → 6 */
export function feeRoundOf(month: string): number {
  const [y, m] = ymOf(month);
  const [fy, fm] = ymOf(FIRST_MONTH);
  return (y - fy) * 12 + (m - fm) + 1;
}

/** 지급일 — 그 달 다음 달의 말일, 쉬는 날이면 앞 영업일(9월분 → 2026-10-30 · 10-31 이 토요일) */
export function feePayDateOf(month: string): string {
  const [y, m] = ymOf(month);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return businessDayOnOrBefore(`${ny}-${pad(nm)}-${pad(last)}`);
}

/** 「26년 9월분」 */
export const feeMonthName = (month: string): string => {
  const [y, m] = ymOf(month);
  return `${String(y).slice(2)}년 ${m}월분`;
};

/** 글의 제목(공사명 자리) — 「플러그링크 잉여금 일부 처분의 건 - 위탁운영수수료 5차」 */
export const agitFeeTitleOf = (round: number): string => `플러그링크 잉여금 일부 처분의 건 - ${AGIT_FEE_KIND} ${round}차`;

/** 「11월 27일」 */
const monthDay = (day: string): string => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일`;
};

/** 표 한 벌 — 머리 줄 · 금액 줄(칸 사이는 빈칸 넷 — 한백의 글 그대로) */
const GAP = '    ';
const tableLines = (head: string, inv: AgitInvoice, tail: string): string[] => [
  `> ${head}`,
  `> 공급가액${GAP}부가세${GAP}합계`,
  `> ${won(inv.supply)}${GAP}${won(inv.vat)}${GAP}${won(inv.total)} > ${tail}`,
];

/** 위탁운영수수료 글 — payDate 는 지급 요청일(보통 feePayDateOf) */
export function agitFeePostOf(payDate: string, input: AgitFeeInput): AgitPostText {
  const [y, m, d] = payDate.split('-').map(Number);
  const title = agitFeeTitleOf(input.round);
  const { fee, sales } = input;
  const text = [
    `# [긴급] ${title} ${AGIT_URGENT_TAG}`,
    `> *지급 요청일: [긴급]${y}. ${pad(m)}. ${pad(d)} (${WEEKDAYS[weekdayOf(payDate)]})*`,
    '## 지급요청 항목',
    '> *배경 :*',
    `> - [플러그링크 자산양수도 및 CSMS 라이센스 취득 계약](${CONTRACT_POST})을 진행`,
    '> - 플러그링크의 충전기 자산을 인수하며 충전기 운영을 플러그링크측에 대행',
    '> - 그러나 인수한 충전기의 이용률이 낮아 충전기에서 발생되는 매출보다 비용이 높음',
    '> - 이 적자를 플러그링크에 수수료 명목으로 보전, 한백이 보유하는 플러그링크 잉여금의 일부를 계속 처분 할 예정',
    ...(sales ? [
      '>',
      ...tableLines('플러그링크 > 한백: 충전매출', sales, sales.inDate ? `${monthDay(sales.inDate)} 입금 예정` : '입금 예정'),
    ] : []),
    '>',
    ...tableLines(`한백 > 플러그링크: ${AGIT_FEE_KIND}`, fee, `${monthDay(payDate)} 지급 필요`),
    '## 구매 내역',
    `## *부가세 전* ${won(fee.supply)}*원 / 부가세 포함* ${won(fee.total)}*원*`,
    `![${AGIT_IMAGE_ALT}](${AGIT_IMAGE_SLOT})`,
    '## *긴급사유 기재*',
    `> ${FEE_URGENT_REASON}`,
    `cc ${AGIT_CC}`,
  ].join('\n');
  return { payDate, kind: AGIT_FEE_KIND, title, text, total: fee.supply, batches: 1, urgent: FEE_URGENT_REASON, blocked: null };
}

/* ── 말일 상신 알림 ── (한백 2026-11-11 말일 며칠 전 「세금계산서를 넘겨 주세요」 알림 — 「yes」) */

/** 상신 기한 — 지급일의 몇 영업일 전(열린구매 상신 알림과 같은 3영업일 — lib/agents/open-purchase) */
export const FEE_REMIND_LEAD = 3;

export interface FeeRemindDue {
  /** 지급 요청일 — 이번 달 말일(쉬는 날이면 앞 영업일) */
  payDate: string;
  /** 몇 월분 — 지난달 'YYYY-MM' */
  month: string;
  round: number;
  /** 상신 기한 — 지급일의 3영업일 전 */
  deadline: string;
}

/** 알림 하나의 열쇠 — 같은 지급일은 한 번(store/agents agentRemind) · 아지트에 올리면 그 할 일이 끝난다(store/agit finishAgitPost) */
export const feeRemindKey = (payDate: string): string => `pluglink-fee:${payDate}`;

/**
 * 오늘 알릴 위탁운영수수료 — 이번 달 말일에 나가는 지난달분. 기한이 왔고(기한 ≤ 오늘) 아직 지급일 전(오늘 < 지급일)일 때만 — 기한 날 아침에
 * 한 번, 그날을 놓쳤으면 지급일 전까지 늦게라도 한 번(열린구매 상신 알림과 같은 규칙). 6월분(2차) 앞은 없다.
 */
export function feeRemindDue(today: string): FeeRemindDue | null {
  const [y, m] = ymOf(today.slice(0, 7));
  const month = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  if (feeRoundOf(month) < 2) return null;
  const payDate = feePayDateOf(month);
  const deadline = businessDaysBefore(payDate, FEE_REMIND_LEAD);
  return deadline <= today && today < payDate ? { payDate, month, round: feeRoundOf(month), deadline } : null;
}

/** 그날 남길 것 — 할 일 · 대화의 말 · 알림(lib/agents/remind-run → store/agents agentRemind). 모델을 부르지 않는다 */
export function feeRemindPlan(due: FeeRemindDue, today: string): RemindPlan {
  const [, m, d] = due.payDate.split('-').map(Number);
  const title = `${AGIT_FEE_KIND} 상신 — ${m}월 ${d}일 (${feeMonthName(due.month)} · ${due.round}차)`;
  const what = `${dayLabel(due.payDate)} 플러그링크 ${AGIT_FEE_KIND} ${due.round}차(${feeMonthName(due.month)}) 지급`;
  const late = today > due.deadline;
  return {
    key: feeRemindKey(due.payDate),
    task: { title, note: '세금계산서 두 장(위탁운영수수료 · 충전매출)을 정산 담당 대화에', due: due.deadline },
    say: [
      late
        ? `${what} — 상신 기한(${dayLabel(due.deadline)})이 지났습니다. 세금계산서가 왔으면 바로 넘겨 주세요.`
        : `${what} — 오늘이 상신 기한입니다(${FEE_REMIND_LEAD}영업일 전).`,
      '플러그링크가 보낸 위탁운영수수료 세금계산서와 한백이 끊은 충전매출 세금계산서를 이 대화에 넘겨 주세요 — 금액은 콘솔이 읽어 '
        + '긴급구매요청 초안을 짓습니다. 충전매출 입금 예정일도 알려 주시면 글에 넣습니다.',
      '아지트에 올리면 이 할 일이 저절로 끝납니다.',
    ].join('\n'),
    alarm: {
      title,
      body: late
        ? `기한 ${dayLabel(due.deadline)} 지남 — 세금계산서가 왔으면 정산 담당에게`
        : `오늘 ${dayLabel(due.deadline)}까지 — 세금계산서 두 장을 정산 담당에게`,
    },
  };
}

/* ── 세금계산서 두 장 가르기 ── */

/** 세금계산서에서 읽은 것(lib/agit/fee-read) — 못 읽은 칸은 null */
export interface TaxInvoiceRead {
  /** 공급자 상호 */
  supplier: string | null;
  /** 공급받는자 상호 */
  receiver: string | null;
  /** 작성일자 YYYY-MM-DD */
  issued: string | null;
  supply: number | null;
  vat: number | null;
  total: number | null;
  /** 품목 첫 줄 */
  item: string | null;
  /** 몇 월분 YYYY-MM — 품목의 「9월분」(해는 작성일자의 해) */
  month: string | null;
}

/** 상호에서 회사 꼴(주식회사 · (주) · ㈜) · 빈칸을 걷는다 */
const bareName = (s: string | null): string => (s ?? '').replace(/주식회사|\(주\)|㈜|\s/g, '');
const fromTo = (r: TaxInvoiceRead): string => `${r.supplier ?? '공급자 못 읽음'} → ${r.receiver ?? '공급받는자 못 읽음'}`;
const isFrom = (r: TaxInvoiceRead, from: string, to: string): boolean =>
  bareName(r.supplier).includes(from) && bareName(r.receiver).includes(to);

/** 금액 셋이 맞는가 — 합계 = 공급가액 + 세액 · 세액이 공급가액의 10% 언저리(품목마다 끊어 더한 차이까지) */
function invoiceOf(r: TaxInvoiceRead, what: string): AgitInvoice {
  const { supply, vat, total } = r;
  if (supply === null || vat === null || total === null || supply <= 0) {
    throw new Error(`${what} 세금계산서의 공급가액 · 세액 · 합계를 다 읽지 못했습니다 — 파일을 다시 올려 주세요.`);
  }
  if (supply + vat !== total) {
    throw new Error(`${what} 세금계산서의 금액이 맞지 않습니다(공급가액 ${won(supply)} + 세액 ${won(vat)} ≠ 합계 ${won(total)}) — 파일을 확인해 주세요.`);
  }
  if (Math.abs(vat - supply / 10) > 10) {
    throw new Error(`${what} 세금계산서의 세액 ${won(vat)}원이 공급가액 ${won(supply)}원의 10%와 다릅니다 — 파일을 확인해 주세요.`);
  }
  return { supply, vat, total };
}

/**
 * 넘긴 세금계산서 두 장 → 글의 금액 · 달. 위탁운영수수료는 플러그링크 → 한백, 충전매출은 한백 → 플러그링크여야 한다(바뀌어 오면 짓지 않는다).
 * month 를 주면 그 달(세금계산서에서 달을 못 읽었을 때 · 한백이 말했을 때) — 세금계산서의 달과 다르면 짓지 않는다. 틀리면 사람 말로 던진다.
 */
export function feeInvoicesOf(
  fee: TaxInvoiceRead,
  sales: TaxInvoiceRead | null,
  month?: string | null
): { month: string; fee: AgitInvoice; sales: AgitInvoice | null } {
  if (!isFrom(fee, FEE_PAYEE, HANBAEK)) {
    throw new Error(isFrom(fee, HANBAEK, FEE_PAYEE)
      ? '위탁운영수수료 자리에 온 것은 한백이 플러그링크에 끊은 세금계산서(충전매출)입니다 — 두 파일을 바꿔 주세요.'
      : `위탁운영수수료 세금계산서가 아닙니다(${fromTo(fee)}) — 플러그링크가 한백에 끊은 것이어야 합니다.`);
  }
  if (sales && !isFrom(sales, HANBAEK, FEE_PAYEE)) {
    throw new Error(`충전매출 세금계산서가 아닙니다(${fromTo(sales)}) — 한백이 플러그링크에 끊은 것이어야 합니다.`);
  }
  const given = month?.trim() || null;
  if (given && !MONTH_RE.test(given)) throw new Error('몇 월분인지는 YYYY-MM 으로 줍니다.');
  if (given && fee.month && given !== fee.month) {
    throw new Error(`세금계산서는 ${feeMonthName(fee.month)}인데 ${feeMonthName(given)}로 지으라고 했습니다 — 파일을 확인해 주세요.`);
  }
  const at = given ?? fee.month;
  if (!at || !MONTH_RE.test(at)) throw new Error('위탁운영수수료 세금계산서에서 몇 월분인지 읽지 못했습니다 — 한백에게 몇 월분인지 묻고 month 로 줍니다.');
  if (sales?.month && sales.month !== at) {
    throw new Error(`두 세금계산서의 달이 다릅니다(위탁운영수수료 ${feeMonthName(at)} · 충전매출 ${feeMonthName(sales.month)}) — 파일을 확인해 주세요.`);
  }
  if (feeRoundOf(at) < 2) throw new Error('26년 6월분부터 짓습니다 — 1차(1~5월분)는 묶어 올린 글이었습니다.');
  return { month: at, fee: invoiceOf(fee, '위탁운영수수료'), sales: sales ? invoiceOf(sales, '충전매출') : null };
}

/** 입금 예정일 — YYYY-MM-DD 만(빈 글 · 없으면 null) */
export function feeInDateOf(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  if (!DAY_RE.test(raw.trim())) throw new Error('충전매출 입금 예정일은 YYYY-MM-DD 로 줍니다.');
  return raw.trim();
}

/* ── 받는 곳(플러그링크 계좌) ── */

/**
 * 받는 곳이 비었을 때의 말 — 올리기 · 첨부 받기가 던진다(카드의 단추 이름은 「플러그링크 계좌 미지정 — 올릴 수 없음」). 계좌는 고정값이라 화면이
 * 없다 — Claude Code 가 DB 에 넣는다(한백 2026-11-11 「이건 UI에 안넣고 그냥 DB에 넣어서 고정으로」)
 */
export const FEE_PAYEE_MISSING = '플러그링크 계좌 미지정 — 콘솔 DB 에 고정값이 없습니다. Claude Code 에 넣어 달라고 해 주세요.';

/**
 * 받는 곳 — 은행은 목록의 이름으로(「우리」 → 우리은행) · 계좌는 숫자만 · 예금주는 그대로. 틀리면 사람 말로 던진다.
 * ★값은 DB 에만 — 저장소가 공개라 코드 · 마이그레이션에 적지 않는다★ · 화면 · API 도 없다(고정값 — 바뀌면 Claude Code 가 고친다)
 */
export function agitFeePayeeOf(raw: { bank?: unknown; account?: unknown; holder?: unknown }): AgitFeePayee {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const bank = matchBankName(text(raw.bank));
  if (!bank) throw new Error(`은행 이름을 모릅니다 — ${text(raw.bank) || '빈칸'}`);
  const account = normalizeAccountNo(text(raw.account));
  if (!isValidAccountNo(account)) throw new Error('계좌번호는 숫자 8~16자리입니다.');
  const holder = text(raw.holder).replace(/\s+/g, ' ');
  if (!holder || holder.length > 40) throw new Error('예금주를 40자 안으로 넣어 주세요.');
  return { bank, account, holder };
}

/** 받는 곳을 보이는 글(감사기록) — 계좌는 끝 넉 자리만 */
export const feePayeeLabel = (p: AgitFeePayee): string => `${p.bank} ****${p.account.slice(-4)} · ${p.holder}`;

/* ── 첨부 zip ── */

export interface AgitFeePlan {
  /** 「플러그링크 잉여금 처분_위탁운영수수료 5차_261030.zip」 */
  zipName: string;
  /** 「플러그링크 Mother EPC 잉여금처분_위탁운영수수료 5차.xlsx」 */
  xlsxName: string;
  /** 엑셀 캡처 — 글의 구매 내역 그림(zip 에는 안 든다 · 5차 그대로) */
  imageName: string;
  sheet: PurchaseSheet;
  /** 플러그링크의 위탁운영수수료 세금계산서 — 넘긴 파일 이름 그대로 */
  invoice: { name: string; url: string };
}

/** 위탁운영수수료 글의 첨부 — 엑셀(한 줄 · 세액은 세금계산서 값) · 세금계산서 */
export function agitFeeBundleOf(payDate: string, input: AgitFeeInput, payee: AgitFeePayee, madeOn: string = today()): AgitFeePlan {
  const [y, m] = ymOf(input.month);
  const yy = String(y).slice(2);
  const base = safeName(`플러그링크 Mother EPC 잉여금처분_${AGIT_FEE_KIND} ${input.round}차`);
  return {
    zipName: `${safeName(`플러그링크 잉여금 처분_${AGIT_FEE_KIND} ${input.round}차_${payDate.slice(2).replace(/-/g, '')}`)}.zip`,
    xlsxName: `${base}.xlsx`,
    imageName: `${base}.png`,
    sheet: {
      subject: `${FEE_PAYEE} ${AGIT_FEE_KIND} ${yy}년 ${m}월분`,
      content: AGIT_FEE_KIND,
      year: Number(payDate.slice(0, 4)),
      madeOn,
      /* 해당 청구 月 — 몇 월분(한백의 5차 엑셀도 9월분에 9) · 한백 2026-11-11 「actual month」 */
      month: m,
      rows: [{
        content: `${yy}년 ${m}월분 ${AGIT_FEE_KIND}`,
        org: FEE_PAYEE,
        supply: input.fee.supply,
        vat: input.fee.vat,
        fixedVat: true,
        bank: payee.bank,
        account: formatAccountNo(payee.bank, payee.account),
        holder: payee.holder,
        note: '',
      }],
    },
    invoice: { name: safeName(input.fee.file.name) || '세금계산서.pdf', url: input.fee.file.url },
  };
}

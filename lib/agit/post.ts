/**
 * 아지트 열린구매 글 — 결제일 하나의 글을 콘솔의 거래명세서(배치)로 짓는다. [순수]
 * (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — team-hanbaek.agit.io)
 *
 * 한백이 고른 것(같은 날, 미리보기를 보고):
 *   · 글 하나 = 결제일 하나 — 그날 나가는 배치(지급처 × 구분) 전부가 한 글의 줄이 된다.
 *   · 올리는 때 = 한백이 거래명세서 화면에서 「아지트에 올리기」를 누를 때. ★그때 콘솔의 지금 금액으로 다시 짓는다★ — 미리보기 뒤에
 *     금액이 바뀌었으면 올리지 않는다(store/agit · app/api/agit/posts). 11-05 아침 상신 알림이 에코일렉 89,040,000원을 적은 뒤
 *     같은 날 대당 +10만으로 96,460,000원이 됐다 — 아침에 저절로 올렸다면 옛 금액이 아지트에 남았다.
 *
 * ★글은 아지트 「요청」 글로 올린다 — 담당자를 붙여★(한백 2026-11-08 「아지트 글에서 담당자 설정도 필요해」 → 요청 글 담당자 칸 ·
 * 한 번 정해 두기). 웹훅 가이드(아지트 연동 설정의 「사용법 알아보기」, 한백이 붙여 줌): {"text", "task": {"assignees": [아지트 ID…]}}
 * 를 보내면 요청 글이 서고, 상태(0 요청 · 1 진행 · 2 완료 · 3 승인)는 아지트에서 담당자가 바꾼다. 기한 칸은 가이드에 없다.
 *
 * 아지트 웹훅은 글자만 받는다(파일을 못 붙인다) — 세금계산서 · 사업자등록증 · 통장사본은 「있음/없음」만 적고, 거래명세서는 콘솔 주소다.
 * 부가세는 배치마다 공급가액의 10%(원 단위 절사)를 더한다 — 세금계산서가 배치마다 한 장이라 그 합이 계산서 합과 맞는다.
 */
import { won } from '@/lib/format';
import { batchesOf, batchKey, REGULAR_PAY_DAYS } from '@/lib/payout-board';
import type { BatchFinal, PayoutKind, PayoutRow, TaxInvoice } from '@/types/project';

/** 지급처의 계좌 — 협력사 정보(/settings · /admin/partners)의 값 */
export interface AgitPayee {
  bankName: string | null;
  bankAccountNo: string | null;
  bankHolder: string | null;
}

/** 배치의 원장 한 줄 — 회차(1차 · 2차 …)와 그 현장의 대수 */
export interface AgitLine {
  projectId: string;
  label: string;
  amount: number;
  qty: number;
}

export interface AgitBatch {
  org: string | null;
  kind: PayoutKind;
  total: number;
  invoice: boolean;
  lines: AgitLine[];
}

export interface AgitPostText {
  payDate: string;
  /** 글의 첫 줄 — 화면의 목록에도 쓴다 */
  title: string;
  text: string;
  /** 공급가액 합계 */
  total: number;
  batches: number;
  /** 올릴 수 없는 까닭 — 단추 이름이 된다(화면 규칙 3). null 이면 올릴 수 있다 */
  blocked: string | null;
}

export const VAT_RATE = 0.1;
/** 부가세 — 공급가액의 10%, 원 단위 절사(세금계산서가 그렇게 끊는다) */
export const vatOf = (supply: number): number => Math.floor(supply * VAT_RATE);

/** 회차 — 현장 수 · 대수로 적는다. 그 밖(회수)은 건수 · 금액으로 적는다 */
const STEP_ORDER = ['1차', '2차', '선금', '차액'];

/** 「11/10」 */
export const shortDay = (day: string): string => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
};

/** 정기결제(10일 · 25일)인가 — 다른 날을 골라 가확정한 배치도 있다 */
const isRegular = (day: string): boolean => (REGULAR_PAY_DAYS as readonly string[]).includes(day.slice(8, 10));

/** 「영업비 1차 · 20개 현장 106기」 — 회차가 섞이면 「 / 」로 잇는다 */
export function detailOf(kind: PayoutKind, lines: readonly AgitLine[]): string {
  const labels = [...new Set(lines.map((l) => l.label))].sort((a, b) => {
    const ia = STEP_ORDER.indexOf(a);
    const ib = STEP_ORDER.indexOf(b);
    return (ia < 0 ? STEP_ORDER.length : ia) - (ib < 0 ? STEP_ORDER.length : ib) || a.localeCompare(b, 'ko');
  });
  const parts = labels.map((label) => {
    const mine = lines.filter((l) => l.label === label);
    if (!STEP_ORDER.includes(label)) {
      return `${label} · ${mine.length}건 ${won(mine.reduce((n, l) => n + l.amount, 0))}원`;
    }
    /* 한 현장이 같은 회차로 두 줄이어도 현장 · 대수는 한 번 센다 */
    const sites = new Map(mine.map((l) => [l.projectId, l.qty]));
    const qty = [...sites.values()].reduce((n, q) => n + q, 0);
    return `${label} · ${sites.size}개 현장${qty > 0 ? ` ${qty}기` : ''}`;
  });
  return `${kind} ${parts.join(' / ')}`;
}

/** 「계좌 국민은행 123-45 (예금주 에코일렉) · 세금계산서 없음」 */
function accountOf(payee: AgitPayee | undefined, invoice: boolean): string {
  const bank = payee
    ? [payee.bankName, payee.bankAccountNo, payee.bankHolder && `(예금주 ${payee.bankHolder})`].filter(Boolean).join(' ')
    : '';
  return `계좌 ${bank || '미등록'} · 세금계산서 ${invoice ? '있음' : '없음'}`;
}

/**
 * 결제일 하나의 글. batches 는 그 결제일의 배치만 넘긴다. payees 는 지급처(lib/roles normalizeOrg 로 고른 이름)의 계좌.
 * 배치 차례는 지급처 가나다 · 영업비 먼저 — 거래명세서 목록과 같다.
 */
export function agitPostOf(
  payDate: string,
  batches: readonly AgitBatch[],
  payeeOf: (org: string | null) => AgitPayee | undefined,
  consoleUrl: string
): AgitPostText {
  const sorted = [...batches].sort((a, b) =>
    (a.org ?? '').localeCompare(b.org ?? '', 'ko') || a.kind.localeCompare(b.kind, 'ko'));
  const total = sorted.reduce((n, b) => n + b.total, 0);
  const vat = sorted.reduce((n, b) => n + vatOf(b.total), 0);
  const title = `[열린구매] ${shortDay(payDate)} ${isRegular(payDate) ? '정기결제' : '지급'} — 협력사 지급 ${sorted.length}건`;
  const items = sorted.flatMap((b, i) => [
    `${i + 1}) ${b.org ?? '지급처 미정'} · ${b.kind} · ${won(b.total)}원`,
    `   ${detailOf(b.kind, b.lines)}`,
    `   ${accountOf(payeeOf(b.org), b.invoice)}`,
  ]);
  const text = [
    title,
    '',
    ...items,
    '',
    `공급가액 합계 ${won(total)}원`,
    `부가세 ${won(vat)}원 · 합계 ${won(total + vat)}원`,
    `거래명세서 ${consoleUrl}/statements`,
  ].join('\n');
  const blocked = sorted.length === 0
    ? '지급 0건 — 올릴 것 없음'
    : sorted.some((b) => !b.org)
      ? '지급처 미정 배치 — 올릴 수 없음'
      : null;
  return { payDate, title, text, total, batches: sorted.length, blocked };
}

/** 글을 올릴 결제일 — 오늘이거나 앞으로 올 지급일(지난 지급일의 글은 늦었다) · 이른 것이 위 */
export function upcomingPayDates(today: string, payDates: readonly string[]): string[] {
  return [...new Set(payDates)].filter((d) => d >= today).sort();
}

/**
 * 아지트 웹훅 주소인가 — https://agit.io/webhook/<토큰> 하나뿐이다. 맞으면 다듬은 주소, 아니면 null.
 * 서버가 이 주소로 요청을 보내므로 다른 곳(우리 망 안 · 다른 누리집)을 부르게 두지 않는다.
 */
export function agitWebhookOf(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'agit.io' || url.port || url.username || url.password) return null;
  if (url.search || url.hash) return null;
  if (!/^\/webhook\/[A-Za-z0-9-]{8,80}$/.test(url.pathname)) return null;
  return `https://agit.io${url.pathname}`;
}

/**
 * 앞으로 올 결제일마다 한 글 — 거래명세서 화면과 같은 재료(원장 줄 · 확정 · 계산서)로 짓는다. 배치를 묶는 규칙은 lib/payout-board
 * batchesOf 한 곳이고(거래명세서 목록 · 할 일과 같다), 회차의 현장 · 대수는 원장 줄에서 센다.
 */
export function agitDraftsOf(
  today: string,
  rows: readonly PayoutRow[],
  finals: readonly BatchFinal[],
  invoices: readonly TaxInvoice[],
  payeeOf: (org: string | null) => AgitPayee | undefined,
  consoleUrl: string,
  only?: string
): AgitPostText[] {
  const batches = batchesOf([...rows], [...finals], [...invoices]);
  const lines = new Map<string, AgitLine[]>();
  for (const r of rows) {
    const key = batchKey(r.paidAt, r.org, r.kind);
    lines.set(key, [...(lines.get(key) ?? []), { projectId: r.projectId, label: r.label, amount: r.amount, qty: r.site.qty }]);
  }
  const days = only ? [only] : upcomingPayDates(today, batches.map((b) => b.paidAt));
  return days.map((day) => agitPostOf(
    day,
    batches.filter((b) => b.paidAt === day).map((b) => ({
      org: b.org, kind: b.kind, total: b.total, invoice: Boolean(b.invoice), lines: lines.get(batchKey(b.paidAt, b.org, b.kind)) ?? [],
    })),
    payeeOf,
    consoleUrl
  ));
}

/** 아지트 연결 — 주소(열쇠)는 싣지 않는다 */
export interface AgitHookInfo {
  connectedBy: string;
  connectedAt: string;
  /** 요청 글의 담당자 — 아지트 ID. 비면 올리지 못한다(「담당자 미지정」) */
  assignees: string[];
}

/** 요청 담당자는 이만큼까지 — 가이드는 여럿을 받는다고만 적었다 */
export const AGIT_MAX_ASSIGNEES = 5;

/**
 * 아지트 ID 는 영문 · 숫자 · 점, 20자까지(아지트 안내서 「아지트 ID가 중요한 이유」 — kiko.x · jason.new 꼴).
 * 쉼표 · 띄어쓰기로 여럿을 받고 앞의 @ 는 뗀다(멘션으로 적는 버릇). 같은 ID 는 한 번. 하나라도 틀리면 null — 무엇이 틀렸는지는
 * 부르는 쪽이 badAgitIds 로 짚는다. 빈 글은 [](담당자 비우기).
 */
const AGIT_ID_RE = /^[A-Za-z0-9.]{1,20}$/;

const agitIdTokens = (raw: string): string[] =>
  raw.split(/[\s,]+/).map((s) => s.replace(/^@+/, '')).filter(Boolean);

export function badAgitIds(raw: string): string[] {
  return agitIdTokens(raw).filter((s) => !AGIT_ID_RE.test(s));
}

export function agitAssigneesOf(raw: string): string[] | null {
  const ids = agitIdTokens(raw);
  if (ids.some((s) => !AGIT_ID_RE.test(s))) return null;
  const seen = new Set<string>();
  const out = ids.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out.length > AGIT_MAX_ASSIGNEES ? null : out;
}

/** 웹훅에 보내는 몸 — 담당자가 있으면 요청 글(task), 없으면 보통 글. 라우트는 담당자 없이 부르지 않는다 */
export function agitPayloadOf(text: string, assignees: readonly string[]): { text: string; task?: { assignees: string[] } } {
  return assignees.length ? { text, task: { assignees: [...assignees] } } : { text };
}

/** 담당자를 보이는 글 — 「@kiko.x · @ella.a」 */
export const assigneesLabel = (ids: readonly string[]): string => ids.map((s) => `@${s}`).join(' · ');

export const AGIT_POST_STATUSES = ['sending', 'posted', 'failed'] as const;
export type AgitPostStatus = (typeof AGIT_POST_STATUSES)[number];

/** 올린 글 한 줄 — 화면은 결제일마다 마지막 것을 보인다 */
export interface AgitPostRecord {
  id: string;
  payDate: string;
  status: AgitPostStatus;
  title: string;
  total: number;
  batches: number;
  error: string | null;
  postedBy: string;
  /** 그 글에 붙인 요청 담당자(아지트 ID) — 담당자를 바꾼 뒤에도 그때의 사람이 남는다 */
  assignees: string[];
  /** 올린 때(못 올렸으면 누른 때) — 'YYYY-MM-DD HH:mm' 한국 시각 */
  at: string;
}

/** 올린 뒤 정산 담당 대화에 남는 한 줄(자동) */
export function agitPostedSay(post: Pick<AgitPostText, 'payDate' | 'title' | 'total' | 'batches'>, by: string): string {
  const [, m, d] = post.payDate.split('-').map(Number);
  return [
    `${m}월 ${d}일 ${isRegular(post.payDate) ? '정기결제' : '지급'} 열린구매 글을 아지트에 올렸습니다 — 지급 ${post.batches}건 · 공급가액 ${won(post.total)}원 (${by}).`,
    post.title,
  ].join('\n');
}

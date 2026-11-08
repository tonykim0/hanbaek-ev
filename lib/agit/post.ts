/**
 * 아지트 열린구매 글 — 결제일 하나의 글을 콘솔의 거래명세서(배치)로 짓는다. [순수]
 * (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — team-hanbaek.agit.io)
 *
 * 한백이 고른 것(같은 날, 미리보기를 보고):
 *   · 글 하나 = 결제일 하나 — 그날 나가는 배치(지급처 × 구분) 전부가 한 글의 줄이 된다.
 *   · 올리는 때 = 한백이 승인할 때. ★그때 콘솔의 지금 금액으로 다시 짓는다★ — 초안 뒤에 금액이 바뀌었으면 올리지 않고 초안을
 *     새 금액으로 고친다(store/agit · app/api/agit/posts/[id]). 11-05 아침 상신 알림이 에코일렉 89,040,000원을 적은 뒤
 *     같은 날 대당 +10만으로 96,460,000원이 됐다 — 아침에 저절로 올렸다면 옛 금액이 아지트에 남았다.
 *   · ★정산 담당이 한다★(한백 2026-11-08 「이걸 정산담당 에이전트가 처리해야하는거야」 → 「정산담당 에이전트가 때가 되면 초안을
 *     올려주고, 내가 승인하면 정산담당에이전트가 아지트에 글을 올리는 구조」) — 결제일 3영업일 전 아침 크론이 상신 알림과 함께
 *     초안을 정산 담당 대화에 올리고(lib/agents/remind-run), 한백이 대화에서 시키면 담당이 agit_post 로 올린다(lib/agents/brain).
 *     한백이 초안 카드의 「승인하고 올리기」를 누르면 정산 담당 이름으로 아지트에 올라간다(메일 초안과 같은 길).
 *
 * ★글은 아지트 「요청」 글로 올린다 — 담당자를 붙여★(한백 2026-11-08 「아지트 글에서 담당자 설정도 필요해」 → 요청 글 담당자 칸 ·
 * 한 번 정해 두기). 웹훅 가이드(아지트 연동 설정의 「사용법 알아보기」, 한백이 붙여 줌): {"text", "task": {"assignees": [아지트 ID…]}}
 * 를 보내면 요청 글이 서고, 상태(0 요청 · 1 진행 · 2 완료 · 3 승인)는 아지트에서 담당자가 바꾼다. 기한 칸은 가이드에 없다.
 *
 * ★글은 한백이 올려 온 양식 그대로다★(2026-11-08 — 아지트의 지난 「… 영업위탁 수수료 N차」 글을 읽고 맞췄다): 첫 줄 제목 + #구매요청간소화 ·
 * 지급 요청일 · 1. 구매사유(공사명 · 상황설명) · 2. 지급요청 품목(부가세 전 / 포함 + 배치 줄) · 참고자료(지급처마다 거래명세서 주소) ·
 * cc @@team.finance. 이름은 「전달 N월 … 1차」(10일) · 「2차」(25일) — 한 달 일의 수수료를 다음 달 두 번에 나눠 낸다. 계좌는 본문에 적지
 * 않는다 — 첨부 엑셀(구매요청간소화 양식)에만 있다. 글양식은 「구매요청간소화」(웹훅 task.template_name).
 *
 * 아지트 웹훅은 글자만 받는다(파일을 못 붙인다) — 엑셀 · 거래명세서 PDF · 세금계산서는 콘솔이 zip 하나로 묶고(lib/agit/bundle · 정산 담당
 * 카드의 「첨부 파일 받기」) 한백이 받아 그 글에 붙인다.
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
  /** 붙은 세금계산서 파일 — 첨부 zip 에 넣는다 */
  invoiceFile?: { url: string; name: string } | null;
  lines: AgitLine[];
}

/** 글양식 — 열린구매 그룹의 「구매요청간소화」(웹훅 task.template_name · 글 머리의 꼬리표) */
export const AGIT_TEMPLATE = '구매요청간소화';
/** 재무팀 — 지난 글이 끝에 달던 cc(아지트 팀 멘션) */
export const AGIT_CC = '@@team.finance';

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

/** 배치 차례 — 지급처 가나다 · 같은 지급처면 영업비 먼저(제목이 「영업위탁 수수료 및 시공비」 차례다 — 가나다로는 시공비가 앞선다) */
export const sortBatches = <T extends { org: string | null; kind: PayoutKind }>(batches: readonly T[]): T[] =>
  [...batches].sort((a, b) => (a.org ?? '').localeCompare(b.org ?? '', 'ko')
    || (a.kind === b.kind ? 0 : a.kind === '영업비' ? -1 : 1));

const WEEKDAY_NAMES = '일월화수목금토';

/**
 * 결제일의 요청 이름 — 지난 글의 이름 짓기: 한 달 일의 수수료를 다음 달 10일(1차) · 25일(2차)에 낸다.
 *   2026-11-10 → 「26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차」 · 시공비가 섞이면 「… 영업위탁 수수료 및 시공비 1차」
 *   정기결제가 아닌 날(다른 날을 골라 가확정) → 「… 영업위탁 수수료 (11월 17일 지급)」
 */
export function requestNameOf(payDate: string, kinds: readonly PayoutKind[]) {
  const [y, m, d] = payDate.split('-').map(Number);
  const wy = m === 1 ? y - 1 : y;
  const wm = m === 1 ? 12 : m - 1;
  const month = `${String(wy).slice(2)}년 ${wm}월`;
  const sales = kinds.includes('영업비');
  const cons = kinds.includes('시공비');
  const what = sales && cons ? '영업위탁 수수료 및 시공비' : cons ? '시공비' : '영업위탁 수수료';
  const day = String(d).padStart(2, '0');
  const round = day === REGULAR_PAY_DAYS[0] ? '1차' : day === REGULAR_PAY_DAYS[1] ? '2차' : null;
  const tail = round ?? `(${m}월 ${d}일 지급)`;
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return {
    /** 「26년 10월」 — 일한 달 */
    month,
    /** 「1차」 · 「2차」 · 정기결제가 아니면 null */
    round,
    /** 「영업위탁 수수료」 · 「시공비」 · 「영업위탁 수수료 및 시공비」 */
    what,
    /** 공사명 — 「26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차」 */
    subject: `${month} 전기차 충전 인프라 구축사업 ${what} ${tail}`,
    /** 상황설명 */
    situation: `${month} 동안 진행된 전기차 충전기 설치 ${sales && cons ? '영업 · 시공' : cons ? '시공' : '영업'}에 대한 ${what} ${tail}`,
    /** 「2026. 11. 10 (화요일)」 */
    requestDay: `${y}. ${String(m).padStart(2, '0')}. ${day} (${weekday}요일)`,
  };
}

/** 그 배치의 거래명세서(콘솔) 주소 — 지난 글이 달던 꼴(/payments/statement?org=…&date=…&kind=…) */
export const statementPathOf = (payDate: string, org: string, kind: PayoutKind): string =>
  `/payments/statement?org=${encodeURIComponent(org)}&date=${payDate}&kind=${encodeURIComponent(kind)}`;

/**
 * 결제일 하나의 글. batches 는 그 결제일의 배치만 넘긴다. 배치 차례는 지급처 가나다 · 영업비 먼저 — 거래명세서 목록과 같다.
 */
export function agitPostOf(payDate: string, batches: readonly AgitBatch[], consoleUrl: string): AgitPostText {
  const sorted = sortBatches(batches);
  const total = sorted.reduce((n, b) => n + b.total, 0);
  const vat = sorted.reduce((n, b) => n + vatOf(b.total), 0);
  const name = requestNameOf(payDate, sorted.map((b) => b.kind));
  const title = `${name.subject} #${AGIT_TEMPLATE}`;
  const items = sorted.map((b) =>
    `- ${b.org ?? '지급처 미정'} · ${detailOf(b.kind, b.lines)} · ${won(b.total)}원${b.invoice ? '' : ' · 세금계산서 없음'}`);
  const links = sorted.filter((b) => b.org).flatMap((b, i) => [
    ...(i ? [''] : []),
    `${b.org}${sorted.filter((x) => x.org === b.org).length > 1 ? ` (${b.kind})` : ''}`,
    `${consoleUrl}${statementPathOf(payDate, b.org!, b.kind)}`,
  ]);
  const text = [
    title,
    `지급 요청일: ${name.requestDay}`,
    '1. 구매사유',
    `- 공사명 : ${name.subject}`,
    `- 상황설명 : ${name.situation}`,
    '2. 지급요청 품목',
    `부가세 전 ${won(total)} / 부가세 포함 ${won(total + vat)}`,
    ...items,
    '참고자료',
    '거래명세서 내역',
    ...links,
    `cc ${AGIT_CC}`,
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
export function agitBatchesOf(
  rows: readonly PayoutRow[],
  finals: readonly BatchFinal[],
  invoices: readonly TaxInvoice[],
  payDate: string
): AgitBatch[] {
  const lines = new Map<string, AgitLine[]>();
  for (const r of rows) {
    if (r.paidAt !== payDate) continue;
    const key = batchKey(r.paidAt, r.org, r.kind);
    lines.set(key, [...(lines.get(key) ?? []), { projectId: r.projectId, label: r.label, amount: r.amount, qty: r.site.qty }]);
  }
  return batchesOf([...rows], [...finals], [...invoices]).filter((b) => b.paidAt === payDate).map((b) => ({
    org: b.org, kind: b.kind, total: b.total, invoice: Boolean(b.invoice),
    invoiceFile: b.invoice ? { url: b.invoice.blobUrl, name: b.invoice.filename } : null,
    lines: lines.get(batchKey(b.paidAt, b.org, b.kind)) ?? [],
  }));
}

export function agitDraftsOf(
  today: string,
  rows: readonly PayoutRow[],
  finals: readonly BatchFinal[],
  invoices: readonly TaxInvoice[],
  consoleUrl: string,
  only?: string
): AgitPostText[] {
  const days = only ? [only] : upcomingPayDates(today, batchesOf([...rows], [...finals], [...invoices]).map((b) => b.paidAt));
  return days.map((day) => agitPostOf(day, agitBatchesOf(rows, finals, invoices, day), consoleUrl));
}

/** 아지트 연결 — 주소(열쇠)는 싣지 않는다 */
export interface AgitHookInfo {
  /** 웹훅이 연결돼 있는가 */
  connected: boolean;
  /** 연결한 사람 · 때 — 연결 전이면 null */
  connectedBy: string | null;
  connectedAt: string | null;
  /**
   * 요청 글의 담당자 — 아지트 ID. 비면 올리지 못한다(「요청 담당 미지정」). ★연결과 따로다★ — 연결 전에 미리 넣어 두고, 끊어도 남는다
   * (한백 2026-11-08 「담당자는 미리 넣어둘수없나」)
   */
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

/** 웹훅에 보내는 몸 — 담당자가 있으면 요청 글(task · 글양식 구매요청간소화), 없으면 보통 글. 라우트는 담당자 없이 부르지 않는다 */
export function agitPayloadOf(
  text: string,
  assignees: readonly string[]
): { text: string; task?: { template_name: string; assignees: string[] } } {
  return assignees.length ? { text, task: { template_name: AGIT_TEMPLATE, assignees: [...assignees] } } : { text };
}

/** 담당자를 보이는 글 — 「@kiko.x · @ella.a」 */
export const assigneesLabel = (ids: readonly string[]): string => ids.map((s) => `@${s}`).join(' · ');

/**
 * 글 한 줄의 자리 — 정산 담당이 초안을 올리고(draft) 한백이 승인하면 올리는 중(sending) → 올림(posted) · 못 올림(failed).
 * 못 올린 것은 다시 승인해 올린다(초안과 같은 자리).
 */
export const AGIT_POST_STATUSES = ['draft', 'sending', 'posted', 'failed'] as const;
export type AgitPostStatus = (typeof AGIT_POST_STATUSES)[number];

/** 아지트 글 한 줄 — 정산 담당 대화의 그 말 밑에 카드로 선다(components/agents/AgitCard) */
export interface AgitPostRecord {
  id: string;
  payDate: string;
  status: AgitPostStatus;
  title: string;
  /** 아지트에 갈(간) 글 그대로 */
  body: string;
  total: number;
  batches: number;
  error: string | null;
  /** 초안이면 쓴 담당, 올렸으면 승인한 사람 */
  postedBy: string;
  /** 그 글에 붙인 요청 담당자(아지트 ID) — 올릴 때 적는다. 담당자를 바꾼 뒤에도 그때의 사람이 남는다 */
  assignees: string[];
  /** 카드가 서는 대화의 말 — 상신 알림 · 초안을 올린 답. 없으면 만든 때의 자리에 따로 선다 */
  messageId: string | null;
  /** 이미 올린 결제일을 다시 올리는 초안인가 */
  again: boolean;
  /** 올린 글의 아지트 주소 — 아지트가 돌려준 것(없으면 null) */
  agitUrl: string | null;
  /** 만든 때 — 'YYYY-MM-DD HH:mm' 한국 시각 */
  createdAt: string;
  /** 올린 때(못 올렸으면 누른 때) — 초안이면 만든 때 */
  at: string;
}

/** 결제일의 이름 — 「11월 10일 정기결제」 · 「3월 17일 지급」 */
export function payDateName(payDate: string): string {
  const [, m, d] = payDate.split('-').map(Number);
  return `${m}월 ${d}일 ${isRegular(payDate) ? '정기결제' : '지급'}`;
}

/** 올린 뒤 정산 담당 대화에 남는 한 줄(자동) — by 는 승인한 사람 */
export function agitPostedSay(post: Pick<AgitPostText, 'payDate' | 'title' | 'total' | 'batches'>, by: string): string {
  return [
    `${payDateName(post.payDate)} 열린구매 글을 아지트에 올렸습니다 — 지급 ${post.batches}건 · 공급가액 ${won(post.total)}원 (승인 ${by}).`,
    post.title,
  ].join('\n');
}

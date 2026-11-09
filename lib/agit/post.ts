/**
 * 아지트 열린구매 글 — 결제일 하나의 글을 콘솔의 거래명세서(배치)로 짓는다. [순수]
 * (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — team-hanbaek.agit.io)
 *
 * 한백이 고른 것(같은 날, 미리보기를 보고):
 *   · 글 하나 = 결제일 하나 — 그날 나가는 배치(지급처 × 구분) 전부가 한 글의 줄이 된다.
 *   · 올리는 때 = 한백이 시킬 때. ★그때 콘솔의 지금 금액으로 다시 짓는다★ — 초안 뒤에 금액이 바뀌었으면 올리지 않고 초안을
 *     새 금액으로 고친다(store/agit · app/api/agit/posts/[id]). 11-05 아침 상신 알림이 에코일렉 89,040,000원을 적은 뒤
 *     같은 날 대당 +10만으로 96,460,000원이 됐다 — 아침에 저절로 올렸다면 옛 금액이 아지트에 남았다.
 *   · ★정산 담당이 초안을 짓는다★(한백 2026-11-08 「이걸 정산담당 에이전트가 처리해야하는거야」 → 「정산담당 에이전트가 때가 되면 초안을
 *     올려주고, 내가 승인하면 정산담당에이전트가 아지트에 글을 올리는 구조」) — 결제일 3영업일 전 아침 크론이 상신 알림과 함께
 *     초안을 정산 담당 대화에 올리고(lib/agents/remind-run), 한백이 대화에서 시키면 담당이 agit_post 로 올린다(lib/agents/brain).
 *   · ★아지트에는 Claude Code 가 한백의 계정으로 올린다★(한백 2026-11-09 「evcharging bot으로 올리니까 내가 내용수정도 안되고,
 *     첨부파일은 링크가 아니라 첨부파일로 꼭 올려야 할 것 같아」 → 「Claude Code posts it」) — 11-08 · 09 에는 승인하면 콘솔이 아지트
 *     봇(그룹 웹훅)으로 올렸는데, 봇 글은 한백이 고칠 수 없고 파일을 붙일 수 없었다. 이제 한백이 Claude Code 에 「○월 ○일 열린구매 올려」라고
 *     하면 scripts/agit-post.ts 가 한백의 아지트 로그인으로 쓰는 칸에 글양식 · 본문(lib/agit/editor-doc) · 엑셀 캡처(본문 그림) · 첨부 zip
 *     (진짜 첨부 파일) · 요청 담당을 넣고 올린다 — 한백이 쓴 글이라 한백이 고친다. 콘솔은 그 앞뒤만 한다(본 글 견주기 · 「올리는 중」 ·
 *     첨부 zip · 올린 주소 남기기 — app/api/agit/posts/[id] · …/files · …/finish).
 *
 * ★글은 아지트 「요청」 글이다 — 담당자를 붙여★(한백 2026-11-08 「아지트 글에서 담당자 설정도 필요해」 → 요청 글 담당자 칸 ·
 * 한 번 정해 두기). 쓰는 칸의 글양식(구매요청간소화 · 긴급구매요청)이 요청 글을 세우고, 요청 담당은 쓰는 칸의 담당 칸에 넣는다.
 * 상태(요청 · 진행 · 완료 · 승인)는 아지트에서 담당자가 바꾼다.
 *
 * ★글은 한백이 올려 온 글 그대로 — 마크다운이다★(# 머리 · > 회색 상자 · [글](주소) — 한백이 붙여 준 지난 글의 원문). 모양이 둘이다:
 *   · 보통 글 — 글양식 「구매요청간소화」(한백이 고른 26년 6월 1차 · 4월 글 · 2026-11-08 — 첫 판은 긴급 글의 줄을 글자로만 보내 한백이
 *     「기존 올라갔던 글들과 형식이 안맞고 긴급이 아니야 이건은」으로 지웠다): #구매요청간소화 · # 배경(> *- 공사명 :* · > *- 상황설명 :*) ·
 *     # 구매 내역(엑셀 캡처 그림만) · # 기한(> 정기결제일 11월 10일) · # *청구 금액*(> 부가세 전 · > 부가세 포함) ·
 *     # 참고자료(> 거래명세서 내역 · > [지급처](거래명세서 주소)). 첨부 zip 은 글 끝의 고리가 아니라 진짜 첨부 파일이다(11-09 —
 *     봇 시절의 「# 첨부 파일」 상자는 걷었다. 한백의 글도 첨부는 글 밑 첨부 칸에 섰다).
 *   · 긴급 글 — 글양식 「긴급구매요청」(2026-11-09 한백 「긴급에 대한 템플릿도 따로 만들어줘」 · 「지금 템플릿처럼 따로 효과를 줘야해」 —
 *     26년 9월 1차 · 2차 긴급 글의 꼴을 줄마다 견줬다): # [긴급] 공사명 [#긴급구매요청](찾기) · > *지급 요청일: [긴급] 2026. 11. 10 (화요일)* ·
 *     *1. 구매사유*(> *- 공사명 :* · > *- 상황설명 :*) · *2. 지급요청 품목*(> *부가세 전* … / *부가세 포함* … · > 엑셀 캡처) ·
 *     *3. 긴급사유 기재*(> 사유) · # 참고자료 · cc @@team.finance(재무팀 멘션 — 쓰는 칸의 멘션 고르기로 넣는다). ★긴급인지는 한백이 정한다★ — 정산 담당에게
 *     사유와 함께 시키면 담당이 agit_post 의 urgent_reason 으로 짓는다. 상신 기한(3영업일 전)이 지났다고 저절로 긴급이 되지 않는다 —
 *     11/10 글은 기한 뒤에 올렸지만 한백이 「긴급이 아니야 이건은」이라 했다. 사유는 한백의 말 그대로다(지어내지 않는다).
 * ★아지트 마크다운의 굵게는 별 하나다(*글*)★ — ** 는 굵게가 아니라 글자 그대로 보인다(11-08 보통 글의 공사명 · 청구 금액에 ** 가 찍혀
 * 한백이 「본문에서 앞으로 ** 이건 제거해야할듯」 · 11-09 시험 글로 가렸다: *글* 굵게 · _글_ 기울임 · **글** · __글__ 은 글자 그대로 ·
 * 목록이 없어 「1. 구매사유」는 그냥 글줄이다). 굵게 뒤의 빈칸은 아지트가 붙는 빈칸(&nbsp;)으로 그린다 — 한백의 긴급 글과 같다.
 * ★cc @@team.finance 는 긴급 글에만★ — 한백 「cc [@@team.finance]붙는건 긴급일때만」(11-08 — 재무팀을 부르는 것은 긴급 글뿐이다).
 * 보통 글에는 제목 줄이 없다 — 목록 · 감사기록에는 두 모양 다 공사명을 쓴다(agitTitleOf). 이름은 「전달 N월 … 1차」(10일) · 「2차」(25일) —
 * 한 달 일의 수수료를 다음 달 두 번에 나눠 낸다. 계좌는 본문에 적지 않는다 — 첨부 엑셀(구매요청간소화 양식)에만 있다.
 *
 * 엑셀 캡처 · 첨부 zip(엑셀 · 캡처 · 거래명세서 PDF · 세금계산서)은 콘솔이 짓고(…/files) Claude Code 가 쓰는 칸에 올린다 — 캡처는 본문의
 * 그림 자리(AGIT_IMAGE_SLOT), zip 은 첨부 파일.
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

/** 글양식 — 열린구매 그룹의 「구매요청간소화」(쓰는 칸 위의 글양식 단추 이름 · 글 머리의 꼬리표) */
export const AGIT_TEMPLATE = '구매요청간소화';
/** 긴급 글의 글양식 — 같은 그룹의 「긴급구매요청」(한백의 긴급 글 머리에 선 꼬리표) */
export const AGIT_URGENT_TEMPLATE = '긴급구매요청';
/**
 * 긴급 글 제목 끝의 #긴급구매요청 — 한백의 긴급 글은 해시태그 찾기 고리로 걸려 있다(제목 크기의 파란 고리로 선다). 그냥 「#긴급구매요청」
 * 으로 보내면 아지트가 작은 초록 해시태그로 그려 제목과 달라 보였다(11-09 시험 글 — 보통 글 첫 줄의 #구매요청간소화 는 한백의 글도 그 꼴이라 그대로)
 */
export const AGIT_URGENT_TAG = `[#${AGIT_URGENT_TEMPLATE}](https://team-hanbaek.agit.io/search?q=${encodeURIComponent(`#${AGIT_URGENT_TEMPLATE}`)})`;
/**
 * 재무팀 — 긴급 글 끝의 cc(아지트 팀 멘션 「@@team.finance」). 긴급 글에만 단다. 카드에 보이는 글의 꼴이고, 올릴 때는 이 고리를 붙여 넣지
 * 않고 쓰는 칸의 멘션 고르기로 넣는다(lib/agit/editor-doc · scripts/agit-post.ts) — 11-09 쓰는 칸에서 골랐더니 지금 팀 주소는
 * team-hanbaek.agit.io/parties/13215 였다(한백의 10월 긴급 글 원문은 옛 han-baek.agit.io/parties/6776 — 붙여 넣었다면 옛 주소였다).
 */
export const AGIT_CC = '[@@team.finance](https://team-hanbaek.agit.io/parties/13215)';
/** 긴급사유는 이만큼까지(글자) · 다섯 줄까지 */
export const AGIT_URGENT_MAX = 300;
const AGIT_URGENT_LINES = 5;

/**
 * 긴급사유 — 줄마다 앞의 > · # · 빈칸을 걷고(사유가 상자 · 머리를 깨지 않게) 빈 줄을 뺀다. 비면 null(보통 글).
 * 사유는 「3. 긴급사유 기재」 상자에 줄마다 들어간다 — 한백의 말 그대로다.
 */
export function urgentReasonOf(raw: string | null | undefined): string | null {
  const lines = (raw ?? '').split(/\r?\n/)
    .map((l) => l.replace(/^[\s>#]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, AGIT_URGENT_LINES);
  const text = lines.join('\n').slice(0, AGIT_URGENT_MAX).trim();
  return text || null;
}

export interface AgitPostText {
  payDate: string;
  /** 글의 공사명 — 화면의 목록에도 쓴다 */
  title: string;
  text: string;
  /** 공급가액 합계 */
  total: number;
  batches: number;
  /** 긴급사유(다듬은 것) — 있으면 긴급 글(글양식 긴급구매요청), null 이면 보통 글 */
  urgent: string | null;
  /** 올릴 수 없는 까닭 — 단추 이름이 된다(화면 규칙 3). null 이면 올릴 수 있다 */
  blocked: string | null;
}

export const VAT_RATE = 0.1;
/** 부가세 — 공급가액의 10%, 원 단위 절사(세금계산서가 그렇게 끊는다) */
export const vatOf = (supply: number): number => Math.floor(supply * VAT_RATE);

/** 회차의 차례 — 그 밖(회수 · 차감 …)은 뒤에 가나다 */
const STEP_ORDER = ['1차', '2차', '선금', '차액'];

/** 「11/10」 */
export const shortDay = (day: string): string => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
};

/** 정기결제(10일 · 25일)인가 — 다른 날을 골라 가확정한 배치도 있다 */
const isRegular = (day: string): boolean => (REGULAR_PAY_DAYS as readonly string[]).includes(day.slice(8, 10));

/**
 * 품목명 — 「영업비 1차」 · 회차가 섞이면 「 / 」로 잇는다(「시공비 1차 / 2차 / 회수」). 글의 품목 줄과 엑셀의 내용 칸이 같이 쓴다.
 * ★현장 수 · 대수는 적지 않는다★(한백 2026-11-08 「본문에 각 거래처 이름과 품목명 금액만 올리면 되지, 현장수, 기수는 빼」 —
 * 지난 엑셀의 내용 칸도 「(25년 환경부 사업 2차 잔금)」처럼 품목만 적었다). 현장은 거래명세서에 있다.
 */
export function itemNameOf(kind: PayoutKind, lines: readonly AgitLine[]): string {
  const labels = [...new Set(lines.map((l) => l.label))].sort((a, b) => {
    const ia = STEP_ORDER.indexOf(a);
    const ib = STEP_ORDER.indexOf(b);
    return (ia < 0 ? STEP_ORDER.length : ia) - (ib < 0 ? STEP_ORDER.length : ib) || a.localeCompare(b, 'ko');
  });
  return labels.length ? `${kind} ${labels.join(' / ')}` : kind;
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
 * urgent(긴급사유)를 주면 긴급 글(긴급구매요청), 없으면 보통 글(구매요청간소화) — 둘 다 한백의 지난 글 그대로다(머리말).
 */
export function agitPostOf(
  payDate: string,
  batches: readonly AgitBatch[],
  consoleUrl: string,
  urgent: string | null = null
): AgitPostText {
  const sorted = sortBatches(batches);
  const total = sorted.reduce((n, b) => n + b.total, 0);
  const vat = sorted.reduce((n, b) => n + vatOf(b.total), 0);
  const name = requestNameOf(payDate, sorted.map((b) => b.kind));
  const reason = urgentReasonOf(urgent);
  const links = sorted.filter((b) => b.org).map((b) => {
    const label = `${b.org}${sorted.filter((x) => x.org === b.org).length > 1 ? ` (${b.kind})` : ''}`;
    return `> [${mdText(label)}](${mdHref(`${consoleUrl}${statementPathOf(payDate, b.org!, b.kind)}`)})`;
  });
  /* 참고자료는 두 모양이 같다. 첨부 zip 은 글이 아니라 진짜 첨부 파일로 붙는다(scripts/agit-post.ts — 한백 11-09 「첨부파일은 링크가 아니라
   * 첨부파일로」) — 봇 시절의 「# 첨부 파일」 고리 상자는 걷었다 */
  const tail = [
    '# 참고자료',
    '> 거래명세서 내역',
    ...links,
  ];
  const text = (reason ? urgentLines(name, total, vat, reason, tail) : regularLines(payDate, name, total, vat, tail)).join('\n');
  const title = name.subject;
  const blocked = sorted.length === 0
    ? '지급 0건 — 올릴 것 없음'
    : sorted.some((b) => !b.org)
      ? '지급처 미정 배치 — 올릴 수 없음'
      : null;
  return { payDate, title, text, total, batches: sorted.length, urgent: reason, blocked };
}

type RequestName = ReturnType<typeof requestNameOf>;

/** 아지트의 굵게 — 별 하나(머리말). 굵게 칠하는 것은 정해 둔 글자뿐이다 */
const bold = (s: string): string => `*${s}*`;

/**
 * 보통 글 — 「구매요청간소화」(한백의 26년 6월 1차 · 4월 글). 굵게는 6월 1차 그대로 셋 — 「- 공사명 :」 · 「- 상황설명 :」 · 「청구 금액」 머리
 * (한백 11-09 「okay test」 — 11-08 에 ** 로 걸었다가 글자 그대로 찍혀 뺐던 것을 별 하나로 되살렸다)
 */
function regularLines(payDate: string, name: RequestName, total: number, vat: number, tail: readonly string[]): string[] {
  const [, m, d] = payDate.split('-').map(Number);
  return [
    `#${AGIT_TEMPLATE}`,
    '# 배경',
    `> ${bold('- 공사명 :')} ${name.subject}`,
    `> ${bold('- 상황설명 :')} ${name.situation}`,
    /* 구매 내역은 엑셀 캡처 그림만(한백 11-09 「구매내역안에 텍스트 필요없어」) — 그림은 올릴 때 쓰는 칸에 올린다(lib/agit/editor-doc) */
    '# 구매 내역',
    `![${AGIT_IMAGE_ALT}](${AGIT_IMAGE_SLOT})`,
    '# 기한',
    `> ${name.round ? '정기결제일' : '지급일'} ${m}월 ${d}일`,
    `# ${bold('청구 금액')}`,
    `> 부가세 전 ${won(total)}`,
    `> 부가세 포함 ${won(total + vat)}`,
    ...tail,
  ];
}

/**
 * 긴급 글 — 「긴급구매요청」(한백의 26년 9월 1차 · 2차 긴급 글을 줄마다 견준 꼴): 제목 머리 끝에 #긴급구매요청 고리(AGIT_URGENT_TAG) ·
 * 굵은 머리 줄 셋(1. 구매사유 · 2. 지급요청 품목 · 3. 긴급사유 기재)과 그 밑 상자 · 엑셀 캡처는 지급요청 품목 상자 안 · 끝에 cc 재무팀.
 */
function urgentLines(name: RequestName, total: number, vat: number, reason: string, tail: readonly string[]): string[] {
  return [
    `# [긴급] ${name.subject} ${AGIT_URGENT_TAG}`,
    `> ${bold(`지급 요청일: [긴급] ${name.requestDay}`)}`,
    bold('1. 구매사유'),
    `> ${bold('- 공사명 :')} ${name.subject}`,
    `> ${bold('- 상황설명 :')} ${name.situation}`,
    bold('2. 지급요청 품목'),
    `> ${bold('부가세 전')} ${won(total)} / ${bold('부가세 포함')} ${won(total + vat)}`,
    `> ![${AGIT_IMAGE_ALT}](${AGIT_IMAGE_SLOT})`,
    bold('3. 긴급사유 기재'),
    ...reason.split('\n').map((l) => `> ${l}`),
    ...tail,
    `cc ${AGIT_CC}`,
  ];
}

/** 마크다운 글자 — 고리 · 강조로 읽힐 표시를 막는다 */
const mdText = (s: string): string => s.replace(/([\\[\]*_`])/g, '\\$1');
/** 마크다운 고리의 주소 — 괄호(지급처 이름의 「(영업)」)가 고리를 끊지 않게 */
const mdHref = (url: string): string => url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');

/* ── 엑셀 캡처의 자리 ──
 * 초안 · 카드 · 견주는 글에는 자리 글이 선다. 올릴 때 Claude Code 가 그 자리에 엑셀 캡처를 쓰는 칸에 올려 넣는다(lib/agit/editor-doc
 * IMG_MARK · scripts/agit-post.ts) — 아지트가 그 글의 첨부 그림으로 그린다(한백이 손으로 넣은 그림과 같다). */
export const AGIT_IMAGE_ALT = '구매요청간소화 엑셀';
export const AGIT_IMAGE_SLOT = '올릴 때 붙는 엑셀 캡처';

/** 파일 이름에 못 쓰는 글자를 걷는다(/ \ : * ? " < > |) */
export const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

/** 첨부 zip 의 폴더 · 이름(.zip 앞) — 「26년 10월 영업위탁 수수료 1차」 · 정기결제가 아니면 「… (11월 17일 지급)」 대신 「… 11월 17일 지급」 */
export function agitFolderOf(payDate: string, kinds: readonly PayoutKind[]): string {
  const name = requestNameOf(payDate, kinds);
  const tail = name.round ?? `${payDate.slice(5, 7).replace(/^0/, '')}월 ${payDate.slice(8).replace(/^0/, '')}일 지급`;
  return safeName(`${name.month} ${name.what} ${tail}`);
}

/**
 * 저장한 글의 제목 — 보통 글은 「#구매요청간소화」로 시작해(제목 줄이 없다) 목록 · 감사기록 · 올렸다는 말에는 공사명을 쓴다(긴급 글도
 * 같은 공사명 — 「[긴급]」은 카드의 꼬리표가 말한다). 굵게 표시(* · 옛 **)는 걷는다. 공사명 줄이 없는 글은 첫 줄.
 */
export function agitTitleOf(body: string): string {
  const line = body.split('\n').find((l) => l.includes('공사명 :'));
  if (line) return line.replace(/^>\s*/, '').replace(/\*/g, '').replace(/^-\s*공사명\s*:\s*/, '').trim();
  return body.split('\n')[0] ?? '';
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

/** 쓰는 칸에서 고를 글양식 — 긴급 글이면 긴급구매요청, 아니면 구매요청간소화(그 단추의 이름 그대로) */
export const agitTemplateOf = (urgent: string | null): string => (urgent ? AGIT_URGENT_TEMPLATE : AGIT_TEMPLATE);

/** 담당자를 보이는 글 — 「@kiko.x · @ella.a」 */
export const assigneesLabel = (ids: readonly string[]): string => ids.map((s) => `@${s}`).join(' · ');

/**
 * 글 한 줄의 자리 — 정산 담당이 초안을 올리고(draft) 한백이 Claude Code 에 올리라고 하면 올리는 중(sending — Claude Code 가 쓰는 칸을
 * 채우는 동안) → 올림(posted) · 못 올림(failed). 못 올린 것은 다시 시켜 올린다(초안과 같은 자리).
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
  /** 긴급사유 — 있으면 긴급 글(글양식 긴급구매요청), null 이면 보통 글 */
  urgent: string | null;
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
export function agitPostedSay(
  post: Pick<AgitPostText, 'payDate' | 'title' | 'total' | 'batches'> & { urgent?: string | null },
  by: string
): string {
  return [
    `${payDateName(post.payDate)} 열린구매 ${post.urgent ? '긴급 글' : '글'}을 아지트에 올렸습니다 — 지급 ${post.batches}건 · `
      + `공급가액 ${won(post.total)}원 (승인 ${by}).`,
    post.title,
  ].join('\n');
}

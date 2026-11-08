/**
 * 정산 계좌의 형식 — 화면과 저장소가 같은 규칙을 쓴다.
 * 사업자등록번호는 여기 없다 — 정본은 lib/bizid.ts 한 곳이다.
 *
 * 계좌번호는 자릿수 범위만 본다. 은행마다 세대별 형식이 여러 개라(같은 은행도
 * 10~14자리가 섞여 있다) 은행별 자릿수 검증은 맞는 계좌를 거절하는 일이 더 많다.
 * 실계좌·예금주 확인은 통장사본 대조가 정본이고, 기계 검증은 오픈뱅킹류 유료 API 의 일이다.
 *
 * ★저장은 숫자만, 보일 때는 그 은행의 하이픈으로★ (한백 2026-11-08 「정산계좌를 각 은행별 형식에 맞춰서 - 넣어줘」) —
 * formatAccountNo 가 은행 · 자릿수로 끊는 자리를 고른다(아래 ACCOUNT_LAYOUTS). 협력사 정보 · 거래명세서 · 아지트 구매요청 엑셀 ·
 * 정산 담당의 자료가 같이 쓴다.
 */

/** 정산 계좌를 받는 은행 — 드롭다운 선택지. 없는 곳이 나타나면 여기와 ACCOUNT_LAYOUTS 에 추가한다. */
export const BANKS = [
  'KB국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  'NH농협은행',
  'IBK기업은행',
  'SC제일은행',
  '한국씨티은행',
  '카카오뱅크',
  '케이뱅크',
  '토스뱅크',
  'KDB산업은행',
  '부산은행',
  'iM뱅크(대구)',
  '광주은행',
  '전북은행',
  '경남은행',
  '제주은행',
  '수협은행',
  '신협',
  '새마을금고',
  '우체국',
] as const;

export type Bank = (typeof BANKS)[number];

export const ACCOUNT_DIGITS_MIN = 8;
export const ACCOUNT_DIGITS_MAX = 16;

/** 계좌번호는 숫자만 저장한다 — 하이픈 위치는 은행마다 달라 저장할 정보가 아니다 */
export function normalizeAccountNo(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidAccountNo(digits: string): boolean {
  return new RegExp(`^\\d{${ACCOUNT_DIGITS_MIN},${ACCOUNT_DIGITS_MAX}}$`).test(digits);
}

/**
 * 목록의 이름으로 부르지 않는 이름 — 합병 전 이름 · 단위 조합. 앞뒤 견주기로는 안 맞는 것만 둔다
 * (「국민」 · 「MG새마을금고」 · 「대구은행」은 아래 견주기가 잡는다).
 */
const BANK_ALIASES: ReadonlyArray<readonly [RegExp, Bank]> = [
  [/농축협|지역농협|단위농협|농업협동조합/, 'NH농협은행'],
  [/외환/, '하나은행'],
  [/^k뱅크/, '케이뱅크'],
  [/신용협동조합/, '신협'],
];

/**
 * 「국민」·「국민은행」·「KB국민」 이 다 같은 곳을 가리킨다 — 목록의 이름으로 되돌린다.
 * 통장사본 판독(lib/claude-partner-doc)과 계좌 끊기(formatAccountNo — 자유 입력 시절의 은행 이름도)가 같이 쓴다.
 *
 * 「은행」·「주식회사」처럼 어느 은행에나 붙는 말은 떼고 견준다. 떼고 남은 것이 두 글자가
 * 안 되면 포기한다 — 「은행」 한 마디가 목록의 첫 줄에 붙어 엉뚱한 곳으로 돈이 가느니
 * 못 읽은 것으로 두는 편이 낫다.
 */
export function matchBankName(value: string): Bank | null {
  const squeeze = (s: string) => s.replace(/[\s()·.,]/g, '').toLowerCase();
  const core = (s: string) => squeeze(s).replace(/^주식회사/, '').replace(/은행$/, '');

  const exact = BANKS.find((b) => squeeze(b) === squeeze(value));
  if (exact) return exact;

  const alias = BANK_ALIASES.find(([re]) => re.test(squeeze(value)));
  if (alias) return alias[1];

  const target = core(value);
  if (target.length < 2) return null;
  return (
    BANKS.find((b) => {
      const bank = core(b);
      return bank.includes(target) || target.includes(bank);
    }) ?? null
  );
}

/** 끊는 자리 「6-2-6」 + 같은 자릿수의 형식이 둘일 때 가르는 앞자리 */
type Layout = readonly [groups: string, when?: RegExp];

/** 0 으로 시작하는 평생 · 맞춤계좌는 정해진 자리가 없다 */
const NOT_ZERO = /^[1-9]/;
/** 휴대폰 번호(01…)로 만든 평생계좌 — 같은 11자리의 옛 계좌와 섞지 않는다 */
const NOT_PHONE = /^(?!01)/;

/**
 * 은행마다 계좌번호를 끊는 자리 — 자릿수로 고르고, 자릿수가 같은 형식이 둘이면 앞자리(when)로 가른다.
 * 먼저 맞는 줄이 이긴다 · 맨 앞 줄이 그 은행의 지금 형식이다(입력칸의 자리표시). ★표에 없는 은행 · 자릿수는 끊지 않는다★ — 틀린 하이픈은 다른 계좌처럼 읽히지만
 * 없는 하이픈은 덜 읽기 좋을 뿐이다.
 *
 * 근거: 나무위키 「계좌번호」(2024-12-31 기준 · 2026-11-08 읽음). 바탕화면 「영업수수료 지급내역」의 구매요청간소화 엑셀
 * 25개(2025-05~2026-06 — 지급에 쓴 협력사 계좌가 하이픈째 적혀 있다)의 모양과 대 봤고 다 같았다: 국민 14 · 12, 기업 14,
 * 농협 13, 신한 12, 우리 13, 하나 14, 카카오뱅크 13, 케이뱅크 12, 새마을금고 13, 광주 12.
 * 뺀 것: 하나 12(나무위키는 구 외환 3-6-3, 지급 내역의 한 건은 3-3-6 — 엇갈린다) · 국민 12 의 구 주택은행 4-2-6(같은
 * 12자리의 구 국민은행 3-2-4-3 이 지급 내역에 나온다) · 씨티 12(나무위키 1-6-3-2, 옛 자료 3-6-3) · 기업 평생 10 · 11 ·
 * 전북 · 경남(형식을 찾지 못했다) · 가상계좌(정산 계좌가 아니다) · 평생 · 고객지정 계좌(정해진 자리가 없다).
 */
export const ACCOUNT_LAYOUTS: Readonly<Record<Bank, readonly Layout[]>> = {
  KB국민은행: [['6-2-6'], ['3-2-4-3']],
  신한은행: [['3-3-6', NOT_ZERO], ['3-2-6', NOT_ZERO]],
  우리은행: [['4-3-6'], ['3-6-2-3'], ['3-2-7'], ['3-2-6', NOT_PHONE]],
  하나은행: [['3-6-5']],
  NH농협은행: [['3-4-4-2'], ['6-2-6'], ['4-2-6'], ['3-2-6', NOT_PHONE]],
  IBK기업은행: [['3-6-2-3'], ['3-2-7']],
  SC제일은행: [['3-2-6']],
  한국씨티은행: [['3-5-3-2'], ['3-5-3']],
  카카오뱅크: [['4-2-7']],
  // 7 · 9 로 시작하는 12자리는 간편송금 · 안심계좌
  케이뱅크: [['3-3-6', /^[^79]/], ['1-4-3-4']],
  토스뱅크: [['4-4-4']],
  // 과목 010 · 036 은 검증 숫자 없는 입금 전용(평생계좌 · 정기적금)
  KDB산업은행: [['3-4-4-3', /^(?!010|036)/], ['3-8-3'], ['3-2-6']],
  부산은행: [['3-4-4-2'], ['3-2-7']],
  'iM뱅크(대구)': [['3-2-6-1'], ['3-2-6'], ['3-2-6-2'], ['3-2-6-3']],
  광주은행: [['4-3-6'], ['3-3-6']],
  전북은행: [],
  경남은행: [],
  제주은행: [['3-3-6'], ['2-2-6']],
  수협은행: [['4-4-4', NOT_ZERO], ['3-2-5-1']],
  신협: [['3-3-6'], ['5-2-5-1']],
  // 지금 계좌는 9 로 시작한다 — 같은 13자리의 옛 계좌는 금고 번호 4자리가 앞이다
  새마을금고: [['4-4-4-1', /^9/], ['4-2-6-1'], ['4-3-6-1']],
  우체국: [['6-2-6'], ['6-7'], ['3-9']],
};

const sizesOf = (groups: string) => groups.split('-').map(Number);
const lengthOf = (groups: string) => sizesOf(groups).reduce((a, b) => a + b, 0);

/** 그 은행 · 그 숫자의 끊는 자리 — 없으면 null */
export function accountLayoutOf(bank: string | null | undefined, digits: string): string | null {
  const name = bank ? matchBankName(bank) : null;
  if (!name) return null;
  const hit = ACCOUNT_LAYOUTS[name].find(([groups, when]) => lengthOf(groups) === digits.length && (!when || when.test(digits)));
  return hit ? hit[0] : null;
}

/**
 * 보일 계좌번호 — 그 은행의 하이픈을 넣는다(「123456-78-901234」). 숫자는 한 자리도 바꾸지 않는다.
 * 모르는 은행 · 자릿수면 받은 그대로 돌려준다(저장값은 숫자뿐이라 보통 숫자 그대로다).
 */
export function formatAccountNo(bank: string | null | undefined, account: string | null | undefined): string {
  const raw = (account ?? '').trim();
  const digits = normalizeAccountNo(raw);
  const layout = accountLayoutOf(bank, digits);
  if (!layout) return raw;
  const parts: string[] = [];
  let at = 0;
  for (const n of sizesOf(layout)) {
    parts.push(digits.slice(at, at + n));
    at += n;
  }
  return parts.join('-');
}

/** 계좌번호 칸의 자리표시 — 그 은행의 지금 형식(「000000-00-000000」), 모르면 「숫자만」 */
export function accountPlaceholder(bank: string | null | undefined): string {
  const name = bank ? matchBankName(bank) : null;
  const first = name ? ACCOUNT_LAYOUTS[name][0] : undefined;
  return first ? sizesOf(first[0]).map((n) => '0'.repeat(n)).join('-') : '숫자만';
}

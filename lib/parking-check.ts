/**
 * 건축물대장 대조 — 주차면과 주소. ★판정은 코드가 한다★
 * (한백 지시 2026-10-16 「계약단계에서 건축물대장에 대한 에이전트를 하나 더」). 이름(parking_*)은 주차면부터 만들어서다.
 *
 *   1) 건축물대장으로 주차면이 확인돼야 한다.
 *   2) 건축물대장에 주차면이 없으면 K-apt 화면 캡처나 지자체 공문으로 받친다 — 건축물대장 칸에 같이 올린다
 *      (한백 결정: 새 칸을 만들지 않는다. 한 파일에 건축물대장과 K-apt 가 묶여 오기도 한다).
 *   3) 열람용 건축물대장은 접수하지 않는다.
 *   4) 세 서류의 주차면이 모두 같아야 한다.
 *   5) 설치신청서의 주소가 ★도로명 주소★여야 하고, 건축물대장의 도로명주소와 같아야 한다(한백 지시 2026-10-16 같은 날).
 *   6) 건축물대장은 ★계약접수일로부터 3개월 안에 발급한 것★이어야 한다 — 발급일이 계약접수일의 3개월 전보다 이르면 짚는다
 *      (한백 지시 2026-10-30 「건축물대장 발급일자가 계약접수일로부터 3개월이내인지」). 계약접수일 뒤에 뗀 것(보완하며 새로
 *      발급받은 것)은 맞다 — 낡은 것을 거르는 규칙이라서다. 계약접수일은 현장 머리말의 그 칸(createdAt)이다.
 *
 * 숫자와 열람용 여부·발급일은 판독이 읽어 오고(lib/parking-read), 맞는지는 여기서 가른다 — 같은 입력이면 같은 답이다.
 * ★판정이 반려하지는 않는다★ — 짚기만 한다. 막는 것은 계약 확인이다(parkingBlocker, 한백 결정 「막는다」):
 * 짚을 것이 없거나 한백이 결과를 보고 「확인하고 넘기기」를 눌러야 열린다. 기설치 대조(lib/preinstall-check)와 같은 꼴이다.
 */

import { shiftMonths } from './date';

/** 대조가 읽는 칸 — 이 칸들의 파일이 「대조에 쓴 파일」과 같아야 결과를 믿는다 */
export const PARKING_SLOTS = ['bldgreg', 'consult', 'apply'] as const;
export type ParkingSlot = (typeof PARKING_SLOTS)[number];

export const PARKING_DOCS = ['건축물대장', 'K-apt', '공문', '결과서', '신청서', '기타'] as const;
export type ParkingDoc = (typeof PARKING_DOCS)[number];

/** 파일 안의 문서 하나에서 판독이 읽은 것 — 한 파일에 문서가 여럿 묶여 오기도 한다(건축물대장 + K-apt) */
export interface ParkingRead {
  file: string;
  /** 그 파일이 올라온 칸 */
  slot: ParkingSlot;
  doc: ParkingDoc;
  /** 열람용 건축물대장인가 — 건축물대장이 아니면 null */
  viewOnly: boolean | null;
  /** 이 문서가 말하는 주차면 수 — 비었거나 안 보이면 null */
  parking: number | null;
  /**
   * 적힌 그대로의 주소 — 건축물대장은 「도로명주소」 칸, 신청서는 설치 희망지 주소. 다른 문서는 null.
   * 주소를 읽기 전(버전 1)의 결과에는 없다.
   */
  address?: string | null;
  /** 건축물대장의 「건축물 현황」 표에 동마다 적힌 도로명주소 중 위와 다른 것 — 한 단지에 건물번호가 여럿이다(광혜원원림 13·15) */
  otherAddresses?: string[];
  /**
   * 건축물대장의 발급일 YYYY-MM-DD — 첫 쪽 아래 「발급일:」. 건축물대장이 아니거나 안 보이면(뒤쪽만 떼어 온 파일) null.
   * 발급일을 읽기 전(버전 3 전)의 결과에는 없다.
   */
  issued?: string | null;
}

export type ParkingIssueKey =
  | 'no-register' | 'view-only' | 'no-basis' | 'split'
  | 'no-consult' | 'consult-diff' | 'no-apply' | 'apply-diff'
  | 'no-apply-address' | 'apply-not-road' | 'no-register-address' | 'address-diff'
  | 'no-issued' | 'issued-old';

export interface ParkingIssue {
  key: ParkingIssueKey;
  /** 사람이 읽는 한 줄 */
  text: string;
}

export interface ParkingCheck {
  checkedAt: string;
  /** 대조에 쓴 파일 주소 — 칸의 파일이 이것과 달라지면 「다시 대조」 */
  files: string[];
  reads: ParkingRead[];
  /** 기준 주차면 — 건축물대장, 거기 없으면 K-apt·공문 */
  basis: { value: number; from: '건축물대장' | 'K-apt' | '공문' } | null;
  /** 사전현장컨설팅 결과서의 주차면 */
  consult: number | null;
  /** 설치신청서의 주차면 — 견주지 않는 현장(환경부 사업이 아니고 신청서도 안 냄)은 null */
  apply: number | null;
  /** 설치신청서를 견주는가 — 환경부 사업은 필수 서류다(doc-rules envOnly). 다른 현장도 냈으면 견준다 */
  applyChecked: boolean;
  /**
   * 설치신청서 주소 ↔ 건축물대장 도로명주소 — 신청서를 견주는 현장(applyChecked)만. 버전 1 결과에는 없다.
   * road: 신청서 주소가 도로명 주소인가 · match: 건축물대장 도로명주소(동별 포함) 중 하나와 같은가 — 모르면 null.
   */
  address?: { apply: string | null; register: string | null; road: boolean | null; match: boolean | null } | null;
  /**
   * 건축물대장 발급일 ↔ 계약접수일(6번 규칙) — 견줄 발급용 건축물대장이 없으면 null. 버전 3 전의 결과에는 없다.
   * receivedOn: 견준 계약접수일 — 그 뒤 한백이 고치면 이 결과를 믿지 않는다(redatedCheck) · from: 받는 가장 이른 발급일
   * (계약접수일의 3개월 전) · oldest: 읽은 발급일 중 가장 이른 것, 못 읽었으면 null · ok: from 이후인가, 모르면 null.
   */
  issued?: { receivedOn: string; from: string; oldest: string | null; ok: boolean | null } | null;
  issues: ParkingIssue[];
  /** 판독이 못 읽은 파일 */
  unread: string[];
  /** 한백이 결과를 보고 넘겼다 — 이 결과에 붙는다. 다시 대조하면 사라진다 */
  accepted?: { by: string; at: string } | null;
  /**
   * 무엇을 견준 결과인가 — 견주는 것이 늘면 올린다. 지금보다 낮으면 계약 확인을 다시 막는다(그 항목을 안 본 결과다).
   * 1(없음) = 주차면·열람용 · 2 = 주소까지(2026-10-16) · 3 = 건축물대장 발급일까지(2026-10-30).
   */
  version?: number;
}

/** 지금 대조가 견주는 것의 판 — 이보다 낮은 결과는 「다시 대조」다 */
export const PARKING_CHECK_VERSION = 3;

/** 판마다 더한 것 — 낮은 판의 결과가 무엇을 안 봤는지 단추·꼬리표에 적는다(「주소·발급일 확인 추가」) */
const ADDED_IN: ReadonlyArray<readonly [number, string]> = [[2, '주소'], [3, '발급일']];

/** 견주는 것이 늘기 전의 결과인가 */
export const outdatedCheck = (c: ParkingCheck): boolean => (c.version ?? 1) < PARKING_CHECK_VERSION;

/** 낮은 판의 결과가 안 본 것 — 「주소·발급일」 */
export const missedOf = (c: ParkingCheck): string =>
  ADDED_IN.filter(([v]) => (c.version ?? 1) < v).map(([, what]) => what).join('·');

/** 건축물대장은 계약접수일로부터 이 달 수 안에 발급한 것이어야 한다(6번 규칙) */
export const ISSUED_WITHIN_MONTHS = 3;

/** 대조한 뒤 계약접수일이 바뀌었나 — 발급일을 그때의 계약접수일에 견줬다. 견준 것이 없으면(발급용 건축물대장 없음) 상관없다 */
export const redatedCheck = (c: ParkingCheck, receivedOn: string): boolean =>
  !!c.issued && c.issued.receivedOn !== receivedOn;

/** 열람용 건축물대장을 돌려보낼 때의 사유 — 건축물대장 칸의 「반려」가 이 말을 들고 연다 */
export const VIEW_ONLY_REASON = '열람용 건축물대장은 접수할 수 없습니다 — 발급용(정부24 「발급」)으로 다시 올려주세요.';

const has = (n: number | null): n is number => n !== null && n > 0;
const distinct = (ns: number[]) => [...new Set(ns)].sort((a, b) => a - b);
const list = (ns: number[]) => ns.map((n) => `${n}면`).join(' · ');

/**
 * 도로명 주소의 열쇠 — 「도로명 + 건물번호」(예: 「예구1길 8」·「길주로411번길 20」·「대농로 47-2」). 도로명 주소가 아니면 null.
 *
 * ★열쇠로 견주는 까닭★ — 같은 주소도 서류마다 앞머리가 다르다: 시·도 이름이 바뀐다(「전라남도」 → 「전남광주통합특별시」,
 * 「전라북도」 → 「전북특별자치도」), 읍·면을 빼고 적기도 하고, 뒤에 「(중화산동2가)」 같은 참고항목·건물 이름이 붙는다.
 * 그 사이에서도 도로명과 건물번호는 안 바뀐다. 지번 주소(「광혜원리 418-2」·「복대동 288-126」)에는 「…로·…길 + 번호」가
 * 없어서 null 이다 — 그것이 「도로명 주소가 아니다」의 판정이다.
 */
export function roadKeyOf(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const tokens = addr.normalize('NFC')
    .replace(/\([^)]*\)/g, ' ')          // 참고항목 「(중화산동2가)」
    .replace(/[,，]/g, ' ')
    .split(/\s+/).filter(Boolean);
  let key: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // 붙여 쓴 「예구1길8」
    const glued = /^(\S*[가-힣]\S*(?:로|길))(\d+(?:-\d+)?)$/.exec(t);
    if (glued) { key = `${glued[1]} ${glued[2]}`; continue; }
    if (!/[가-힣]/.test(t) || !/(?:로|길)$/.test(t)) continue;
    let j = i + 1;
    if (tokens[j] === '지하') j += 1;       // 「…로 지하 123」
    const num = /^(\d+(?:-\d+)?)/.exec(tokens[j] ?? '');
    if (num) key = `${t} ${num[1]}`;
  }
  return key;
}

/** 도로명 주소인가 — 「…로·…길 + 건물번호」가 있다 */
export const isRoadAddress = (addr: string | null | undefined): boolean => roadKeyOf(addr) !== null;

/**
 * 판독이 읽은 것으로 판정한다.
 *
 * 기준은 건축물대장이다. 건축물대장에 주차면이 없을 때만(칸이 비었거나 0) 같은 칸의 K-apt·공문을 본다 —
 * 건축물대장에 있으면 K-apt 가 달라도 기준은 건축물대장이다(1번 규칙). 장마다 값이 갈리면 기준을 세우지 않고 짚는다.
 * 결과서·신청서는 기준과 견주고, 기준이 없으면 둘끼리라도 견준다 — 셋이 다 같아야 하므로 둘이 다르면 그것도 어긋남이다.
 */
export function judgeParking(
  reads: ParkingRead[],
  ctx: {
    /** 설치신청서가 필수인가(환경부 사업) */
    applyRequired: boolean;
    /** 칸마다 파일이 있는가 — 「못 읽음」과 「안 냄」을 가른다 */
    filed: Record<ParkingSlot, boolean>;
    /** 계약접수일 YYYY-MM-DD — 건축물대장 발급일을 여기에 견준다(6번 규칙) */
    receivedOn: string;
  }
): Pick<ParkingCheck, 'basis' | 'consult' | 'apply' | 'applyChecked' | 'address' | 'issued' | 'issues'> {
  const issues: ParkingIssue[] = [];
  const inSlot = (slot: ParkingSlot, doc: ParkingDoc) => reads.filter((r) => r.slot === slot && r.doc === doc);

  // 1·3 — 건축물대장이 있고 발급용인가
  const regs = inSlot('bldgreg', '건축물대장');
  if (regs.length === 0) {
    issues.push({
      key: 'no-register',
      text: ctx.filed.bldgreg ? '건축물대장 칸에서 건축물대장을 찾지 못했습니다' : '건축물대장이 없습니다',
    });
  }
  if (regs.some((r) => r.viewOnly === true)) {
    issues.push({ key: 'view-only', text: '열람용 건축물대장 — 접수 불가(발급용으로 다시)' });
  }

  // 6 — 계약접수일로부터 3개월 안에 발급했나. 열람용은 바로 위에서 짚었다(거기 찍힌 「발급일」은 출력한 날이다) — 발급용만 본다.
  //     장마다 따로 뗐으면 가장 이른 장이 정한다. 발급일이 없는 장은 뒤쪽만 떼어 온 파일일 수 있어(「2쪽 중 제2쪽」만 올린
  //     무실이편한세상) 한 장이라도 읽었으면 그것으로 가르고, 하나도 못 읽었을 때만 짚는다.
  let issued: ParkingCheck['issued'] = null;
  const issuable = regs.filter((r) => r.viewOnly !== true);
  if (issuable.length > 0) {
    const from = shiftMonths(ctx.receivedOn, -ISSUED_WITHIN_MONTHS);
    const oldest = issuable.map((r) => r.issued ?? null).filter((d): d is string => !!d).sort()[0] ?? null;
    issued = { receivedOn: ctx.receivedOn, from, oldest, ok: oldest === null ? null : oldest >= from };
    if (oldest === null) {
      issues.push({ key: 'no-issued', text: '건축물대장에서 발급일을 읽지 못했습니다' });
    } else if (!issued.ok) {
      issues.push({
        key: 'issued-old',
        text: `건축물대장 발급일 ${oldest} — 계약접수일(${ctx.receivedOn})로부터 ${ISSUED_WITHIN_MONTHS}개월이 넘었습니다`,
      });
    }
  }

  // 1·2 — 기준 주차면
  let basis: ParkingCheck['basis'] = null;
  const regValues = distinct(regs.map((r) => r.parking).filter(has));
  if (regValues.length > 1) {
    issues.push({ key: 'split', text: `건축물대장의 주차면이 장마다 다릅니다 (${list(regValues)})` });
  } else if (regValues.length === 1) {
    basis = { value: regValues[0], from: '건축물대장' };
  } else if (regs.length > 0) {
    const proofs = reads.filter((r) => r.slot === 'bldgreg' && (r.doc === 'K-apt' || r.doc === '공문') && has(r.parking));
    const proofValues = distinct(proofs.map((r) => r.parking as number));
    if (proofValues.length > 1) {
      issues.push({ key: 'split', text: `K-apt·공문의 주차면이 서로 다릅니다 (${list(proofValues)})` });
    } else if (proofValues.length === 1) {
      const from = proofs.find((r) => r.parking === proofValues[0])!.doc as 'K-apt' | '공문';
      basis = { value: proofValues[0], from };
    } else {
      issues.push({ key: 'no-basis', text: '건축물대장에 주차면이 없습니다 — K-apt 화면 캡처나 지자체 공문을 같이 올려주세요' });
    }
  }

  // 4 — 결과서 · 신청서가 기준과(기준이 없으면 서로) 같은가
  const formValue = (slot: ParkingSlot, doc: ParkingDoc, name: string, missingKey: ParkingIssueKey) => {
    const values = distinct(inSlot(slot, doc).map((r) => r.parking).filter(has));
    if (values.length === 0) {
      issues.push({
        key: missingKey,
        text: ctx.filed[slot] ? `${name}에서 주차면을 읽지 못했습니다` : `${name}가 없습니다`,
      });
      return null;
    }
    if (values.length > 1) {
      issues.push({ key: missingKey, text: `${name}의 주차면이 장마다 다릅니다 (${list(values)})` });
      return null;
    }
    return values[0];
  };

  const consult = formValue('consult', '결과서', '사전현장컨설팅 결과서', 'no-consult');
  if (consult !== null && basis && consult !== basis.value) {
    issues.push({ key: 'consult-diff', text: `결과서 ${consult}면 ≠ ${basis.from} ${basis.value}면` });
  }

  const applyChecked = ctx.applyRequired || ctx.filed.apply;
  const apply = applyChecked ? formValue('apply', '신청서', '설치신청서', 'no-apply') : null;
  if (apply !== null) {
    const ref = basis ? { value: basis.value, name: basis.from } : consult !== null ? { value: consult, name: '결과서' } : null;
    if (ref && apply !== ref.value) {
      issues.push({ key: 'apply-diff', text: `설치신청서 ${apply}면 ≠ ${ref.name} ${ref.value}면` });
    }
  }

  // 5 — 설치신청서 주소가 도로명 주소이고, 건축물대장의 도로명주소(동별 포함) 중 하나와 같은가
  let address: ParkingCheck['address'] = null;
  if (applyChecked) {
    const applyAddr = inSlot('apply', '신청서').map((r) => r.address ?? null).find((a): a is string => !!a) ?? null;
    const regAddrs = regs.flatMap((r) => [r.address ?? null, ...(r.otherAddresses ?? [])])
      .filter((a): a is string => !!a);
    const regKeys = new Set(regAddrs.map(roadKeyOf).filter((k): k is string => !!k).map((k) => k.replace(/\s+/g, '')));
    const applyKey = roadKeyOf(applyAddr);
    const road = applyAddr ? applyKey !== null : null;
    const match = applyKey && regKeys.size > 0 ? regKeys.has(applyKey.replace(/\s+/g, '')) : null;
    address = { apply: applyAddr, register: regAddrs[0] ?? null, road, match };

    // 신청서가 아예 없으면 위 「설치신청서가 없습니다」가 이미 말한다 — 같은 것을 두 번 짚지 않는다
    if (!applyAddr) {
      if (ctx.filed.apply) issues.push({ key: 'no-apply-address', text: '설치신청서에서 주소를 읽지 못했습니다' });
    } else if (!road) {
      issues.push({ key: 'apply-not-road', text: `설치신청서 주소가 도로명 주소가 아닙니다 — 「${applyAddr}」` });
    } else if (regs.length > 0 && regKeys.size === 0) {
      issues.push({ key: 'no-register-address', text: '건축물대장에서 도로명주소를 읽지 못했습니다' });
    } else if (match === false) {
      issues.push({
        key: 'address-diff',
        text: `설치신청서 주소 「${applyAddr}」 ≠ 건축물대장 도로명주소 「${regAddrs[0]}」`,
      });
    }
  }

  return { basis, consult, apply, applyChecked, address, issued, issues };
}

/** 짚을 것의 수 — 화면 꼬리표와 계약 확인 단추가 같은 수를 센다 */
export function parkingIssueCount(c: ParkingCheck): number {
  return c.issues.length;
}

/** 대조에 쓴 파일과 지금 칸의 파일이 같은가 — 다르면 지난 결과를 믿지 않는다(「서류가 바뀜」) */
export function sameParkingFiles(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
}

/** 세 칸의 지금 파일 주소 — 화면과 저장소(계약 확인)가 같은 값을 만든다 */
export function parkingFilesOf(documents: Array<{ kind: string; files: Array<{ url: string }> }>): string[] {
  return PARKING_SLOTS.flatMap((k) => documents.find((d) => d.kind === k)?.files.map((f) => f.url) ?? []);
}

/**
 * 건축물대장 칸의 「반려」가 들고 열 사유 — 지금 서류·지금 계약접수일로 돈 대조가 열람용이나 오래된 발급일을 짚었을 때만.
 * 열람용이 먼저다(열람용은 발급일로 짚지 않는다 — 발급용으로 다시 받는 것이 먼저다). 반려는 사람이 누른다 — 여기는 사유를
 * 채워 열 뿐이다.
 */
export function registerRejectOf(
  check: ParkingCheck | null | undefined,
  currentFiles: string[],
  receivedOn: string
): { label: string; reason: string } | null {
  if (!check || !sameParkingFiles(check.files, currentFiles) || redatedCheck(check, receivedOn)) return null;
  if (check.issues.some((i) => i.key === 'view-only')) return { label: '열람용', reason: VIEW_ONLY_REASON };
  const at = check.issued;
  if (at?.oldest && check.issues.some((i) => i.key === 'issued-old')) {
    return {
      label: `발급일 ${ISSUED_WITHIN_MONTHS}개월 넘음`,
      reason: `건축물대장 발급일(${at.oldest})이 계약접수일(${at.receivedOn})로부터 ${ISSUED_WITHIN_MONTHS}개월이 넘었습니다 — `
        + `${at.from} 이후에 발급한 건축물대장으로 다시 올려주세요.`,
    };
  }
  return null;
}

/**
 * ★계약 확인을 막는 건축물대장 대조 사정★ — null 이면 통과 (한백 결정 2026-10-16 「막는다」).
 *
 * 서류가 콘솔에 있는 현장만 본다 — 이관 현장은 서류가 노션에 있어 대조할 것이 없다(계약 확인의 docsExempt).
 * 통과는 둘 중 하나다: 지금 칸의 파일로 돌린 대조가 짚을 것 0, 또는 남아 있어도 한백이 그 결과를 보고 넘김(accepted).
 * 파일이 바뀌면 둘 다 무효다 — 발급일을 견준 계약접수일을 그 뒤에 고쳐도 그렇다. 글은 계약 확인 단추 이름에 그대로
 * 붙는다(「… — 계약 확인 불가」, 화면 규칙 3).
 */
export function parkingBlocker(input: {
  needed: boolean;
  check: ParkingCheck | null | undefined;
  currentFiles: string[];
  /** 지금 계약접수일 — 대조가 발급일을 견준 날짜와 다르면 다시 대조다 */
  receivedOn: string;
}): string | null {
  if (!input.needed) return null;
  const c = input.check;
  if (!c) return '건축물대장 대조 전';
  if (!sameParkingFiles(c.files, input.currentFiles)) return '건축물대장 대조 서류 바뀜 — 다시 대조';
  // 견주는 것이 늘기 전의 결과 — 그 항목을 안 봤다. 넘긴 것(accepted)도 그때 본 것까지다
  if (outdatedCheck(c)) return `건축물대장 다시 대조 — ${missedOf(c)} 확인 추가`;
  // 발급일을 견준 계약접수일을 그 뒤에 고쳤다 — 넘긴 것도 그 날짜로 본 것이다
  if (redatedCheck(c, input.receivedOn)) return '건축물대장 다시 대조 — 계약접수일 바뀜';
  const left = parkingIssueCount(c);
  if (left > 0 && !c.accepted) return `건축물대장 대조 ${left}건 미확인`;
  return null;
}

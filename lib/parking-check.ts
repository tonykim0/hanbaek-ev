/**
 * 주차면 대조 — 건축물대장(또는 그 증빙) = 사전현장컨설팅 결과서 = 설치신청서. ★판정은 코드가 한다★
 * (한백 지시 2026-10-16 「계약단계에서 건축물대장에 대한 에이전트를 하나 더」).
 *
 *   1) 건축물대장으로 주차면이 확인돼야 한다.
 *   2) 건축물대장에 주차면이 없으면 K-apt 화면 캡처나 지자체 공문으로 받친다 — 건축물대장 칸에 같이 올린다
 *      (한백 결정: 새 칸을 만들지 않는다. 한 파일에 건축물대장과 K-apt 가 묶여 오기도 한다).
 *   3) 열람용 건축물대장은 접수하지 않는다.
 *   4) 세 서류의 주차면이 모두 같아야 한다.
 *
 * 숫자와 열람용 여부는 판독이 읽어 오고(lib/parking-read), 맞는지는 여기서 가른다 — 같은 입력이면 같은 답이다.
 * ★판정이 반려하지는 않는다★ — 짚기만 한다. 막는 것은 계약 확인이다(parkingBlocker, 한백 결정 「막는다」):
 * 짚을 것이 없거나 한백이 결과를 보고 「확인하고 넘기기」를 눌러야 열린다. 기설치 대조(lib/preinstall-check)와 같은 꼴이다.
 */

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
}

export type ParkingIssueKey =
  | 'no-register' | 'view-only' | 'no-basis' | 'split'
  | 'no-consult' | 'consult-diff' | 'no-apply' | 'apply-diff';

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
  issues: ParkingIssue[];
  /** 판독이 못 읽은 파일 */
  unread: string[];
  /** 한백이 결과를 보고 넘겼다 — 이 결과에 붙는다. 다시 대조하면 사라진다 */
  accepted?: { by: string; at: string } | null;
}

/** 열람용 건축물대장을 돌려보낼 때의 사유 — 건축물대장 칸의 「반려」가 이 말을 들고 연다 */
export const VIEW_ONLY_REASON = '열람용 건축물대장은 접수할 수 없습니다 — 발급용(정부24 「발급」)으로 다시 올려주세요.';

const has = (n: number | null): n is number => n !== null && n > 0;
const distinct = (ns: number[]) => [...new Set(ns)].sort((a, b) => a - b);
const list = (ns: number[]) => ns.map((n) => `${n}면`).join(' · ');

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
  }
): Pick<ParkingCheck, 'basis' | 'consult' | 'apply' | 'applyChecked' | 'issues'> {
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

  return { basis, consult, apply, applyChecked, issues };
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

/** 지금 파일로 돈 결과가 열람용을 짚었는가 — 건축물대장 칸의 「반려」가 사유를 들고 연다 */
export function viewOnlyNow(check: ParkingCheck | null | undefined, currentFiles: string[]): boolean {
  return !!check && sameParkingFiles(check.files, currentFiles) && check.issues.some((i) => i.key === 'view-only');
}

/**
 * ★계약 확인을 막는 주차면 사정★ — null 이면 통과 (한백 결정 2026-10-16 「막는다」).
 *
 * 서류가 콘솔에 있는 현장만 본다 — 이관 현장은 서류가 노션에 있어 대조할 것이 없다(계약 확인의 docsExempt).
 * 통과는 둘 중 하나다: 지금 칸의 파일로 돌린 대조가 짚을 것 0, 또는 남아 있어도 한백이 그 결과를 보고 넘김(accepted).
 * 파일이 바뀌면 둘 다 무효다. 글은 계약 확인 단추 이름에 그대로 붙는다(「… — 계약 확인 불가」, 화면 규칙 3).
 */
export function parkingBlocker(input: {
  needed: boolean;
  check: ParkingCheck | null | undefined;
  currentFiles: string[];
}): string | null {
  if (!input.needed) return null;
  const c = input.check;
  if (!c) return '주차면 대조 전';
  if (!sameParkingFiles(c.files, input.currentFiles)) return '주차면 서류 바뀜 — 다시 대조';
  const left = parkingIssueCount(c);
  if (left > 0 && !c.accepted) return `주차면 대조 ${left}건 미확인`;
  return null;
}

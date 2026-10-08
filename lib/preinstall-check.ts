/**
 * 기설치 이력 엑셀 ↔ 증빙 대조 — ★판정은 코드가 한다★ (한백 지시 2026-10-06).
 *
 * 증빙(행위신고증명서·필증·예전 계약서)의 숫자는 판독이 읽어 오고(lib/legacy-evidence),
 * 엑셀은 코드가 읽는다(lib/legacy-sheet). 맞는지 가르는 것은 여기 — 같은 입력이면 같은 답이다.
 *
 * 무엇을 견주나 (안내문 public/notices/legacy-charger-history.html 의 「제출 전 확인」에서 왔다):
 *   · 엑셀 한 줄 ↔ 그 행위의 증빙 — 신고번호가 J열에 적혀 있으면 그것으로, 아니면 행위 일자로 짝을
 *     짓고 기수를 견준다(행위 일자 = 증명서 발급 일자가 양식의 작성 방법이다).
 *   · 지금 서 있는 수 — 엑셀(신규 − 철거) ↔ 마지막 행위신고의 「행위 후」.
 *     이번 설치 건으로 낸 신고가 섞여 있으면(계약 접수일 뒤의 신고) 그 신고의 「행위 전」이 기설치다.
 *   · 콘솔의 조사 결과(있음/없음) ↔ 엑셀 — 조사를 했다고 표시된 현장만.
 *
 * ★판정이 막지는 않는다 — 짚기만 한다.★ 판독은 스캔 품질에 따라 틀리고, 반려는 사람이 누른다.
 * 막는 것은 ★대조를 했느냐★다 (한백 지시 2026-10-07 「검증 필수」): 보조사업 현장은 대조가 맞음이거나
 * 한백이 결과를 보고 「확인함」으로 넘겨야 계약을 확인한다 — preCheckBlocker 가 그 한 곳이다.
 */
import type { LegacyRow, LegacySheet } from './legacy-sheet';
import type { PreInstall } from '@/types/project';

/** 증빙 문서의 종류 — 행위신고만 「엑셀에 없는 행위」를 짚는다(나머지는 받침 자료다) */
export type EvidenceDoc = '행위신고' | '필증' | '계약서' | '회의록' | '공문' | '도면' | '사진' | '기타';

/** 판독이 증빙에서 읽은 행위 하나 */
export interface EvidenceAct {
  /** 칸 안의 파일 이름 */
  file: string;
  doc: EvidenceDoc;
  title: string | null;
  /** 발급·신고 일자 YYYY-MM-DD */
  date: string | null;
  /** 신고번호 — 「2021-공동주택과-행위신고(증설)-116」 */
  number: string | null;
  kind: '신규 설치' | '교체 설치' | '철거' | null;
  /** 행위 전·후의 충전기 기수 */
  before: number | null;
  after: number | null;
  /** 이 행위로 설치·교체·철거한 기수 — 문서에 적힌 것 */
  count: number | null;
}

export type LineVerdict =
  | 'ok'           // 맞음
  | 'diff'         // 어긋남
  | 'no-evidence'  // 엑셀 줄에 짝 증빙이 없다
  | 'exempt'       // 보조사업 설치분 — 설치 증빙 면제(안내문 유형 2)
  | 'review'       // 설계도면이 증빙인 줄(준공 시 설치) — 날짜로 짝지을 수 없어 사람이 본다
  | 'no-count'     // 짝은 있는데 증빙에서 기수를 못 읽었다
  | 'no-row'       // 행위신고가 있는데 엑셀에 그 줄이 없다
  | 'current'      // 이번 설치 건으로 낸 신고 — 이력이 아니다
  | 'extra';       // 짝 없는 받침 자료(필증·계약서 등) — 짚지 않는다

export interface CheckLine {
  verdict: LineVerdict;
  row: LegacyRow | null;
  act: EvidenceAct | null;
  /** 증빙이 말하는 이 행위의 기수 */
  actCount: number | null;
  /** 어긋남·빠짐의 한 줄 — 사람이 읽는다 */
  why: string | null;
}

export interface PreInstallCheck {
  checkedAt: string;
  /** 대조에 쓴 파일 주소 — 칸의 파일이 이것과 달라지면 「다시 대조」 */
  files: string[];
  sheetFile: string | null;
  sheet: Pick<LegacySheet, 'standing' | 'final' | 'badSplit' | 'none'> | null;
  lines: CheckLine[];
  /** 지금 서 있는 수 — 엑셀 ↔ 증빙 */
  standing: { sheet: number; evidence: number | null; from: string | null; verdict: 'ok' | 'diff' | 'unknown' } | null;
  /** 콘솔의 조사 결과 ↔ 엑셀 (조사 표시가 된 현장만) */
  survey: { state: PreInstall; verdict: 'ok' | 'diff' } | null;
  /** 판독이 못 읽은 증빙 파일 */
  unread: string[];
  /** 대조 자체를 못 한 이유 — 엑셀이 없다 등 */
  problem: string | null;
  /**
   * 기설치가 없을 때 — 설치이력의 운영사·아파트 직인 (한백 지시 2026-10-07). 기설치가 있거나 알 수 없으면 null.
   * 옛 데이터(이 칸이 생기기 전 대조)에는 없다.
   */
  seal?: SealCheck | null;
  /**
   * 한백이 결과를 보고 넘겼다 — 짚을 것·개별 검토가 남아도 계약 확인을 열어 준다 (한백 지시 2026-10-07).
   * 이 결과에 붙는다: 다시 대조하면 새 결과라 사라진다. 설계도면 증빙(개별 검토)은 코드가 맞다고 할 수
   * 없어 이 길이 아니면 영영 못 넘어간다.
   */
  accepted?: { by: string; at: string } | null;
  /**
   * 엑셀의 모든 줄이 보조사업 설치분이다(사업연도·대기번호 — subsidyOnly) — 증빙을 읽지 않았고 계약 확인을 막지 않는다
   * (한백 지시 2026-10-08). 옛 결과에는 없다.
   */
  subsidyOnly?: boolean;
}

/** 설치이력 스캔본(날인본) 한 장에서 판독이 읽은 것 — lib/legacy-evidence 가 채운다 */
export interface SheetScan {
  file: string;
  /** 서명 칸이 있는 그 양식인가 — 아니면 applicant·operator 는 null */
  form: boolean;
  applicant: { name: string | null; seal: boolean | null };
  operator: { name: string | null; seal: boolean | null };
  /** 「전체」 줄의 최종 기설치 수량 — 안 보이면 null */
  total: number | null;
}

export interface SealCheck {
  /** 설치 신청자(아파트) 직인 */
  applicant: boolean;
  /** 사업수행기관(운영사) 직인 */
  operator: boolean;
  /** 본 파일 — 엑셀(도장 그림)·스캔본(판독) */
  from: string[];
  /** 서명 칸이 있는 양식이 하나도 없다 — 옛 양식이라 날인할 자리가 없다 */
  oldForm: boolean;
}

/**
 * ★기설치가 없으면 설치이력에 운영사·아파트 직인이 둘 다 있어야 한다★ (한백 지시 2026-10-07).
 *
 * 기설치가 있는 현장은 증빙(행위신고증명서 등)이 수량을 받치지만, 없는 현장은 「없음」을 두 쪽이 날인한
 * 설치이력 한 장이 증빙의 전부다 — 경주국태그린빌의 첫 판이 사업수행기관 칸이 비어 보완요청됐다.
 * 직인은 엑셀에 박힌 도장 그림(lib/legacy-sheet, 코드)이나 스캔본(판독)에서 본다 — 어느 쪽이든 한
 * 곳에 있으면 있는 것이다(엑셀은 이름만 적고 출력본에 찍어 내는 일이 흔하다).
 *
 * 기설치가 없는가: 엑셀이 있으면 엑셀로(기수가 0보다 큰 줄이 없음), 없으면 스캔본의 「전체」 합계로.
 * 둘 다 모르면 null — 모르는 것을 보완요청하지 않는다.
 */
export function sealOf(sheet: LegacySheet | null, scans: SheetScan[], sheetFile: string | null): SealCheck | null {
  const none = sheet
    ? sheet.rows.every((r) => !r.d)
    : scans.some((s) => s.total === 0) && !scans.some((s) => (s.total ?? 0) > 0);
  if (!none) return null;
  const signed = scans.filter((s) => s.form);
  return {
    applicant: !!sheet?.sign?.applicant.seal || signed.some((s) => s.applicant.seal === true),
    operator: !!sheet?.sign?.operator.seal || signed.some((s) => s.operator.seal === true),
    from: [...(sheet && sheetFile ? [sheetFile] : []), ...scans.map((s) => s.file)],
    oldForm: !sheet?.sign && signed.length === 0,
  };
}

/** 빠진 직인 — 보완요청 사유에 그대로 쓴다 */
export function missingSeals(s: SealCheck): string[] {
  return [!s.applicant ? '아파트(설치 신청자)' : null, !s.operator ? '운영사(사업수행기관)' : null]
    .filter((x): x is string => x !== null);
}

/** 보완요청 사유 — 화면의 단추가 이 글로 설치이력 칸을 반려한다 */
export function sealFixReason(s: SealCheck): string {
  return `기설치 없음 설치이력에 ${missingSeals(s).join('·')} 직인이 없습니다 — `
    + (s.oldForm ? '서명 칸이 있는 새 양식으로 ' : '')
    + '두 곳 모두 날인해 다시 올려주세요.';
}

/**
 * 보조사업 표기 — ★사업연도와 대기번호가 둘 다 있어야 한다★ (한백 지시 2026-10-08 「순수하게 보조금 사업으로 이뤄졌고
 * 사업연도와 대기번호가 있으면 별도의 증빙자료 필요없으므로 검수 불필요」). 그 둘이면 충전기·보조금 이력 조회에서 찾아진다
 * (안내문 유형 2 — K열에 사업연도 + 대기번호). 「완속보조금」·「보조금 이력 존재」만으로는 찾을 수 없어 면제가 아니다.
 *
 * 실제 설치이력 엑셀 177개에서 모은 모양(2026-10-08): 「사업연도: 2023년, 대기번호: 5710」 · 「사업연도 2025 대기번호 1829」 ·
 * 「2022 보조금 사업 대기번호2914」 · 「2022.09_대기번호2914」 · 「대기번호 2022년 252번」 · 「대기번호 1704 2023년 보조금 사업」.
 * 안내문의 「(2024년 1111번)」과 이력 조회의 신청번호 「2024-1111」도 받는다.
 * J(증빙 자료명)·K(비고) 어느 쪽에 적어도 된다 — 양식은 K 라지만 J 에 적는 일이 많다.
 */
export function subsidyIdOf(text: string | null | undefined): { year: number; no: number } | null {
  const t = (text ?? '').normalize('NFC');
  // 「2024년 1111번」 — 해와 번호가 붙어 온다. 「2024년 2번 교체」 같은 글과 섞이지 않게 보조사업 말이 있을 때만
  const pair = /보조|대기|사업\s*연도/.test(t) ? /(?<!\d)(20[1-3]\d)\s*년\s*(\d{1,6})\s*번/.exec(t) : null;
  if (pair) return { year: +pair[1], no: +pair[2] };
  // 신청번호 「2024-1111」 — 날짜(2023-02-21)·세움터 접수번호와 섞이지 않게 이름표가 붙어 있을 때만
  const dash = /(?:대기|신청)\s*번호\s*[:：]?\s*(20[1-3]\d)\s*-\s*(\d{1,6})(?![\d-])/.exec(t);
  if (dash) return { year: +dash[1], no: +dash[2] };
  const num = /대기\s*번호\s*[:：]?\s*(\d{1,6})/.exec(t);
  if (!num) return null;
  // 해는 번호 자리를 뺀 나머지에서 찾는다 — 번호가 「2014」 같은 모양이면 해로 읽힌다
  const rest = `${t.slice(0, num.index)} ${t.slice(num.index + num[0].length)}`;
  const year = /사업\s*연도\s*[:：]?\s*(20[1-3]\d)/.exec(rest) ?? /(?<!\d)(20[1-3]\d)(?!\d)/.exec(rest);
  return year ? { year: +year[1], no: +num[1] } : null;
}

const rowSubsidy = (row: LegacyRow) => subsidyIdOf(`${row.evidence ?? ''} ${row.note ?? ''}`);

/**
 * ★순수 보조사업 이력 — 모든 줄에 사업연도·대기번호가 있다★ (한백 지시 2026-10-08). 그러면 따로 증빙이 필요 없어
 * 대조(검수)를 하지 않는다: 증빙을 판독에 보내지 않고, 계약 확인도 막지 않는다(preCheckBlocker). 한 줄이라도
 * 보조사업이 아니면(자부담 설치·행위신고 증빙 줄) 평소대로 대조한다 — 그때도 보조사업 줄은 그 줄만 면제다.
 */
export function subsidyOnly(sheet: LegacySheet): boolean {
  return sheet.rows.length > 0 && sheet.rows.every((r) => rowSubsidy(r) !== null);
}

/**
 * 사람이 따로 봐야 하는 줄의 수 — 어긋남이 아니라 코드가 판정할 수 없는 줄이다(설계도면 증빙).
 * 짚을 것(issueCount)에 섞지 않는다: 섞으면 준공 때 설치한 현장은 늘 「어긋남」으로 보인다.
 */
export function reviewCount(c: PreInstallCheck): number {
  return c.problem ? 0 : c.lines.filter((l) => l.verdict === 'review').length;
}

/** 짚을 것의 수 — 화면 꼬리표와 할 일이 같은 수를 센다 */
export function issueCount(c: PreInstallCheck): number {
  const seal = c.seal && missingSeals(c.seal).length > 0 ? 1 : 0;
  // 줄 대조를 못 했어도 직인은 본다(스캔본만 낸 현장) — 둘을 같이 센다
  if (c.problem) return 1 + seal;
  return c.lines.filter((l) => l.verdict === 'diff' || l.verdict === 'no-evidence'
      || l.verdict === 'no-row' || l.verdict === 'no-count').length
    + (c.standing?.verdict === 'diff' ? 1 : 0)
    + (c.survey?.verdict === 'diff' ? 1 : 0)
    + (c.sheet?.badSplit.length ?? 0)
    + seal;
}

const flat = (s: string | null | undefined) => (s ?? '').normalize('NFC').replace(/\s+/g, '');
/** 신고번호를 견줄 모양 — 「제 … 호」와 띄어쓰기를 걷는다 */
const numberKey = (s: string) => flat(s).replace(/^제/, '').replace(/호$/, '');

/** 이 행위로 늘거나 준 기수 — 적힌 수가 먼저, 없으면 전·후 차이 */
export function countOf(act: EvidenceAct): number | null {
  if (act.count !== null) return act.count;
  if (act.before === null || act.after === null) return null;
  return Math.abs(act.after - act.before);
}

const kindKey = (k: string | null) => {
  const f = flat(k);
  if (/교체/.test(f)) return '교체';
  if (/철거/.test(f)) return '철거';
  if (/신규|설치/.test(f)) return '신규';
  return null;
};

export function compareLegacy(
  sheet: LegacySheet,
  acts: EvidenceAct[],
  ctx: {
    /** 콘솔의 조사 결과 — checked 가 false 면 견주지 않는다 */
    survey: { state: PreInstall; checked: boolean };
    /** 계약 접수일 — 이 날 이후의 신고는 이번 설치 건이다. 모르면 null */
    since: string | null;
  }
): Pick<PreInstallCheck, 'lines' | 'standing' | 'survey'> {
  const isCurrent = (a: EvidenceAct) => a.doc === '행위신고' && !!ctx.since && !!a.date && a.date >= ctx.since;
  const used = new Set<EvidenceAct>();
  const lines: CheckLine[] = [];

  for (const row of sheet.rows) {
    const free = acts.filter((a) => !used.has(a) && !isCurrent(a));
    const text = flat(`${row.evidence ?? ''}${row.note ?? ''}`);
    const act = free.find((a) => a.number && text.includes(numberKey(a.number)))
      // 같은 날 문서가 여럿이면(행위신고와 그 필증) 수량을 말하는 쪽 — 행위신고가 먼저다
      ?? free.filter((a) => a.date && a.date === row.date)
        .sort((a, b) => Number(b.doc === '행위신고') - Number(a.doc === '행위신고'))[0];

    if (!act) {
      // 보조사업 설치분 — 사업연도·대기번호가 있어야 면제다(subsidyIdOf). 읽은 번호를 곁글로 남겨 사람이 이력 조회와 견준다
      const id = rowSubsidy(row);
      if (id) {
        lines.push({ verdict: 'exempt', row, act: null, actCount: null, why: `보조사업 ${id.year}년 ${id.no}번 · 증빙 면제` });
        continue;
      }
      /*
       * ★설계도면이 증빙인 줄은 「개별 검토 필요」다★ (한백 지시 2026-10-06).
       * 준공 때 건설사가 설치한 충전기는 행위신고가 없어 도면으로 센다(안내문 유형 6) — 행위 일자는
       * 사용승인일이라 도면에 찍힌 날짜와 짝이 안 맞고, 기수도 도면의 기호를 세어야 한다.
       * 코드가 맞다 틀리다 할 수 없으니 「증빙 없음」으로 짚지 않고 사람에게 넘긴다.
       * 증빙 칸에 도면이 있으면 그 줄에 붙여 어느 파일을 보면 되는지 보이게 한다.
       */
      if (/도면|준공시|준공당시/.test(text)) {
        const drawing = free.find((a) => a.doc === '도면');
        if (drawing) used.add(drawing);
        lines.push({
          verdict: 'review', row, act: drawing ?? null, actCount: drawing ? countOf(drawing) : null,
          why: drawing ? '설계도면 증빙' : '설계도면 증빙 — 증빙 칸에서 도면을 찾지 못함',
        });
        continue;
      }
      lines.push({
        verdict: 'no-evidence', row, act: null, actCount: null,
        why: /보조/.test(text)
          ? '보조사업 표기에 사업연도·대기번호가 없어 면제 불가'
          : `${row.date ?? '날짜 없음'} 행위의 증빙을 찾지 못함`,
      });
      continue;
    }
    used.add(act);
    const n = countOf(act);
    const whys: string[] = [];
    if (n !== null && row.d !== null && n !== row.d) whys.push(`기수 — 엑셀 ${row.d}기 · 증빙 ${n}기`);
    const rk = kindKey(row.kind);
    const ak = kindKey(act.kind);
    if (rk && ak && rk !== ak) whys.push(`구분 — 엑셀 ${row.kind} · 증빙 ${act.kind}`);
    if (act.date && row.date && act.date !== row.date) whys.push(`일자 — 엑셀 ${row.date} · 증빙 ${act.date}`);
    lines.push({
      verdict: whys.length > 0 ? 'diff' : n === null ? 'no-count' : 'ok',
      row, act, actCount: n,
      why: whys.length > 0 ? whys.join(' · ') : n === null ? '증빙에서 기수를 읽지 못함' : null,
    });
  }

  for (const act of acts) {
    if (used.has(act)) continue;
    const current = isCurrent(act);
    const loose = act.doc === '행위신고' && !current;
    lines.push({
      verdict: current ? 'current' : loose ? 'no-row' : 'extra',
      row: null, act, actCount: countOf(act),
      why: loose ? `${act.date ?? '날짜 없음'} 행위신고가 엑셀에 없음` : null,
    });
  }

  /*
   * 지금 서 있는 수의 증빙 — 이번 설치 건의 신고가 있으면 그 「행위 전」(안내문 유형 4),
   * 없으면 마지막 행위신고의 「행위 후」(유형 5). 날짜 없는 신고는 순서를 알 수 없어 빼고 센다.
   */
  const reports = acts.filter((a) => a.doc === '행위신고' && a.date);
  const current = reports.filter(isCurrent).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const last = reports.filter((a) => !isCurrent(a) && a.after !== null)
    .sort((a, b) => b.date!.localeCompare(a.date!))[0];
  const pick = current && current.before !== null
    ? { n: current.before, from: `${current.date} 신고의 행위 전` }
    : last ? { n: last.after!, from: `${last.date} 신고의 행위 후` } : null;
  // 줄이 전부 보조사업 면제면 견줄 증빙이 없다 — 「행위신고 없음」으로 짚지 않는다
  const allExempt = lines.length > 0 && lines.every((l) => l.verdict === 'exempt');
  const standing = allExempt ? null : {
    sheet: sheet.standing,
    evidence: pick?.n ?? null,
    from: pick?.from ?? null,
    // 엑셀이 0기이고 행위신고도 없으면 맞다 — 기설치 없는 현장의 정상 모양이다
    verdict: pick === null ? (sheet.standing === 0 ? 'ok' as const : 'unknown' as const)
      : pick.n === sheet.standing ? 'ok' as const : 'diff' as const,
  };

  // 기설치는 최종 기설치 수량(H)으로 본다 — 8년 전에 임의로 걷은 것(F)도 기설치로 센다(양식)
  const survey = ctx.survey.checked
    ? {
      state: ctx.survey.state,
      verdict: (ctx.survey.state === '있음') === (sheet.final > 0) ? 'ok' as const : 'diff' as const,
    }
    : null;

  return { lines, standing, survey };
}

/** 대조에 쓴 파일과 지금 칸의 파일이 같은가 — 다르면 지난 결과를 믿지 않는다(「서류가 바뀜」) */
export function sameFiles(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
}

/** 대조가 견주는 칸 — 설치이력·증빙. 지금 이 두 칸의 파일이 「대조에 쓴 파일」과 같아야 한다 */
export const CHECKED_KINDS = ['legacylog', 'legacyev'] as const;

/** 두 칸의 지금 파일 주소 — 화면(PreInstall)과 저장소(계약 확인)가 같은 값을 만든다 */
export function checkedFilesOf(documents: Array<{ kind: string; files: Array<{ url: string }> }>): string[] {
  return CHECKED_KINDS.flatMap((k) => documents.find((d) => d.kind === k)?.files.map((f) => f.url) ?? []);
}

/**
 * ★설치이력을 PDF 로도 냈으면 대조하지 않는다★ (한백 지시 2026-10-07 「기설치 설치이력을 PDF 로도 올린 거면 모든 자료를
 * 한꺼번에 다 줬다는 거야 — 대조 안 해도 돼, 계약 확인으로 넘어가게」). 설치이력 칸에 PDF(스캔한 날인본·이력+증빙
 * 묶음)가 한 장이라도 있으면 그 현장은 자료를 한 묶음으로 다 낸 것으로 보고 대조를 계약 확인의 조건에서 뺀다.
 * 대조 결과가 있으면 화면은 그대로 보여준다(참고) — 막지만 않는다.
 */
export function bundledAsPdf(documents: Array<{ kind: string; files: Array<{ name: string }> }>): boolean {
  return documents.find((d) => d.kind === 'legacylog')?.files.some((f) => /\.pdf$/i.test(f.name)) ?? false;
}

/**
 * ★계약 확인을 막는 대조 사정★ — null 이면 통과 (한백 지시 2026-10-07 「검증 필수」).
 *
 * 보조사업(기설치 조사를 하는 현장)이고 서류가 콘솔에 있는 현장만 본다 — 이관 현장은 서류가 노션에
 * 있어 대조할 것이 없다(계약 확인의 docsExempt 와 같은 면제). 통과는 둘 중 하나다:
 *   · 지금 칸의 파일로 돌린 대조가 짚을 것 0 · 개별 검토 0
 *   · 남아 있어도 한백이 그 결과를 보고 「확인함」으로 넘김(accepted)
 * 파일이 바뀌면 둘 다 무효다 — 확인한 것은 그때의 서류다.
 *
 * 글은 계약 확인 단추 이름에 그대로 붙는다(「… — 계약 확인 불가」, 화면 규칙 3).
 */
export function preCheckBlocker(input: {
  /** 보조사업이고 이관 현장이 아닌가 */
  needed: boolean;
  check: PreInstallCheck | null | undefined;
  /** 지금 설치이력·증빙 칸의 파일 주소(checkedFilesOf) */
  currentFiles: string[];
  /** 설치이력을 PDF 로도 냈다 — 대조하지 않는다(bundledAsPdf) */
  bundled?: boolean;
}): string | null {
  if (!input.needed || input.bundled) return null;
  const c = input.check;
  if (!c) return '기설치 대조 전';
  if (!sameFiles(c.files, input.currentFiles)) return '기설치 서류 바뀜 — 다시 대조';
  // 순수 보조사업 이력 — 증빙이 필요 없어 검수하지 않는다(subsidyOnly, 한백 지시 2026-10-08)
  if (c.subsidyOnly) return null;
  const left = issueCount(c) + reviewCount(c);
  if (left > 0 && !c.accepted) return `기설치 대조 ${left}건 미확인`;
  return null;
}

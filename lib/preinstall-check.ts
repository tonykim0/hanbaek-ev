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
 * ★막지 않는다★ — 짚기만 한다. 판독은 스캔 품질에 따라 틀리고, 반려는 사람이 누른다.
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
}

/** 짚을 것의 수 — 화면 꼬리표와 할 일이 같은 수를 센다 */
export function issueCount(c: PreInstallCheck): number {
  if (c.problem) return 1;
  return c.lines.filter((l) => l.verdict === 'diff' || l.verdict === 'no-evidence'
      || l.verdict === 'no-row' || l.verdict === 'no-count').length
    + (c.standing?.verdict === 'diff' ? 1 : 0)
    + (c.survey?.verdict === 'diff' ? 1 : 0)
    + (c.sheet?.badSplit.length ?? 0);
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
      // 양식은 비고(K)에 적으라지만 실제 엑셀은 증빙 자료명(J)에 「사업연도 2025 대기번호 1829」로 적는 일이 많다
      const exempt = /보조사업|대기번호|\d{4}년\s*\d+번/.test(`${row.evidence ?? ''} ${row.note ?? ''}`);
      lines.push({
        verdict: exempt ? 'exempt' : 'no-evidence', row, act: null, actCount: null,
        why: exempt ? null : `${row.date ?? '날짜 없음'} 행위의 증빙을 찾지 못함`,
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
  const standing = {
    sheet: sheet.standing,
    evidence: pick?.n ?? null,
    from: pick?.from ?? null,
    verdict: pick === null ? 'unknown' as const : pick.n === sheet.standing ? 'ok' as const : 'diff' as const,
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

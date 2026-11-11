/**
 * 현장 표(계약관리·시공관리의 「표」 보기)의 열 · 정렬 · 엑셀 한 장 — 화면과 엑셀이 같이 본다.
 *
 * 열 정의와 정렬이 표 부품(components/ProjectTable) 안에 있었다. 「엑셀 받기」가 같은 열을 같은 순서로 내려면
 * 같은 정의를 봐야 한다 — 두 벌이면 열을 하나 더할 때 한쪽만 바뀐다. 그래서 순수한 것은 여기로 옮겼다.
 * 값을 「어떻게 그리나」(달력 · 배지 · ✓)는 그대로 표 부품의 일이고, 여기는 「무슨 값인가」만 정한다.
 */
import type { ProjectSummary } from '@/types/project';
import { subsidized } from '@/types/project';
import { BOARD_COLUMNS, boardColumnOf, constructionLabelOf } from '@/lib/board';
import type { AttrKey } from '@/lib/project-filter';
import { hasKepcoWork, stepsOf } from '@/lib/process';
import type { ProcessStatus } from '@/types/project';
import type { XlsxCell, XlsxColumn } from '@/lib/xlsx-write';

/**
 * 골라 볼 수 있는 열 — 현장(이름)만 항상 있다.
 * 고른 것은 브라우저에 페이지별로 남는다(계약·시공이 각자 다른 열을 본다).
 */
export const PICKABLE = [
  { key: 'stage', label: '단계', attr: 'col', group: '기본' },
  /*
   * 진행단계 — 단계 안에서 실제로 어디까지 왔나(한백 2026-11-11 「계약관리 시공관리 표에 진행단계도 표시해줘」 → 「단계 안의
   * 세부 진행」). 아래 progressOf. 두 페이지 다 기본으로 선다 — 옛 「열」 저장의 seen 에 없어 페이지 기본을 따른다(restoreHidden).
   */
  { key: 'progress', label: '진행단계', attr: 'progress', group: '기본' },
  { key: 'qty', label: '대수', group: '기본' },
  { key: 'term', label: '계약연수', attr: 'term', group: '기본' },
  { key: 'cpo', label: '운영사', attr: 'cpo', group: '기본' },
  /*
   * 전력인입(= 현장의 수전방식 칸) — 시공관리에도 기본으로 선다(한백 2026-11-06 「보드랑 필터표에 전력인입도 넣어줘.
   * 모자분리랑 한전불입」). 한전불입이면 외선공사 · 계량기 부설까지 가는 현장이라 시공에서 먼저 갈라 본다.
   * ★열 이름(key)을 'power' 에서 바꿨다★ — 시공관리에서 숨김이 기본이던 때 「열」을 저장한 브라우저에는 'power' 가
   * 숨긴 열로 남아 있다. 새 이름은 그 저장의 seen 에 없으니 페이지 기본(켜짐)을 따른다(restoreHidden).
   */
  { key: 'powerIn', label: '전력인입', attr: 'power', group: '기본' },
  { key: 'sales', label: '영업사', attr: 'sales', group: '기본' },
  { key: 'gc', label: '시공사', attr: 'gc', group: '기본' },
  { key: 'created', label: '접수일', attr: 'month', group: '기본' },
  // 영업(계약) 단계에서 다루는 속성
  { key: 'queue', label: '환경부 대기번호', attr: 'queue', group: '영업' },
  { key: 'biz', label: '사업유형', attr: 'biz', group: '영업' },
  { key: 'bldg', label: '건축물', attr: 'bldg', group: '영업' },
  // 시공 마일스톤 — 날짜의 유무가 곧 그 일의 여부다. 완료 체크는 ✓ 로 얹는다.
  // 한 칸 — 환경부 승인과 운영사 시공승인을 같은 날로 본다 (한백 2026-08-27)
  // ★일이 일어나는 차례다★ — 시공 탭의 구간 · 상자 차례와 같다(2026-11-05 기록 날짜를 더하며 맞췄다)
  { key: 'envApproval', label: '환경부 승인일', group: '시공' },
  { key: 'notify', label: '행위신고 신청', group: '시공' },
  { key: 'notifyCert', label: '행위신고 완료', group: '시공' },
  { key: 'chargerOrder', label: '충전기 발주', group: '시공' },
  { key: 'chargerRecv', label: '충전기 수령', group: '시공' },
  { key: 'preStart', label: '착공서류 제출', group: '시공' },
  { key: 'start', label: '착공', group: '시공' },
  { key: 'foundation', label: '기초·배관/배선', group: '시공' },
  { key: 'chargerInstall', label: '충전기·캐노피 설치', group: '시공' },
  { key: 'install', label: '설치완료', group: '시공' },
  /*
   * 시공완료 뒤의 전기 일 — 「전기사용신청 → 사용전점검/검사 → (한전불입: 외선공사 · 계량기) → 사용검사 → 개통」
   * (한백 공정 설명 2026-11-05). 묶음을 따로 둔다 — 「열」에서 한 번에 켜고 끈다.
   */
  { key: 'elecApply', label: '전기사용신청', group: '전기·개통' },
  { key: 'safetyCheck', label: '사용전점검/검사', group: '전기·개통' },
  { key: 'kepcoLine', label: '한전 외선공사', group: '전기·개통' },
  { key: 'meter', label: '계량기 부설', group: '전기·개통' },
  { key: 'useInspectApply', label: '사용검사 신청', group: '전기·개통' },
  { key: 'comm', label: '개통', group: '전기·개통' },
  { key: 'completion', label: '준공서류', group: '전기·개통' },
] as const satisfies readonly {
  key: string; label: string; attr?: AttrKey; group: '기본' | '영업' | '시공' | '전기·개통';
}[];
export type ColKey = (typeof PICKABLE)[number]['key'];
export const PICK_GROUPS = ['기본', '영업', '시공', '전기·개통'] as const;

/**
 * 이번에 열을 더하기 전(2026-11-05)까지 있던 열 — 브라우저에 남은 옛 「열」 고르기를 읽을 때 쓴다.
 *
 * 옛 저장은 「숨긴 열」 목록뿐이라, 그 뒤에 생긴 열은 거기 없어 「켜 둔 열」로 읽힌다. 계약관리에서 열을 골라 둔
 * 사람의 표에 시공 날짜 열 아홉이 갑자기 서는 것이 그것이다. 그래서 이 목록에 없는 열은 그 페이지의 기본을 따른다
 * (components/ProjectTable useTableColumns). 새 저장은 그때 있던 열(seen)을 같이 남겨 다음에도 같은 판정을 한다.
 */
export const LEGACY_KEYS: readonly string[] = [
  'stage', 'qty', 'term', 'cpo', 'sales', 'gc', 'created', 'queue', 'biz', 'bldg', 'power',
  'envApproval', 'notify', 'chargerOrder', 'chargerRecv', 'start', 'install', 'comm', 'completion',
];

export type TableTab = 'intake' | 'construction';

/**
 * 표에 열이 서는 차례 — 표의 머리글이 이 차례로 선다. 「열」 고르기의 묶음 차례(PICKABLE)와 다르다:
 * 고르기는 기본·영업·시공으로 묶어 보이고, 표는 운영사 옆에 영업 속성을, 끝에 접수일을 둔다.
 */
export const TABLE_ORDER: readonly ColKey[] = [
  'stage', 'progress', 'qty', 'term', 'cpo', 'queue', 'biz', 'bldg', 'powerIn', 'sales', 'gc',
  'envApproval', 'notify', 'notifyCert', 'chargerOrder', 'chargerRecv', 'preStart', 'start', 'foundation',
  'chargerInstall', 'install', 'elecApply', 'safetyCheck', 'kepcoLine', 'meter', 'useInspectApply', 'comm', 'completion',
  'created',
];

/**
 * 페이지별 기본 열 — 사용자가 「열」에서 고르기 전의 시작점.
 * 계약 페이지에는 아직 없는 시공 일정을, 시공 페이지에는 계약 속성을 접어 둔다.
 */
export const MILESTONE_KEYS = [
  'envApproval', 'notify', 'notifyCert', 'chargerOrder', 'chargerRecv', 'preStart', 'start', 'foundation',
  'chargerInstall', 'install', 'elecApply', 'safetyCheck', 'kepcoLine', 'meter', 'useInspectApply', 'comm', 'completion',
] as const;
/** 날짜 열의 이름 — 열 이름이자 그 열 머리글이 거는 필터 축의 이름이다(lib/project-filter) */
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
export const DEFAULT_HIDDEN: Record<TableTab, readonly ColKey[]> = {
  intake: MILESTONE_KEYS,
  construction: ['queue', 'biz', 'bldg', 'created'],
};

/**
 * 브라우저에 남은 「열」 고르기를 읽는다 — 저장한 뒤에 생긴 열은 그 페이지의 기본을 따른다.
 *
 * 옛 저장은 숨긴 열 목록(배열)뿐이었다. 그대로 읽으면 그 뒤에 더한 열(2026-11-05 시공 기록 날짜 아홉)이 목록에 없어
 * 켜진 것으로 읽히고, 계약관리에서 열을 골라 둔 사람의 표에 시공 날짜 열이 갑자기 선다. 그때 있던 열(seen)에
 * 없는 열만 기본값으로 채운다 — 사람이 고른 것은 그대로다. 옛 배열은 seen 을 LEGACY_KEYS 로 본다.
 */
export function restoreHidden(saved: unknown, defaults: readonly ColKey[]): Set<ColKey> {
  const known = new Set<string>(PICKABLE.map((c) => c.key));
  const v2 = saved && typeof saved === 'object' && !Array.isArray(saved)
    ? (saved as { hidden?: unknown; seen?: unknown })
    : null;
  const hiddenRaw = Array.isArray(saved) ? saved : Array.isArray(v2?.hidden) ? v2.hidden : [];
  const seenRaw = Array.isArray(v2?.seen) ? v2.seen : LEGACY_KEYS;
  const seen = new Set<string>(seenRaw.filter((k): k is string => typeof k === 'string'));
  const hidden = new Set<ColKey>(
    hiddenRaw.filter((k): k is ColKey => typeof k === 'string' && known.has(k))
  );
  for (const k of defaults) if (!seen.has(k)) hidden.add(k);
  return hidden;
}

export type SortKey = 'name' | 'stage' | 'progress' | 'qty' | 'term' | 'created';

const COLUMN_ORDER = new Map(BOARD_COLUMNS.map((c, i) => [c.key, i]));
export const qtyOf = (p: ProjectSummary): number => p.lines.reduce((s, l) => s + l.qty, 0);

/**
 * 계약연수 — 라인마다 다를 수 있다.
 * 7년 3대 + 10년 4대인 현장이 있어서 하나로 뭉개면 계약이 달라진다.
 */
export function termsOf(p: ProjectSummary): string {
  const years = [...new Set(p.lines.map((l) => l.termYears))].sort((a, b) => a - b);
  return years.length === 0 ? '—' : years.map((y) => `${y}년`).join(' · ');
}
const maxTermOf = (p: ProjectSummary) => Math.max(0, ...p.lines.map((l) => l.termYears));

/** 표의 줄 차례 — 머리글을 눌러 고른 정렬. 엑셀도 이 차례로 낸다(화면에서 본 차례 그대로) */
export function sortProjects(projects: ProjectSummary[], sort: SortKey, desc: boolean): ProjectSummary[] {
  const dir = desc ? -1 : 1;
  const val = (p: ProjectSummary): number | string => {
    switch (sort) {
      case 'name': return p.name;
      case 'stage': return COLUMN_ORDER.get(boardColumnOf(p)) ?? 0;
      // 일의 차례 → 같은 일이면 그 날(먼저 한 현장이 앞) — 「착공 단계 중 어디까지」를 줄 세운다
      case 'progress': return progressRankOf(p);
      case 'qty': return qtyOf(p);
      case 'term': return maxTermOf(p);
      case 'created': return p.createdAt;
    }
  };
  return [...projects].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y, 'ko') * dir;
    return ((x as number) - (y as number)) * dir;
  });
}

/** 단계 이름 — 시공관리에서는 맞물리는 칸을 보드와 같은 이름(「환경부 승인 대기」)으로 부른다(lib/board) */
export function stageLabelOf(p: ProjectSummary, tab: TableTab): string {
  const col = boardColumnOf(p);
  return tab === 'construction' ? constructionLabelOf(col as ProcessStatus) : col;
}

/** 이 현장이 충전기 발주·수령을 지나는가 — 기설치 연동은 안 지난다(lib/process stepsOf) */
export const passesCharger = (p: ProjectSummary): boolean => stepsOf(p).includes('충전기 발주');

const NA = '해당없음';

/** 표에서 적는 날짜 칸 — 이름은 저장 라우트(/process)의 칸 이름과 같다 */
export type TableDateField =
  | 'envApprovalDate' | 'notifyDate' | 'notifyCertDate' | 'chargerOrderDate' | 'chargerRecvDate'
  | 'preStartSubmitDate' | 'startActualDate' | 'foundationDate' | 'chargerInstallDate' | 'installDoneDate'
  | 'elecApplyDate' | 'safetyCheckDate' | 'kepcoLineDate' | 'meterDate' | 'useInspectApplyDate' | 'openDate';

/** 날짜 열 하나 — 무슨 값이고, 어디에 저장하고, 언제 규칙상 없는가 */
export interface DateCol {
  /** 저장 칸 — 없으면 표에서 못 고친다(준공서류 제출은 조건을 묻는 선언이라 상세에서만 찍는다) */
  field?: TableDateField;
  /** 칸의 온 이름 — 달력의 읽는 이름 · 엑셀 머리(엑셀에는 칸 모양이 없어 날짜인지 이름이 말한다) */
  name: string;
  /** 진행단계에서 부르는 일 이름 — 없으면 열 이름(labelOf). 열 이름이 일 이름이 아닌 둘(「환경부 승인일」 · 「준공서류」)만 적는다 */
  step?: string;
  date: (p: ProjectSummary) => string | null;
  /** 완료 선언 — 날짜 옆 ✓ · 날짜 없이 선언만 있으면 엑셀에 「완료」 */
  done?: (p: ProjectSummary) => boolean;
  /** 규칙상 없는 칸 — 「해당없음」, 고치는 자리를 주지 않는다(화면 규칙 10) */
  na?: (p: ProjectSummary) => boolean;
}

const m = (p: ProjectSummary) => p.milestones;
const noCharger = (p: ProjectSummary) => !passesCharger(p);
const noKepco = (p: ProjectSummary) => !hasKepcoWork(p.powerType);

/**
 * 날짜 열 — 표의 칸(components/ProjectTable)과 엑셀이 같이 본다. 판정은 시공 탭과 같다:
 * 자체투자는 환경부 승인이 없고, 행위신고 「대상 아님」은 신고 칸이 없고, 기설치 연동은 충전기 발주·수령을 안 지나고,
 * 모자분리는 한전 외선공사 · 계량기 부설이 없다.
 */
export const DATE_COLS: Partial<Record<ColKey, DateCol>> = {
  /* 날짜 열마다 정의가 있다 — 빠지면 그 열의 필터(presenceOf)가 설 자리가 없다. satisfies 가 컴파일 때 본다 */
  envApproval: {
    field: 'envApprovalDate', name: '환경부 승인일', step: '환경부 승인', date: (p) => m(p).envApprovalDate,
    na: (p) => !subsidized(p.bizType),
  },
  notify: { field: 'notifyDate', name: '행위신고 신청일', date: (p) => m(p).notifyDate, na: (p) => m(p).notifySkipped },
  notifyCert: {
    field: 'notifyCertDate', name: '행위신고 완료일', date: (p) => m(p).notifyCertDate,
    done: (p) => m(p).notifyDone, na: (p) => m(p).notifySkipped,
  },
  chargerOrder: { field: 'chargerOrderDate', name: '충전기 발주일', date: (p) => m(p).chargerOrderDate, na: noCharger },
  chargerRecv: {
    field: 'chargerRecvDate', name: '충전기 수령일', date: (p) => m(p).chargerRecvDate,
    done: (p) => m(p).chargerDone, na: noCharger,
  },
  preStart: { field: 'preStartSubmitDate', name: '착공서류 제출일', date: (p) => m(p).preStartSubmitDate },
  start: { field: 'startActualDate', name: '착공일', date: (p) => m(p).startDate },
  foundation: { field: 'foundationDate', name: '기초 및 배관/배선일', date: (p) => m(p).foundationDate },
  chargerInstall: { field: 'chargerInstallDate', name: '충전기 및 캐노피 설치일', date: (p) => m(p).chargerInstallDate },
  install: {
    field: 'installDoneDate', name: '설치완료일', date: (p) => m(p).installDoneDate, done: (p) => m(p).installConfirmed,
  },
  elecApply: { field: 'elecApplyDate', name: '전기사용신청일', date: (p) => m(p).elecApplyDate },
  safetyCheck: { field: 'safetyCheckDate', name: '사용전점검/검사일', date: (p) => m(p).safetyCheckDate },
  kepcoLine: { field: 'kepcoLineDate', name: '한전 외선공사일', date: (p) => m(p).kepcoLineDate, na: noKepco },
  meter: { field: 'meterDate', name: '계량기 부설일', date: (p) => m(p).meterDate, na: noKepco },
  useInspectApply: { field: 'useInspectApplyDate', name: '지자체 사용검사 신청일', date: (p) => m(p).useInspectApplyDate },
  comm: { field: 'openDate', name: '개통완료일', date: (p) => m(p).openDate, done: (p) => m(p).openDone },
  completion: { name: '준공서류 제출일', step: '준공서류 제출', date: (p) => m(p).completionSubmitAt },
} satisfies Record<MilestoneKey, DateCol>;

/** 날짜 열의 차례 — 표가 이 차례로 그린다 */
export const DATE_KEYS: readonly MilestoneKey[] = TABLE_ORDER.filter(
  (k): k is MilestoneKey => DATE_COLS[k] !== undefined
);

/** 열의 이름 — 「열」 고르기 · 표 머리글 · 그 열의 필터가 같은 이름을 쓴다 */
export const labelOf = (key: ColKey): string => PICKABLE.find((c) => c.key === key)?.label ?? key;

/**
 * 날짜 칸이 있나 — 날짜 열 머리글의 필터가 거르는 값(한백 2026-11-10 「필터를 걸고 해당 필터 값이 있는지 없는지
 * 해당없음인지 구분해서 또 한 번 보고싶어」). 환경부 대기번호 축과 같은 세 말이다(lib/project-filter).
 *
 * ★칸에 보이는 그대로 가른다★ — 해당없음은 칸의 「해당없음」(DATE_COLS na — 화면 · 엑셀과 같은 판정), 있음은 날짜가
 * 적혔거나 날짜 없이 완료(✓)만 찍힌 옛 칸(칸에 ✓ 가 보이고 엑셀에는 「완료」로 나간다), 없음은 「—」인 칸이다.
 * 필터로 고른 「없음」이 표에서 ✓ 칸을 보여 주면 거른 것이 틀려 보인다.
 */
export const PRESENCE = ['있음', '없음', '해당없음'] as const;
export type Presence = (typeof PRESENCE)[number];

export function presenceOf(key: MilestoneKey, p: ProjectSummary): Presence {
  const col = DATE_COLS[key]!; // 날짜 열마다 정의가 있다(위 satisfies)
  if (col.na?.(p)) return '해당없음';
  return col.date(p) || col.done?.(p) ? '있음' : '없음';
}

/** 진행단계의 일 이름 — 날짜 열의 차례 그대로다(필터 값의 차례도 이것) */
const stepOf = (key: MilestoneKey): string => DATE_COLS[key]!.step ?? labelOf(key);
export const PROGRESS_STEPS: readonly string[] = DATE_KEYS.map(stepOf);

export interface Progress {
  key: MilestoneKey;
  /** 일 이름 — 「충전기·캐노피 설치」 */
  step: string;
  /** 그 일의 날 — 날짜 없이 완료(✓)만 찍힌 옛 칸이면 null */
  date: string | null;
}

/**
 * 진행단계 — 단계 안에서 실제로 어디까지 왔나(한백 2026-11-11 「계약관리 시공관리 표에 진행단계도 표시해줘」 → 「단계 안의
 * 세부 진행」). 단계(보드 칸)는 「착공」 하나인데 그 안에 기초 · 배관/배선 → 충전기 · 캐노피 설치 → 설치완료가 있다 — 날짜 열을
 * 다 펴야 보이던 것을 한 칸에 둔다.
 *
 * ★일이 일어나는 차례(DATE_KEYS)에서 가장 뒤의 적힌 일이다 — 적은 날이 가장 늦은 일이 아니다★: 충전기를 받은 뒤에 행위신고
 * 완료일을 적었다고 진행이 뒤로 가지 않는다. 적혔는지는 날짜 열의 필터와 같은 판정이다(presenceOf — 날짜 없이 완료 ✓ 만 찍힌
 * 옛 칸도 지난 일, 해당없음은 건너뛴다). 아무것도 안 적혔으면 null — 표는 「—」(아직 올 때가 아님 · 화면 규칙 10).
 * 계약 국면의 현장은 대개 null 이다 — 그 국면의 진행은 단계(계약접수 → 계약검토 → …)가 이미 말한다.
 */
export function progressOf(p: ProjectSummary): Progress | null {
  for (let i = DATE_KEYS.length - 1; i >= 0; i--) {
    const key = DATE_KEYS[i];
    if (presenceOf(key, p) === '있음') return { key, step: stepOf(key), date: DATE_COLS[key]!.date(p) };
  }
  return null;
}

/**
 * 진행단계로 줄 세우는 수 — 일의 차례가 앞자리, 같은 일이면 그 날(20261103)이 뒷자리. 아무것도 없으면 0(맨 앞) ·
 * 날짜 없이 완료만 찍힌 옛 칸은 그 일의 맨 앞. 글자로 견주지 않는다 — 한국어 정렬 규칙이 기호를 어떻게 볼지 기대지 않게.
 */
function progressRankOf(p: ProjectSummary): number {
  const g = progressOf(p);
  if (!g) return 0;
  const day = g.date ? Number(g.date.slice(0, 10).replace(/-/g, '')) || 0 : 0;
  return (DATE_KEYS.indexOf(g.key) + 1) * 1e8 + day;
}

/**
 * 그 열의 머리글에서 거는 필터 축 — 없으면 거르지 않는 열(대수 등).
 * 날짜 열은 제 이름의 축(있음 · 없음 · 해당없음)이다. 열을 숨기면 그 축의 필터를 같이 푼다(components/ProjectTable).
 */
export function filterAttrOf(key: ColKey): AttrKey | undefined {
  const def = PICKABLE.find((c) => c.key === key);
  if (def && 'attr' in def) return def.attr;
  return (MILESTONE_KEYS as readonly ColKey[]).includes(key) ? (key as MilestoneKey) : undefined;
}

/**
 * 날짜 칸의 엑셀 값 — 날짜는 진짜 날짜, 날짜 없이 완료 선언만 있는 옛 현장은 「완료」, 아직이면 빈 칸.
 * 화면은 날짜 옆에 ✓ 를 얹지만 엑셀 칸에 글자를 붙이면 날짜가 글자가 되어 날짜로 못 거른다 — 날짜를 지킨다.
 */
function dateCell(col: DateCol, p: ProjectSummary): XlsxCell {
  if (col.na?.(p)) return NA;
  const date = col.date(p);
  if (date) return { date };
  return col.done?.(p) ? '완료' : null;
}

/** 열 하나의 엑셀 값 — 화면의 그 칸과 같은 판정(해당없음 · 빈 칸)을 쓴다 */
function cellOf(p: ProjectSummary, key: ColKey, tab: TableTab): XlsxCell {
  const col = DATE_COLS[key];
  if (col) return dateCell(col, p);
  switch (key) {
    case 'stage': return stageLabelOf(p, tab);
    case 'qty': return qtyOf(p);
    case 'term': { const t = termsOf(p); return t === '—' ? null : t; }
    case 'cpo': return p.cpo ?? null;
    case 'queue': return subsidized(p.bizType) ? (p.envQueueNo ?? null) : NA;
    case 'biz': return p.bizType ?? null;
    case 'bldg': return p.bldgType ?? null;
    case 'powerIn': return p.powerType ?? null;
    case 'sales': return p.salesOrg ?? null;
    case 'gc': return p.gcOrg ?? null;
    case 'created': return p.createdAt ? { date: p.createdAt } : null;
    default: return null;
  }
}

/**
 * 표 → 엑셀 한 장. ★화면에서 보는 그대로★ — 걸러 둔 줄, 고른 정렬, 켜 둔 열.
 *
 * 현장 칸은 화면에서 이름·번호·주소가 한 칸에 쌓여 있지만 엑셀에서는 셋으로 가른다 — 한 칸에 몰면 주소로
 * 거르거나 번호로 찾지 못한다. 금액은 원래 표에 없다(협력사 화면에 실리지 않는 값이라 엑셀에도 없다).
 */
export function tableSheet(
  projects: ProjectSummary[],
  hidden: ReadonlySet<ColKey>,
  tab: TableTab
): { columns: XlsxColumn[]; rows: XlsxCell[][] } {
  const keys = TABLE_ORDER.filter((k) => !hidden.has(k));
  const label = new Map<ColKey, string>(PICKABLE.map((c) => [c.key, c.label]));
  /*
   * 진행단계는 엑셀에서 둘로 가른다 — 일 이름과 그 날. 화면은 한 칸에 둘을 쓰지만, 엑셀에서 한 칸이면 「충전기 수령」으로
   * 거르지도 날짜로 줄 세우지도 못한다(현장 칸을 셋으로 가르는 것과 같은 까닭).
   */
  const columns: XlsxColumn[] = [
    { header: '현장명' },
    { header: '관리번호' },
    { header: '주소' },
    ...keys.flatMap((k) =>
      k === 'progress'
        ? [{ header: '진행단계' }, { header: '진행단계일' }]
        : [{ header: DATE_COLS[k]?.name ?? label.get(k) ?? k }]
    ),
  ];
  const rows = projects.map((p) => [
    p.name,
    p.mgmtNo ?? p.id,
    p.addr ?? null,
    ...keys.flatMap((k): XlsxCell[] => {
      if (k !== 'progress') return [cellOf(p, k, tab)];
      const g = progressOf(p);
      return [g?.step ?? null, g?.date ? { date: g.date } : null];
    }),
  ]);
  return { columns, rows };
}

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
  { key: 'qty', label: '대수', group: '기본' },
  { key: 'term', label: '계약연수', attr: 'term', group: '기본' },
  { key: 'cpo', label: '운영사', attr: 'cpo', group: '기본' },
  { key: 'sales', label: '영업사', attr: 'sales', group: '기본' },
  { key: 'gc', label: '시공사', attr: 'gc', group: '기본' },
  { key: 'created', label: '접수일', attr: 'month', group: '기본' },
  // 영업(계약) 단계에서 다루는 속성
  { key: 'queue', label: '환경부 대기번호', attr: 'queue', group: '영업' },
  { key: 'biz', label: '사업유형', attr: 'biz', group: '영업' },
  { key: 'bldg', label: '건축물', attr: 'bldg', group: '영업' },
  { key: 'power', label: '수전방식', attr: 'power', group: '영업' },
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
export const LEGACY_KEYS: readonly ColKey[] = [
  'stage', 'qty', 'term', 'cpo', 'sales', 'gc', 'created', 'queue', 'biz', 'bldg', 'power',
  'envApproval', 'notify', 'chargerOrder', 'chargerRecv', 'start', 'install', 'comm', 'completion',
];

export type TableTab = 'intake' | 'construction';

/**
 * 표에 열이 서는 차례 — 표의 머리글이 이 차례로 선다. 「열」 고르기의 묶음 차례(PICKABLE)와 다르다:
 * 고르기는 기본·영업·시공으로 묶어 보이고, 표는 운영사 옆에 영업 속성을, 끝에 접수일을 둔다.
 */
export const TABLE_ORDER: readonly ColKey[] = [
  'stage', 'qty', 'term', 'cpo', 'queue', 'biz', 'bldg', 'power', 'sales', 'gc',
  'envApproval', 'notify', 'notifyCert', 'chargerOrder', 'chargerRecv', 'preStart', 'start', 'foundation',
  'chargerInstall', 'install', 'elecApply', 'safetyCheck', 'kepcoLine', 'meter', 'useInspectApply', 'comm', 'completion',
  'created',
];

/**
 * 페이지별 기본 열 — 사용자가 「열」에서 고르기 전의 시작점.
 * 계약 페이지에는 아직 없는 시공 일정을, 시공 페이지에는 계약 속성을 접어 둔다.
 */
export const MILESTONE_KEYS: readonly ColKey[] = [
  'envApproval', 'notify', 'notifyCert', 'chargerOrder', 'chargerRecv', 'preStart', 'start', 'foundation',
  'chargerInstall', 'install', 'elecApply', 'safetyCheck', 'kepcoLine', 'meter', 'useInspectApply', 'comm', 'completion',
];
export const DEFAULT_HIDDEN: Record<TableTab, readonly ColKey[]> = {
  intake: MILESTONE_KEYS,
  construction: ['queue', 'biz', 'bldg', 'power', 'created'],
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

export type SortKey = 'name' | 'stage' | 'qty' | 'term' | 'created';

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
  envApproval: { field: 'envApprovalDate', name: '환경부 승인일', date: (p) => m(p).envApprovalDate, na: (p) => !subsidized(p.bizType) },
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
  completion: { name: '준공서류 제출일', date: (p) => m(p).completionSubmitAt },
};

/** 날짜 열의 차례 — 표가 이 차례로 그린다 */
export const DATE_KEYS: readonly ColKey[] = TABLE_ORDER.filter((k) => DATE_COLS[k] !== undefined);

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
    case 'power': return p.powerType ?? null;
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
  const columns: XlsxColumn[] = [
    { header: '현장명' },
    { header: '관리번호' },
    { header: '주소' },
    ...keys.map((k) => ({ header: DATE_COLS[k]?.name ?? label.get(k) ?? k })),
  ];
  const rows = projects.map((p) => [
    p.name,
    p.mgmtNo ?? p.id,
    p.addr ?? null,
    ...keys.map((k) => cellOf(p, k, tab)),
  ]);
  return { columns, rows };
}

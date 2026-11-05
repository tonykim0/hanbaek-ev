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
import { stepsOf } from '@/lib/process';
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
  { key: 'envApproval', label: '환경부 승인일', group: '시공' },
  { key: 'notify', label: '행위신고', group: '시공' },
  { key: 'chargerOrder', label: '충전기 발주', group: '시공' },
  { key: 'chargerRecv', label: '충전기 수령', group: '시공' },
  { key: 'start', label: '착공', group: '시공' },
  { key: 'install', label: '설치완료', group: '시공' },
  { key: 'comm', label: '개통', group: '시공' },
  { key: 'completion', label: '준공서류', group: '시공' },
] as const satisfies readonly { key: string; label: string; attr?: AttrKey; group: '기본' | '영업' | '시공' }[];
export type ColKey = (typeof PICKABLE)[number]['key'];
export const PICK_GROUPS = ['기본', '영업', '시공'] as const;

export type TableTab = 'intake' | 'construction';

/**
 * 표에 열이 서는 차례 — 표의 머리글이 이 차례로 선다. 「열」 고르기의 묶음 차례(PICKABLE)와 다르다:
 * 고르기는 기본·영업·시공으로 묶어 보이고, 표는 운영사 옆에 영업 속성을, 끝에 접수일을 둔다.
 */
export const TABLE_ORDER: readonly ColKey[] = [
  'stage', 'qty', 'term', 'cpo', 'queue', 'biz', 'bldg', 'power', 'sales', 'gc',
  'envApproval', 'notify', 'chargerOrder', 'chargerRecv', 'start', 'install', 'comm', 'completion',
  'created',
];

/**
 * 페이지별 기본 열 — 사용자가 「열」에서 고르기 전의 시작점.
 * 계약 페이지에는 아직 없는 시공 일정을, 시공 페이지에는 계약 속성을 접어 둔다.
 */
export const MILESTONE_KEYS: readonly ColKey[] = [
  'envApproval', 'notify', 'chargerOrder', 'chargerRecv',
  'start', 'install', 'comm', 'completion',
];
export const DEFAULT_HIDDEN: Record<TableTab, readonly ColKey[]> = {
  intake: MILESTONE_KEYS,
  construction: ['queue', 'biz', 'bldg', 'power', 'created'],
};

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

/**
 * 날짜 칸의 엑셀 값 — 날짜는 진짜 날짜, 날짜 없이 완료 선언만 있는 옛 현장은 「완료」, 아직이면 빈 칸.
 * 화면은 날짜 옆에 ✓ 를 얹지만 엑셀 칸에 글자를 붙이면 날짜가 글자가 되어 날짜로 못 거른다 — 날짜를 지킨다.
 */
function dateCell(date: string | null, done = false): XlsxCell {
  if (date) return { date };
  return done ? '완료' : null;
}

/** 열 하나의 엑셀 값 — 화면의 그 칸과 같은 판정(해당없음 · 빈 칸)을 쓴다 */
function cellOf(p: ProjectSummary, key: ColKey, tab: TableTab): XlsxCell {
  const m = p.milestones;
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
    case 'envApproval': return subsidized(p.bizType) ? dateCell(m.envApprovalDate) : NA;
    case 'notify': return m.notifySkipped ? NA : dateCell(m.notifyDate, m.notifyDone);
    case 'chargerOrder': return passesCharger(p) ? dateCell(m.chargerOrderDate) : NA;
    case 'chargerRecv': return passesCharger(p) ? dateCell(m.chargerRecvDate, m.chargerDone) : NA;
    case 'start': return dateCell(m.startDate);
    case 'install': return dateCell(m.installDoneDate, m.installConfirmed);
    case 'comm': return dateCell(m.openDate, m.openDone);
    case 'completion': return dateCell(m.completionSubmitAt);
    case 'created': return dateCell(p.createdAt);
  }
}

/** 엑셀 머리 이름 — 날짜 열은 「…일」로 적는다(엑셀에는 칸 모양이 없어 날짜인지 이름이 말해야 한다) */
const SHEET_HEADER: Partial<Record<ColKey, string>> = {
  notify: '행위신고일',
  chargerOrder: '충전기 발주일',
  chargerRecv: '충전기 수령일',
  start: '착공일',
  install: '설치완료일',
  comm: '개통완료일',
  completion: '준공서류 제출일',
};

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
    ...keys.map((k) => ({ header: SHEET_HEADER[k] ?? label.get(k) ?? k })),
  ];
  const rows = projects.map((p) => [
    p.name,
    p.mgmtNo ?? p.id,
    p.addr ?? null,
    ...keys.map((k) => cellOf(p, k, tab)),
  ]);
  return { columns, rows };
}

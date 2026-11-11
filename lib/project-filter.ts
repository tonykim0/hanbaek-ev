/**
 * 현장 목록의 필터 축.
 *
 * ★한 곳에 모으는 이유★
 * 필터를 거는 자리가 둘이다 — 위쪽 필터 막대와 표의 열 머리글. 두 곳이 각자 상태를 쥐면
 * 「표에서 운영사를 걸고 보드로 넘어갔더니 풀려 있다」가 된다. 축과 값 뽑는 규칙을 여기 두고
 * 두 화면이 같은 상태를 쓴다.
 *
 * 값이 없는 현장(운영사 미지정 등)도 걸러야 한다 — 「수전방식이 안 적힌 현장만 보기」가
 * 실제로 필요한 질문이다. 그래서 빈 값에도 이름을 준다(EMPTY).
 */
import type { ProjectSummary } from '@/types/project';
import { subsidized } from '@/types/project';
import { BOARD_COLUMNS, boardColumnOf } from './board';
/*
 * 날짜 열의 정의(무슨 값 · 언제 해당없음)는 표가 쥔다 — 날짜 축 · 진행단계 축은 그것을 그대로 읽는다.
 * ★project-table 은 이 파일에서 타입만 가져간다★ — 값까지 서로 부르면 모듈이 서로를 기다려 ATTRS 를 짓다가 깨진다.
 */
import {
  DATE_KEYS, labelOf, PRESENCE, presenceOf, PROGRESS_STEPS, progressOf, type MilestoneKey,
} from './project-table';

/** 값이 비어 있는 현장을 고르는 이름. 실제 값과 겹치지 않게 괄호를 쓴다. */
export const EMPTY = '(없음)';

export type AttrKey =
  | 'col' | 'progress' | 'month' | 'cpo' | 'term' | 'biz' | 'bldg' | 'power' | 'sales' | 'gc' | 'queue'
  /** 날짜 열마다 하나 — 있음 · 없음 · 해당없음 */
  | MilestoneKey;

export interface Attr {
  key: AttrKey;
  label: string;
  /**
   * 이 현장이 갖는 값들. 여러 개일 수 있다 —
   * 계약연수는 라인마다 다를 수 있어서 「7년 3대 + 10년 4대」 현장은 7년·10년 양쪽에 걸린다.
   */
  valuesOf: (p: ProjectSummary) => string[];
  /** 값의 차례가 정해진 축 — 있음 · 없음 · 해당없음. 없으면 가나다 차례다 */
  order?: readonly string[];
}

const one = (v: string | null | undefined): string[] => [v?.trim() ? v : EMPTY];

/**
 * 접수일의 달 — `2026-08-17` → `26년 8월`.
 *
 * 글자를 쪼개서 센다(Date 로 읽지 않는다) — 저장된 값이 이미 한국 달력 날짜라
 * 시간대를 다시 태우면 자정 언저리가 앞 달로 밀린다(lib/date.ts 의 그 사고).
 */
const monthOf = (day: string): string => {
  const m = /^(\d{4})-(\d{2})/.exec(day);
  return m ? `${m[1].slice(2)}년 ${Number(m[2])}월` : EMPTY;
};

export const ATTRS: Attr[] = [
  /* 단계는 보드 칸의 차례로 고른다 — 가나다로 두면 「개통 및 통신확인」이 맨 위, 「행위신고」가 맨 밑이었다 */
  { key: 'col', label: '단계', valuesOf: (p) => [boardColumnOf(p)], order: BOARD_COLUMNS.map((c) => c.key) },
  /*
   * 진행단계 — 단계 안에서 어디까지 왔나(lib/project-table progressOf · 한백 2026-11-11). 일의 차례로 고른다.
   * 아무것도 안 적힌 현장은 「(없음)」 — 「환경부 승인 대기인데 승인일이 아직」을 거르는 값이다.
   */
  {
    key: 'progress',
    label: '진행단계',
    valuesOf: (p) => [progressOf(p)?.step ?? EMPTY],
    order: [...PROGRESS_STEPS, EMPTY],
  },
  {
    key: 'month',
    label: '접수월',
    /*
     * 접수일은 곧 계약서수령일이다 — 이관 때 한백 지시로 그렇게 넣었다
     * (scripts/import-notion-2026.ts 의 「접수일은 계약서수령일이다」).
     * 「몇 월에 들어온 계약인가」가 실제 질문이라 날짜가 아니라 달로 묶는다 —
     * 날짜 하나하나를 고르는 목록은 140줄이 되어 아무것도 못 고른다.
     */
    valuesOf: (p) => [monthOf(p.createdAt)],
  },
  { key: 'cpo', label: '운영사', valuesOf: (p) => [p.cpo] },
  {
    key: 'term',
    label: '계약연수',
    valuesOf: (p) =>
      p.lines.length === 0 ? [EMPTY] : [...new Set(p.lines.map((l) => `${l.termYears}년`))],
  },
  { key: 'biz', label: '사업유형', valuesOf: (p) => one(p.bizType) },
  { key: 'bldg', label: '건축물', valuesOf: (p) => one(p.bldgType) },
  /*
   * 전력인입 = 현장의 수전방식 칸(한백은 결과서의 「전력인입」으로 부른다 — 2026-11-06 보드 · 필터 · 표에서 그 이름으로).
   * 겸용(한전불입+모자분리)은 ★제 값 하나★다 — 한전불입 · 모자분리 양쪽에 세우면 대시보드의 수전방식 막대가 그 현장의
   * 대수를 두 번 센다(같은 축을 대수로 묶는다). 한전불입이 든 현장을 다 보려면 두 값을 같이 고른다.
   */
  { key: 'power', label: '전력인입', valuesOf: (p) => one(p.powerType) },
  /*
   * 영업사와 시공사는 ★따로 묻는다★ (한백 지시 2026-08-26).
   *
   * 한 축으로 합쳐 「업체」를 뒀었는데 되돌린다 — 겸업이라 같은 회사가 양쪽에 서지만,
   * 물을 때는 「누가 영업했나」와 「누가 짓나」를 갈라서 묻는다. 합친 축은 그 둘을
   * 구분하지 못하고, 옆에 나란히 두면 셋이 같은 것을 세 벌로 묻게 된다.
   */
  { key: 'sales', label: '영업사', valuesOf: (p) => one(p.salesOrg) },
  { key: 'gc', label: '시공사', valuesOf: (p) => one(p.gcOrg) },
  {
    key: 'queue',
    label: '환경부 대기번호',
    /*
     * 번호 자체로 거를 일은 없다 — 「받았나 아직인가」가 실제 질문이다.
     *
     * 자체투자는 「없음」이 아니라 「해당없음」이다. 환경부 보조금을 받지 않으니 받을 번호가
     * 없다 — 둘을 같은 값으로 두면 「번호 아직 안 온 현장」을 걸러 볼 때 자체투자가 섞여
     * 들어오고, 그 목록으로는 독촉할 곳을 알 수 없다.
     */
    valuesOf: (p) =>
      !subsidized(p.bizType) ? ['해당없음'] : [p.envQueueNo?.trim() ? '있음' : '없음'],
    order: PRESENCE,
  },
  /*
   * 날짜 열마다 한 축 — 있음 · 없음 · 해당없음 (한백 2026-11-10 「계약관리 시공관리 표에서 필터를 걸고 해당 필터 값이
   * 있는지 없는지 해당없음인지 구분해서 또 한 번 보고싶어」). 운영사 · 시공사로 좁힌 뒤 「착공일 안 적힌 현장」 ·
   * 「개통 안 된 현장」을 한 번 더 거른다.
   *
   * 날짜 하나하나로 거를 일은 없다 — 대기번호와 같은 까닭으로 「적혔나 · 아직인가 · 이 현장에는 없는 일인가」가 묻는
   * 것이다. 해당없음을 없음과 가르는 것도 같은 까닭이다: 자체투자의 환경부 승인일이 「없음」에 섞이면 그 목록으로는
   * 챙길 곳을 알 수 없다. 판정은 표의 칸 · 엑셀과 한 정의다(lib/project-table presenceOf).
   * 거는 자리는 그 열의 머리글이다 — 판에는 펴 두지 않고(열일곱이다) 걸려 있을 때만 선다(panelAttrKeys).
   */
  ...DATE_KEYS.map((key): Attr => ({
    key,
    label: labelOf(key),
    valuesOf: (p) => [presenceOf(key, p)],
    order: PRESENCE,
  })),
];

export const ATTR_BY_KEY = new Map(ATTRS.map((a) => [a.key, a]));

/**
 * 필터 판에 펴 두는 축 — 다섯이다(한백 지시 2026-08-26 넷 · 2026-11-06 전력인입을 더했다 「보드랑 필터표에 전력인입도」).
 * 적은 순서대로 나온다.
 *
 * 어떤 사업이고, 누구 운영사이고, ★누가 영업했고 누가 짓는가★. 업체는 계약관리·시공관리
 * 양쪽에서 묻는다 — 계약은 영업사가 서류를 모으고 시공은 시공사가 도는데, 어느 쪽이든
 * 「이 업체 현장이 지금 어디까지 왔나」가 보드에서 물어야 할 질문이다.
 * 두 국면이 같은 판을 쓴다: 페이지마다 필터가 다르면 옮겨 다닐 때마다 다시 익혀야 한다.
 *
 * ★ATTRS 를 줄이지 않는다.★ 표의 열 머리글에서도 같은 축을 거는데(ProjectTable),
 * 거기서 걸 수 있는 것은 열이 있는 만큼이다 — 축을 지우면 그쪽에서도 사라진다.
 * 나머지 축(단계 · 진행단계 · 계약연수 · 건축물 · 대기번호 · 날짜 열마다의 있음/없음/해당없음)은 열 머리글에 남는다.
 * 거기서 걸어 둔 것은 판에도 나온다 — 걸려 있는데 보이지 않는 조건을 두지 않는다
 * (푸는 자리가 없으면 왜 이것만 나오는지 알 수 없다).
 */
export const PANEL_ATTR_KEYS: AttrKey[] = ['biz', 'cpo', 'power', 'sales', 'gc'];

/** 판에 그릴 축 — 정해 둔 다섯 + 지금 걸려 있는 나머지 */
export function panelAttrKeys(filters: AttrFilters): AttrKey[] {
  const extra = ATTRS
    .map((a) => a.key)
    .filter((k) => !PANEL_ATTR_KEYS.includes(k) && (filters[k]?.length ?? 0) > 0);
  return [...PANEL_ATTR_KEYS, ...extra];
}

/** 축별로 고른 값. 빈 배열이면 그 축은 안 걸린 것이다. */
export type AttrFilters = Partial<Record<AttrKey, string[]>>;

/** 이 자료에 실제로 있는 값만 고를 수 있게 한다 — 없는 값을 고르는 자리를 두지 않는다 */
export function optionsOf(projects: ProjectSummary[], key: AttrKey): string[] {
  const attr = ATTR_BY_KEY.get(key);
  if (!attr) return [];
  const seen = new Set<string>();
  for (const p of projects) for (const v of attr.valuesOf(p)) seen.add(v);

  const list = [...seen];
  // 차례가 정해진 축은 그 차례로 — 가나다로 두면 「없음 · 있음 · 해당없음」이 된다
  const order = attr.order;
  if (order) {
    const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
    return list.sort((a, b) => rank(a) - rank(b));
  }
  // 「(없음)」은 늘 끝으로 — 값 목록 사이에 섞이면 눈에 걸린다
  return list.sort((a, b) => {
    if (a === EMPTY) return 1;
    if (b === EMPTY) return -1;
    return a.localeCompare(b, 'ko', { numeric: true });
  });
}

/** 걸린 축을 모두 통과하는가. 축끼리는 AND, 한 축 안의 값끼리는 OR 다. */
export function passesAttrs(p: ProjectSummary, filters: AttrFilters): boolean {
  for (const attr of ATTRS) {
    const picked = filters[attr.key];
    if (!picked?.length) continue;
    const mine = attr.valuesOf(p);
    if (!mine.some((v) => picked.includes(v))) return false;
  }
  return true;
}

export const countActive = (filters: AttrFilters): number =>
  ATTRS.reduce((n, a) => n + (filters[a.key]?.length ?? 0), 0);

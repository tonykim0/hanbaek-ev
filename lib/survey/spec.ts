/**
 * 실사보고서(사진대지) 자동 작성 — 무엇을 받는가 (한백 지시 2026-10-01).
 *
 * 협력사가 포털에서 현장을 실사하며 찍은 사진과 값 몇 개를 넣으면, 운영사 서식(워드·엑셀)을
 * 그대로 채워 내려받는다. ★서버에 아무것도 저장하지 않는다★ — 계약서 작성과 같은 길이다
 * (사진·값은 브라우저 안에서만 돈다, lib/fillDocx 머리말).
 *
 * 운영사마다 서식이 다르지만 받는 값은 거의 같다 — 거점(분전반 하나에 묶인 충전기 무리)마다
 * 상세 위치·수전방식·대수·분전반 사양·사진. 그래서 입력의 모양은 하나로 두고, 사진 칸과
 * 체크리스트만 운영사마다 다르게 정의한다. 서식을 채우는 법은 운영사별 생성기가 안다.
 */

/**
 * 운영사 — 서식은 셋이다(한백 지시 2026-10-01):
 *   hec       현대엔지니어링 [별지 1] 사진대지 + [별지 2] 사전체크리스트 (워드)
 *   sk · nice 사전 현장 컨설팅 사진 대장 (워드) — ★나이스는 표준 양식이 없어 SK 양식을 쓴다★
 *   pluglink  실사보고서 v22 (엑셀 — 실사개요·사진대지·공사내역서)
 */
export type SurveyCpo = 'hec' | 'sk' | 'nice' | 'pluglink';

/** 사진 칸 하나 — 서식의 칸 이름을 그대로 쓴다(협력사가 운영사 서식에서 보던 말) */
export interface PhotoSlot {
  key: string;
  label: string;
  /** 칸 이름만으로 무엇을 찍을지 모를 때 붙는 한 줄 — 서식에 적힌 괄호 말이다 */
  hint?: string;
}

/**
 * 사진 위 번호 표시 하나 — 사진의 가로·세로에 대한 비율(0~1). 번호는 순서(1부터)다.
 * 「이 주차면에 몇 기」를 사진 위에서 보이는 자리(한백 지시 2026-10-01 — 워드·엑셀에서 손으로 그리던 것).
 */
export interface Mark { x: number; y: number }

/** 거점 하나 — 분전반 하나에 묶인 충전기 무리 */
export interface SurveySpot {
  id: string;
  /** 상세 위치 — 「103동 지상주차장」 */
  location: string;
  /** 전원 공급방식 — 한전 별도수전(한전불입) 또는 모자분리 */
  powerType: '한전' | '모자분리';
  /** 충전기 설치 Type 별 대수 */
  wallSlow: number | null;
  wallFast: number | null;
  standSlow: number | null;
  standFast: number | null;
  /** 책임분계점 원경·근경 옆 칸 — 전주번호(한전수전) 또는 차단기 스펙(모자분리) */
  farSpec: string;
  nearSpec: string;
  /** 사진 대장(SK·나이스) — 설치장소(주소) · 전력인입점(판넬) 설명 · 설치기수 */
  address: string;
  panelNote: string;
  qty: number | null;
  /** 사진 — 칸 key → 사진 파일. 브라우저 안에서만 산다 */
  photos: Record<string, File | null>;
  /** 사진 위 번호 — 칸 key → 표시들. 서식에 넣을 때 사진에 합쳐 굽는다 */
  marks: Record<string, Mark[]>;
  /** 체크리스트 — 항목 key → 확인(O)·미확인(X), 비고 */
  checks: Record<string, { ok: boolean; note: string }>;
}

export interface SurveyForm {
  cpo: SurveyCpo;
  /** 현장명 — 체크리스트의 「현장명(거점명)」과 내려받는 파일 이름 */
  siteName: string;
  /** 조사일 YYYY-MM-DD */
  surveyDate: string;
  spots: SurveySpot[];
}

/**
 * 현대엔지니어링 [별지 1] 사진대지 — ★칸 일곱이 고정이다★, 순서가 곧 서식의 자리다
 * (public/hec/template.docx 의 사진 줄을 위에서 아래, 왼쪽에서 오른쪽으로 읽은 순서).
 */
export const HEC_PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'far', label: '책임분계점(원경)', hint: '인입전주 또는 분전반' },
  { key: 'near', label: '책임분계점(근경)', hint: '인입전주 또는 분전반' },
  { key: 'siteWide', label: '충전소 설치 위치(전경)' },
  { key: 'siteClose', label: '충전소 설치 위치(근경)' },
  { key: 'panel', label: '전기차 분전반 설치위치' },
  { key: 'route', label: '선로 인입경로', hint: '책임분계점 ~ 전기차 분전반' },
  { key: 'cctv', label: 'CCTV(실내) 또는 옥외 조명(실외)' },
];

/**
 * 현대엔지니어링 [별지 2] 사전체크리스트 — 서식의 두 표, 항목 순서 그대로.
 * 생성기가 서식의 줄 수와 맞춰 보고 다르면 멈춘다(서식이 바뀌면 칸이 밀린다).
 */
export const HEC_CHECKS: Array<{ group: string; items: Array<{ key: string; label: string }> }> = [
  {
    group: '1. 설치위치 확인',
    items: [
      { key: 'l1', label: '설치지점이 지하 3층 이상이지 않은지' },
      { key: 'l2', label: '(자주식 지하주차장) 주차구역의 벽·기둥·천장·바닥이 내화구조인지' },
      { key: 'l3', label: '피난 및 보행동선에 지장이 없는지' },
      { key: 'l4', label: '설치지점의 조도가 20lux 이상 확보되어 있는지' },
      { key: 'l5', label: '가연성·인화성 물질 보관창고 또는 쓰레기 집하장으로부터 10m 이상 이격' },
      { key: 'l6', label: '주변에 CCTV 가 있고 화각 안에 충전소가 들어오는지' },
      { key: 'l7', label: '전기실/기계실로부터 10m 이상 이격되어 있는지' },
      { key: 'l8', label: '피난계단 또는 비상용 승강기로부터 3m 이상 이격되어 있는지' },
      { key: 'l9', label: '옥내 소화전과 소화기로부터 5m 이상 이격되어 있는지' },
      { key: 'l10', label: '충전기 직상부 천장에 화재 감지기가 설치되어 있는지' },
      { key: 'l11', label: '충전소 방호장치(스토퍼·볼라드)가 설치될 공간이 있는지' },
      { key: 'l12', label: '충전기 설치높이가 마감기준 1.2m 이상 이격되어 있는지' },
      { key: 'l13', label: '캐노피가 충전주차구획 밖에 위치하는지' },
    ],
  },
  {
    group: '2. 전원 공급 확인',
    items: [
      { key: 'p1', label: '충전기 전원이 상용전원으로 공급되는지(비상전원 아님)' },
      { key: 'p2', label: '배관·배선·분전반 등 기존시설물을 활용하지 않는지' },
    ],
  },
];

/**
 * 사전 현장 컨설팅 사진 대장 (SK·나이스) — 거점마다 표 하나, 사진 넷.
 * 순서가 곧 서식의 자리다(public/survey/ledger.docx 의 사진 줄 둘 × 칸 둘).
 */
export const LEDGER_PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'inlet1', label: '전력인입점 사진 1', hint: '판넬 외부' },
  { key: 'inlet2', label: '전력인입점 사진 2', hint: '판넬 내부·차단기' },
  { key: 'front', label: '설치 예정 주차면 — 전면' },
  { key: 'side', label: '설치 예정 주차면 — 측면' },
];

export const HEC_CHECK_KEYS = HEC_CHECKS.flatMap((g) => g.items.map((i) => i.key));

/** 새 거점 — 체크리스트는 모두 확인(O)으로 시작한다(현장 대부분이 그렇다, 아닌 것만 고친다) */
export function newSpot(id: string): SurveySpot {
  return {
    id,
    location: '',
    powerType: '모자분리',
    wallSlow: null, wallFast: null, standSlow: null, standFast: null,
    farSpec: '', nearSpec: '',
    address: '', panelNote: '', qty: null,
    photos: {},
    marks: {},
    checks: Object.fromEntries(HEC_CHECK_KEYS.map((k) => [k, { ok: true, note: '' }])),
  };
}

/** 거점의 완속·급속 합 — 체크리스트 머리의 「충전시설 설치대수」 */
export const slowOf = (s: SurveySpot) => (s.wallSlow ?? 0) + (s.standSlow ?? 0);
export const fastOf = (s: SurveySpot) => (s.wallFast ?? 0) + (s.standFast ?? 0);

/* ── 플러그링크 실사보고서 v22 (엑셀) ───────────────────────────────────────────
 *
 * ★받는 칸은 실제 제출본이 채운 것만이다★ (한백 지시 2026-10-01 「불필요한 것까지 들어갔다 — DB 예시를
 * 보고 필요한 것만」). 프로덕션의 플러그링크 제출본 8건을 열어 본 결과로 정했다:
 *   · 교체 대수 · 시공사 부담금 · 계통 초과거리 — 8건 모두 비어 있다 → 받지 않는다
 *   · 계통타입 — 8건 모두 「공중공급」 → 고정
 *   · 계통연계 포함 — 분전반 이름이 「한전인입」인 현장이 Yes → 거점의 인입 방식에서 유도
 *   · 스탠드·캐노피·볼라드 — 7건이 대수와 같다 → 기본은 대수만큼
 *   · 통신 — 6기당 1개 → 자동
 *   · 기타비용 — 인건비·IP전주(한전인입) → 항목 목록
 */

/** 거점 — 실사개요 거점 표 한 줄 + 사진대지 시트 한 장 */
export interface PlSpot {
  id: string;
  /** 상세위치 — 「지하2층 102동 앞 G02기둥」(가이드: 단순 지상/지하주차장 금지) */
  location: string;
  /** 대수 — 신규. 교체는 제출본에서 쓴 적이 없어 받지 않는다 */
  qty: number | null;
  /** 인입 — 한전에서 새로 끌어오는가(계통연계 견적 포함), 기존 분전반에서 따는가 */
  inlet: '한전인입' | '분전반';
  /** 분전반일 때만 — 이름 · 메인차단기 · 사용(인입점) 차단기, 「4P 100A」 꼴 */
  panelName: string;
  mainBreaker: string;
  inletBreaker: string;
  /** 1차측 기준 전체 라인 — 배관 SIZE(mm)·길이(m), 배선 SIZE(sq)·길이(m) */
  pipeSize: number | null;
  pipeLen: number | null;
  cableSize: number | null;
  cableLen: number | null;
  /** 스탠드·캐노피·볼라드 — 비우면(null) 대수만큼 */
  stand: number | null;
  canopy: number | null;
  bollard: number | null;
  note: string;
  photos: Record<string, File | null>;
  marks: Record<string, Mark[]>;
}

/** 기타비용 한 줄 — 공사내역서(입력) 29~38행(사양·수량·단가). 단가를 비우면 서식 값 */
export interface PlEtc { spec: string; qty: number | null; price: number | null }

export interface PlForm {
  siteName: string;
  surveyDate: string;
  address: string;
  /** 연락처/팩스 — 현장(관리사무소) 연락처 */
  siteTel: string;
  /** 현장실사자 — 「한백 / 홍길동 / 010-0000-0000」 한 줄(제출본이 다 그렇게 썼다) */
  surveyor: string;
  /** 기설치대수 — 「완속 8기」·「에버온 16대」 한 줄 */
  existing: string;
  siteNote: string;
  /** 공사내역서(입력) — 거점에서 셈할 수 없는 것 */
  roadCutM: number | null; roadCutPrice: number | null;
  digM: number | null; digPrice: number | null;
  etc: PlEtc[];
  safetyCheck: boolean;
  /** 시트 하나에 한 장 — 전경사진 · 도면(주차장 평면도) */
  overview: File | null;
  plan: File | null;
  planMarks: Mark[];
  spots: PlSpot[];
}

/**
 * 사진대지 시트의 사진 칸 — 2열 × 6줄, 순서가 곧 자리다(왼쪽→오른쪽, 위→아래).
 * 칸 이름은 제출본들이 실제로 단 설명이다. 앞 넷 짝(8칸)이 서식의 인쇄 영역이고, 뒤를 쓰면 늘린다.
 */
export const PL_PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'zoom', label: '도면 확대도' },
  { key: 'place', label: '설치예정 위치', hint: '주차면 정면 · 번호 표시' },
  { key: 'placeBack', label: '설치예정 위치 후면' },
  { key: 'panelOut', label: '1차측 분전반 외부', hint: '인입점' },
  { key: 'panelIn', label: '1차측 분전반 내부' },
  { key: 'route1', label: '전력간선 인입라인 - 1' },
  { key: 'route2', label: '전력간선 인입라인 - 2' },
  { key: 'route3', label: '전력간선 인입라인 - 3' },
  { key: 'route4', label: '전력간선 인입라인 - 4' },
  { key: 'pole', label: '전주번호', hint: '한전인입일 때' },
  { key: 'sub', label: '2차측 분전함' },
  { key: 'cctv', label: 'CCTV(지하설치)', hint: '지하일 때' },
];

export function newPlSpot(id: string): PlSpot {
  return {
    id, location: '', qty: null, inlet: '분전반', panelName: '', mainBreaker: '', inletBreaker: '',
    pipeSize: null, pipeLen: null, cableSize: null, cableLen: null,
    stand: null, canopy: null, bollard: null, note: '', photos: {}, marks: {},
  };
}

export const plQtyOf = (s: PlSpot) => s.qty ?? 0;
/** 통신 — 충전기 최대 6기당 1개(가이드 8) */
export const plModemOf = (s: PlSpot) => (plQtyOf(s) > 0 ? Math.ceil(plQtyOf(s) / 6) : 0);
/** 스탠드·캐노피·볼라드 — 비웠으면 대수만큼 */
export const plFixture = (s: PlSpot, v: number | null) => v ?? plQtyOf(s);

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
  /**
   * 여러 장 받는 칸 — 최대 장수. 제출본이 한 칸 이름으로 사진을 여러 장 냈다(아래 각 칸 주석).
   * 둘째 장부터는 key 에 「~2」·「~3」을 붙여 같은 사진 묶음에 둔다(subKey).
   */
  multi?: number;
  /** 여러 장을 서식의 한 칸에 모아(바둑판) 넣는다 — 서식 칸이 하나뿐인 자리 */
  collage?: boolean;
}

/** 여러 장 칸의 i번째(0부터) 사진 자리 — 첫 장은 칸 key 그대로라 한 장짜리와 같다 */
export const subKey = (key: string, i: number) => (i === 0 ? key : `${key}~${i + 1}`);

/** 칸에 든 사진들 — 순서대로, 빈 자리 없이(빼면 당겨 채운다) */
export function slotFiles<T>(photos: Record<string, T | null | undefined>, slot: PhotoSlot): Array<{ key: string; file: T }> {
  const out: Array<{ key: string; file: T }> = [];
  for (let i = 0; i < (slot.multi ?? 1); i++) {
    const key = subKey(slot.key, i);
    const file = photos[key];
    if (!file) break;
    out.push({ key, file });
  }
  return out;
}

import type { Annot, NumStyle } from './annot';

/** 번호 모양 — SK·나이스 사진 대장은 노란 원, 나머지는 빨간 원(lib/survey/annot 머리말) */
export const markStyleOf = (cpo: SurveyCpo): NumStyle => (cpo === 'sk' || cpo === 'nice' ? 'yellow' : 'red');

/**
 * 사진 위 표시 하나 — 번호 · 경로 선 · 동그라미 · 네모 · 글자(lib/survey/annot).
 * 워드·엑셀에서 손으로 얹던 것을 여기서 그려 사진에 합쳐 굽는다(한백 지시 2026-10-01).
 */
export type Mark = Annot;

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
  /*
   * 경로가 길면 사진 한 장에 안 담긴다 — 제출본들은 이 칸 하나에 4~6장을 바둑판으로 붙였다
   * (2026 별지 41건 중 여럿 · 부천 옥길데시앙은 여섯 장에 빨간 경로 선). 그래서 여러 장을 받아 한 칸에 모은다.
   */
  { key: 'route', label: '선로 인입경로', hint: '책임분계점 ~ 전기차 분전반', multi: 6, collage: true },
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
 *   · 시공사 부담금 · 계통 초과거리 — 8건 모두 비어 있다 → 받지 않는다
 *   · 교체 대수 — 8건 모두 0 이었지만 앞으로 생긴다(한백) → 받는다
 *   · 계통타입 — 8건 모두 「공중공급」이었으나 내 컴퓨터의 제출본 349곳에는 지중공급이 9곳 있다 → 고른다(기본 공중)
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
  /** 대수 — 신규·교체 (교체는 앞으로 생긴다 — 한백 2026-10-01) */
  qty: number | null;
  replQty: number | null;
  /** 인입 — 한전에서 새로 끌어오는가(계통연계 견적 포함), 기존 분전반에서 따는가 */
  inlet: '한전인입' | '분전반';
  /** 한전인입일 때 — 인입 전주번호(「9638W781 초당간218L2」). 도면 라벨의 둘째 줄이 된다 */
  poleNo?: string;
  /** 전체 도면에서 이 거점의 도면 확대도를 잘라 낸 틀(비율) — 자르기 화면이 그 자리를 다시 보여 준다 */
  zoomCrop?: { x: number; y: number; w: number; h: number };
  /** 분전반일 때만 — 이름 · 메인차단기 · 사용(인입점) 차단기, 「4P 100A」 꼴 */
  panelName: string;
  mainBreaker: string;
  inletBreaker: string;
  /** 1차측 기준 전체 라인 — 배관 SIZE(mm)·길이(m), 배선 SIZE(sq)·길이(m) */
  pipeSize: number | null;
  pipeLen: number | null;
  cableSize: number | null;
  cableLen: number | null;
  /** 통신(모뎀) 대수 — 비우면(null) 충전기 6기당 1개로 셈한다(가이드 8). 현장에 따라 고친다 */
  modem?: number | null;
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
  /** 계통타입 — 한전인입 거점이 있을 때만 뜻이 있다(공사내역서 D42) */
  gridType: '공중공급' | '지중공급';
  safetyCheck: boolean;
  /** 시트 하나에 한 장 — 전경사진 · 도면(주차장 평면도) */
  overview: File | null;
  plan: File | null;
  planMarks: Mark[];
  spots: PlSpot[];
}

/**
 * 사진대지 시트의 사진 칸 — 이 순서로 넣은 사진만 두 장씩 짝지어 채운다(빈 칸은 건너뛴다).
 * 칸 이름은 제출본들이 실제로 단 설명이다. 서식은 여섯 짝이고, 넘치면 시트를 늘린다.
 */
export const PL_PHOTO_SLOTS: PhotoSlot[] = [
  { key: 'zoom', label: '도면 확대도' },
  { key: 'place', label: '설치예정 위치', hint: '주차면 정면 · 번호 표시' },
  { key: 'placeBack', label: '설치예정 위치 후면' },
  { key: 'panelOut', label: '1차측 분전반 외부', hint: '인입점' },
  { key: 'panelIn', label: '1차측 분전반 내부' },
  /*
   * ★인입라인은 장수가 정해져 있지 않다★ — 2026 제출본 사진대지 시트 하나에 0~18장, 6장·8장이 흔하다
   * (내 컴퓨터의 플러그링크 엑셀 84곳 실측). 네 칸으로 묶어 두었더니 모자랐다. 서식은 짝(두 장)마다
   * 25줄이라 넘치면 시트를 늘린다(fill-pluglink).
   */
  { key: 'route', label: '전력간선 인입라인', multi: 20 },
  { key: 'pole', label: '전주번호', hint: '한전인입일 때' },
  { key: 'sub', label: '2차측 분전함', multi: 4 },
  { key: 'cctv', label: 'CCTV(지하설치)', hint: '지하일 때', multi: 4 },
];

/** 사진대지 한 장의 설명 — 여러 장 칸은 두 장 이상이면 모두 번호를 단다(「전력간선 인입라인 - 1」, 제출본의 꼴) */
export const photoCaption = (slot: PhotoSlot, i: number, count: number) =>
  count > 1 ? `${slot.label} - ${i + 1}` : slot.label;

/**
 * 기타비용 자주 쓰는 항목 — 2025~26 제출본 349곳의 공사내역서(입력) 29~38행에서 많이 나온 순,
 * 단가는 실제로 수량을 넣은 줄의 중앙값이다. 누르면 그 줄이 생기고 단가는 고칠 수 있다.
 */
export const PL_ETC_PRESETS: Array<{ spec: string; price: number | null }> = [
  { spec: '인건비', price: 250000 },
  { spec: 'IP전주', price: 300000 },
  { spec: '기초패드', price: 90000 },
  { spec: '코어타공', price: 100000 },
  { spec: '차단기 교체', price: null },
  { spec: '분전반', price: 500000 },
  { spec: '카 스토퍼', price: 10000 },
  { spec: '보도블럭 철거 및 복구', price: 20000 },
  { spec: '포크레인 0.5일', price: 450000 },
  { spec: '포크레인 1일', price: 700000 },
  { spec: '완속 철거(폐기물처분포함)', price: 200000 },
  { spec: '급속 철거(지게차/폐기물포함)', price: 600000 },
];

export function newPlSpot(id: string): PlSpot {
  return {
    id, location: '', qty: null, replQty: null, inlet: '분전반', poleNo: '', panelName: '', mainBreaker: '', inletBreaker: '', modem: null,
    pipeSize: null, pipeLen: null, cableSize: null, cableLen: null,
    stand: null, canopy: null, bollard: null, note: '', photos: {}, marks: {},
  };
}

/** 그 거점 충전기 수 — 신규 + 교체 */
export const plQtyOf = (s: PlSpot) => (s.qty ?? 0) + (s.replQty ?? 0);
/** 통신 — 충전기 최대 6기당 1개(가이드 8). 칸에 적었으면 그 값 */
export const plModemAuto = (s: PlSpot) => (plQtyOf(s) > 0 ? Math.ceil(plQtyOf(s) / 6) : 0);
export const plModemOf = (s: PlSpot) => s.modem ?? plModemAuto(s);
/** 스탠드·캐노피·볼라드 — 비웠으면 대수만큼 */
export const plFixture = (s: PlSpot, v: number | null) => v ?? plQtyOf(s);

/**
 * 접지선(GV) 굵기 — 배선(CV) 굵기에서. KEC 보호도체 규칙(상도체 16㎟ 이하는 같게 · 35㎟ 이하는 16 ·
 * 그 위는 절반을 올린 규격)이고, 제출본 도면 라벨 690개의 짝이 이것과 맞는다(6-6 · 10-10 · 16-16 ·
 * 25-16 · 35-16 · 50-25 · 70-35 · 95-50 이 대부분).
 */
export function gvOf(cv: number): number {
  if (cv <= 16) return cv;
  if (cv <= 35) return 16;
  const SIZES = [25, 35, 50, 70, 95, 120, 150, 185, 240];
  return SIZES.find((s) => s >= cv / 2) ?? Math.ceil(cv / 2);
}

/**
 * 도면의 거점 라벨 — 제출본 도면의 그 상자다(위 칸 빨강 · 아래 칸 검정):
 *   1거점 신규 4대              ← 거점 · 신규/교체 대수
 *   LEM2-B-B3 PANEL             ← 분전반 이름(한전인입이면 「한전인입」)
 *   ─────────
 *   CV 16sq-4C  35m             ← 배선 굵기 · 길이
 *   GV 16sq     35m             ← 접지선(gvOf) · 같은 길이
 * 값이 빈 줄은 뺀다.
 */
export function plSpotLabel(s: PlSpot, n: number): { name: string; head: string[]; body: string[] } {
  const parts = [s.qty ? `신규 ${s.qty}대` : '', s.replQty ? `교체 ${s.replQty}대` : ''].filter(Boolean);
  const head = [`${n}거점${parts.length ? ` ${parts.join(' · ')}` : ''}`, s.inlet === '한전인입' ? (s.poleNo?.trim() || '한전인입') : s.panelName.trim()];
  const len = s.cableLen ? `  ${s.cableLen}m` : '';
  const body = s.cableSize ? [`CV ${s.cableSize}sq-4C${len}`, `GV ${gvOf(s.cableSize)}sq${len}`] : [];
  // 배관 — 제출본 라벨의 꼴(「배관 85m」 · 굵기가 있으면 「배관 54C 75m」)
  if (s.pipeSize || s.pipeLen) body.push(`배관${s.pipeSize ? ` ${s.pipeSize}C` : ''}${s.pipeLen ? `  ${s.pipeLen}m` : ''}`);
  return { name: `${n}거점`, head: head.filter(Boolean), body };
}

/**
 * 라벨 고를 거리 — 넣은 거점은 그 값으로, 그 뒤로는 번호만(최소 10거점까지). 도면에는 아직 값을 안 넣은
 * 거점도 찍는다(한백 「거점 라벨이 왜 1거점밖에 — 2,3,4,5 등등」). 값을 넣으면 찍어 둔 라벨이 따라 채워진다.
 */
export function plSpotLabels(spots: PlSpot[]): Array<{ name: string; head: string[]; body: string[] }> {
  const out = spots.map((s, i) => plSpotLabel(s, i + 1));
  for (let n = spots.length + 1; n <= Math.max(10, spots.length); n++) out.push({ name: `${n}거점`, head: [`${n}거점`], body: [] });
  return out;
}

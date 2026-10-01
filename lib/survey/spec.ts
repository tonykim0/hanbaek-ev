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

export type SurveyCpo = 'hec';

/** 사진 칸 하나 — 서식의 칸 이름을 그대로 쓴다(협력사가 운영사 서식에서 보던 말) */
export interface PhotoSlot {
  key: string;
  label: string;
  /** 칸 이름만으로 무엇을 찍을지 모를 때 붙는 한 줄 — 서식에 적힌 괄호 말이다 */
  hint?: string;
}

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
  /** 사진 — 칸 key → 사진 파일. 브라우저 안에서만 산다 */
  photos: Record<string, File | null>;
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

export const HEC_CHECK_KEYS = HEC_CHECKS.flatMap((g) => g.items.map((i) => i.key));

/** 새 거점 — 체크리스트는 모두 확인(O)으로 시작한다(현장 대부분이 그렇다, 아닌 것만 고친다) */
export function newSpot(id: string): SurveySpot {
  return {
    id,
    location: '',
    powerType: '모자분리',
    wallSlow: null, wallFast: null, standSlow: null, standFast: null,
    farSpec: '', nearSpec: '',
    photos: {},
    checks: Object.fromEntries(HEC_CHECK_KEYS.map((k) => [k, { ok: true, note: '' }])),
  };
}

/** 거점의 완속·급속 합 — 체크리스트 머리의 「충전시설 설치대수」 */
export const slowOf = (s: SurveySpot) => (s.wallSlow ?? 0) + (s.standSlow ?? 0);
export const fastOf = (s: SurveySpot) => (s.wallFast ?? 0) + (s.standFast ?? 0);

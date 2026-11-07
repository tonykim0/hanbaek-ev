import type { PolygonCoords } from './geo';
import type { LayoutStyle } from './layout';

/**
 * 검토 한 번의 결과 모양.
 *
 * 검사(Check)는 자료 하나가 말하는 것만 담는다 — 여러 자료를 한 문장에 섞지 않는다.
 * 종합 판정(Verdict)은 검사들의 상태만 보고 정한다(lib/verdict.ts).
 */

/** 지붕형(건물 위) · 지상형(땅 위). 이격거리 조례는 지상형에만 걸린다. */
export type Mode = 'roof' | 'ground';

/** 판정 네 단계 — 앞에서 뒤로 갈수록 나쁘다. */
export const LEVELS = ['ok', 'conditional', 'hard', 'banned'] as const;
export type Level = (typeof LEVELS)[number];

/**
 * 검사 하나의 상태.
 * - unknown: 자료를 못 받았다(키 없음·응답 실패·주소에 해당 자료 없음). 통과로 치지 않는다.
 * - skip: 이 방식에는 해당 없는 검사(지붕형의 이격거리 조례 등).
 */
export type CheckStatus = Level | 'unknown' | 'skip';

export type Fact = { label: string; value: string };

export type Check = {
  key: string;
  title: string;
  status: CheckStatus;
  /** 한 줄 결론 — 판정 사유로 그대로 쓴다. */
  summary: string;
  facts?: Fact[];
  /** 근거 법령·규정 한 줄 — 화면에는 걸린 항목(조건부·미달·불가)에만 보인다 */
  law?: string;
  source?: { name: string; asOf?: string; url?: string };
};

export type Verdict = {
  level: Level;
  /** 판정을 정한 검사들(가장 나쁜 상태의 것들). 모두 통과면 빈 배열. */
  because: Check[];
  /** 자료가 없어 판정에 못 쓴 검사들. */
  unknown: Check[];
};

export type Estimate = {
  /** 설치 가능 면적(㎡) — 지붕 면적·땅 면적에 이용률을 곱한 값 */
  usableArea: number;
  capacityKw: number;
  assumptions: Fact[];
};

/** 검색창 아래 후보 한 줄 */
export type Suggestion = {
  kind: 'address' | 'place';
  /** 장소 이름(상호·건물명) — 주소 후보면 건물명이 있을 때만 */
  name: string | null;
  road: string | null;
  parcel: string | null;
  /** 장소 분류 마지막 칸(「카페」·「공장」) */
  category: string | null;
  lat: number;
  lng: number;
};

export type Place = {
  query: string;
  roadAddress: string | null;
  jibunAddress: string | null;
  buildingName: string | null;
  /** 필지 고유번호 19자리 */
  pnu: string | null;
  lat: number | null;
  lng: number | null;
};

/* ------------------------------------------------------------- 계통 */

export const GRID_LAYERS = ['substation', 'transformer', 'feeder'] as const;
export type GridLayerKey = (typeof GRID_LAYERS)[number];

/**
 * 한전 한 단계(변전소·주변압기·배전선로)의 용량, kW.
 * 접속기준용량(한도) = 접수기준 접속용량 + 여유용량 — 실응답에서 맞아떨어진다(변압기는 늘 50,000).
 */
export type GridLayer = {
  spareKw: number | null;
  /** 접수기준 접속용량 — 이미 붙었거나 접수된 발전설비의 합 */
  acceptedKw: number | null;
  /** 한도 — 여유가 0 이면 접수가 한도를 넘어 있어(나주SA 변전소 237,556kW) 한도를 알 수 없다 */
  limitKw: number | null;
};

export type GridRow = {
  substation: string;
  /** 주변압기 번호(「1」) */
  transformer: string | null;
  feeder: string;
  /** 셋 중 가장 작은 여유 — 하나라도 비면 모름 */
  spareKw: number | null;
  layers: Record<GridLayerKey, GridLayer>;
};

/** 계통 칸이 그리는 것 — 판정(Check)은 한 줄 결론, 이것은 단계별 막대와 근거 */
export type GridView = {
  rows: GridRow[];
  /** 판정에 쓴 줄(rows 의 차례) — 여유를 아는 줄이 없으면 null */
  best: number | null;
  /** 어느 번지의 한전 기록인가 */
  basis:
    | { kind: 'own' }
    | { kind: 'neighbor'; address: string; distanceM: number }
    | { kind: 'dong'; dong: string }
    | { kind: 'none' };
  /** 예상 설치 용량 — 막대에 얹는다 */
  capacityKw: number | null;
  /** 지역 계통 사정(호남 접수 재개 등) */
  region: string | null;
};

/* ------------------------------------------------------------- 지도 */

/** 지도에 그릴 것 — 좌표는 GeoJSON 처럼 [경도, 위도] */
export type SiteMap = {
  point: { lat: number; lng: number };
  parcel: PolygonCoords[];
  /** 필지 위 건물 모양 — 도로명주소를 붙일 때 그린 임시 네모는 뺐다(lib/buildings markProvisional) */
  buildings: { polygons: PolygonCoords[] }[];
  /** 지상형 — 200m 안에 든 주택 */
  houses: PolygonCoords[][];
  /** 건축물대장 주건축물 건축면적 합 — 지도 모양이 이것보다 많이 작으면 모양이 빠진 지붕이 있다 */
  registerArea: number | null;
  /** 패널 배치 방식 — 대장의 지붕 갈래로 정한다(기와는 지붕면 부착형, 나머지는 경사고정형) */
  roofStyle: LayoutStyle;
};

export type Report = {
  place: Place;
  mode: Mode;
  checks: Check[];
  verdict: Verdict;
  estimate: Estimate | null;
  grid: GridView | null;
  map: SiteMap | null;
  /** 화면이 고른 지붕으로 다시 셈할 때 쓰는 값 */
  inputs: {
    sido: string | null;
    /** 필지에 걸린 용도지역·지구 이름(접함 뺌) — 지상형 개발 인허가를 그린 네모 넓이로 다시 셀 때 */
    zones: string[];
  };
  checkedAt: string;
};

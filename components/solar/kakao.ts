/* 카카오 지도 SDK 에서 쓰는 것만 적었다 — 공식 타입 꾸러미가 없다 */
export type LatLng = { getLat(): number; getLng(): number };
export type Point = { x: number; y: number };
export type Bounds = { extend(p: LatLng): void };
export type Projection = {
  containerPointFromCoords(p: LatLng): Point;
  coordsFromContainerPoint(p: Point): LatLng;
};
export type KMap = {
  setBounds(b: Bounds, top?: number, right?: number, bottom?: number, left?: number): void;
  addControl(c: unknown, pos: unknown): void;
  getProjection(): Projection;
  /** 손잡이를 끄는 동안 지도가 같이 끌리지 않게 */
  setDraggable(on: boolean): void;
};
export type Shape = { setMap(m: KMap | null): void };
export type PolygonShape = Shape & { setOptions(o: Record<string, unknown>): void; setPath(path: LatLng[]): void };
export type Overlay = Shape & { setPosition(p: LatLng): void };
export type Listener = (e?: { latLng: LatLng }) => void;
export type KakaoMaps = {
  load(cb: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  LatLngBounds: new () => Bounds;
  Point: new (x: number, y: number) => Point;
  Map: new (el: HTMLElement, o: { center: LatLng; level: number; mapTypeId?: unknown }) => KMap;
  Polygon: new (o: Record<string, unknown>) => PolygonShape;
  CustomOverlay: new (o: Record<string, unknown>) => Overlay;
  ZoomControl: new () => unknown;
  ControlPosition: Record<'RIGHT', unknown>;
  MapTypeId: Record<'HYBRID', unknown>;
  event: {
    addListener(target: unknown, type: string, fn: Listener): void;
    removeListener(target: unknown, type: string, fn: Listener): void;
  };
};
declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let loading: Promise<KakaoMaps> | null = null;

/**
 * SDK 는 한 번만 붙인다(개발 모드의 두 번 마운트에도 같은 약속). 실패하면 다음에 다시 붙일 수 있게 비운다.
 * 카카오 앱의 「JavaScript SDK 도메인」에 이 주소가 없으면 스크립트가 거절되거나 load 가 끝내 안 불린다 — 10초로 끊는다.
 * 그리기 라이브러리(libraries=drawing)는 쓰지 않는다 — 그 네모는 돌릴 수 없어 지상형 네모는 직접 그린다(boxEditor).
 */
/** 경위도 [경도, 위도] → 카카오 좌표 */
export const latLngOf = (maps: KakaoMaps) => ([lng, lat]: [number, number]): LatLng => new maps.LatLng(lat, lng);

export function loadKakao(appKey: string): Promise<KakaoMaps> {
  if (loading) return loading;
  loading = new Promise<KakaoMaps>((resolve, reject) => {
    const ready = () => {
      const maps = window.kakao?.maps;
      if (!maps?.load) return reject(new Error('SDK 응답 모양이 다름'));
      const t = setTimeout(() => reject(new Error('응답 없음')), 10_000);
      maps.load(() => {
        clearTimeout(t);
        resolve(maps);
      });
    };
    if (window.kakao?.maps) return ready();
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    s.async = true;
    s.onload = ready;
    s.onerror = () => reject(new Error('스크립트를 못 받음'));
    document.head.appendChild(s);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/**
 * 제안서의 배치 — 부지 검토가 딴 지붕에 그 사업자의 설계 기준(모듈 경사각 · 줄 간격을 정하는 태양 고도)으로 패널을 다시 깐다. [순수]
 *
 * 한백 2026-11-06 「각 사업자 기준맞춰서 AI지붕깔기 해줘」. 사업자마다 설계 기준(구조설계 가이드라인 · 설계 개요 견본 · 틀 견본)이 달라, 같은
 * AI 지붕을 콘솔 기준(12° · 동지 10~14시 그림자)과 어느 사업자 기준으로 깔면 장수가 10% 넘게 갈렸다 — 콘솔 기준 하나로 내면 그 사업자의
 * 제안서 용량 · 금액이 그 회사 설계보다 크게(또는 작게) 나간다. 기준 값은 사업자 자료라 저장소에 두지 않는다 — 조건(DB — 화면 「틀 · 조건」).
 *
 * 장수 · 용량 · 사진 · 금액이 이 배치를 따른다. 부지 검토 지도는 콘솔 기준 그대로다(한 부지를 사업자와 상관없이 본다).
 * 지붕면 부착형(기와)은 지붕에 붙여 깔아 경사각 · 줄 간격 기준이 없다 — 콘솔 배치 그대로. 모듈 크기는 콘솔 것(lib/solar/assumptions MODULE)이다.
 */
import type { LngLat, PolygonCoords } from '@/lib/solar/geo';
import { cutLayout, layoutRoof, shadowPerHeightOf, SPEC, type LayoutSpec, type LayoutStyle } from '@/lib/solar/layout';
import { profileAngleDeg } from './calc';
import type { Terms } from './products';

export type ProposalLayout = {
  quads: LngLat[][];
  count: number;
  /** 제안서에 적는 모듈 경사각(°) — 지붕면 부착형이면 콘솔 값(쓰지 않는다) */
  tiltDeg: number;
  /** 제안서에 적는 음영각(°) — 줄 간격을 정한 태양 고도 */
  shadeDeg: number;
};

/** 조건의 배치 기준 → 배치 숫자. 줄 간격 기준 고도 · 방위각 한도가 0 이면 콘솔 기본(동지 10~14시 · 건물 변을 따라)을 쓴다 */
export function layoutRuleOf(terms: Terms): Partial<LayoutSpec> {
  return {
    tiltDeg: terms.tiltDeg,
    ...(terms.shadeAngleDeg > 0 ? { shadeAngleDeg: terms.shadeAngleDeg } : {}),
    ...(terms.azimuthLimitDeg > 0 ? { azimuthLimitDeg: terms.azimuthLimitDeg } : {}),
  };
}

/**
 * @param roofs 고른 지붕(부지 검토의 AI 지붕)
 * @param cuts  못 까는 곳(AI 가 본 장애물) — 지도에서 지운 것은 빠져 온다
 */
export function proposalLayout(roofs: { polygons: PolygonCoords[] }[], cuts: PolygonCoords[][], style: LayoutStyle, lat: number, terms: Terms): ProposalLayout {
  const over = style === 'tilted' ? layoutRuleOf(terms) : {};
  const quads = roofs.flatMap((r) => cutLayout(layoutRoof(r.polygons, style, lat, over), cuts).quads);
  const spec = { ...SPEC, ...over };
  return { quads, count: quads.length, tiltDeg: spec.tiltDeg, shadeDeg: profileAngleDeg(shadowPerHeightOf(lat, spec)) };
}

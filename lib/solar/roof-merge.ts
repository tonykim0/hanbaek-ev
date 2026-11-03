import { coveredShare, type PolygonCoords } from './geo';

/**
 * AI 가 한 지붕을 겹쳐 딴 것을 걷는다 — 넓은 것부터 두고, 절반 이상이 이미 둔 지붕 안인 것은 뺀다. 그대로 두면 그 자리에
 * 패널이 두 번 깔린다(한백 2026-11-03 「지붕이 2번 깔리는 경우」). 지도 모양(VWorld)과 AI 지붕이 겹치던 갈래는 지도 모양을
 * 지붕으로 쓰지 않게 되어 없어졌다(useRoofPlan).
 */
export function dropNested<T extends { polygons: PolygonCoords[]; area: number }>(roofs: T[]): T[] {
  const kept: T[] = [];
  for (const r of [...roofs].sort((a, b) => b.area - a.area)) {
    if (kept.length && coveredShare(r.polygons, kept.map((k) => k.polygons)) >= 0.5) continue;
    kept.push(r);
  }
  // 돌려줄 때는 받은 차례대로 — 화면의 「AI가 본 것」 목록이 AI 가 말한 순서를 지킨다
  return roofs.filter((r) => kept.includes(r));
}

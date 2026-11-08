/** AI 패널배치 결과 한 줄(components/solar/useRoofPlan traceMessage) — 지도 밑에 뜬다 */
import { describe, expect, it } from 'vitest';
import { traceMessage } from '@/components/solar/useRoofPlan';

const roof = (kind: string) => ({ polygons: [], kind, note: '' });

describe('traceMessage', () => {
  it('지붕 수 · 걸린 초', () => {
    expect(traceMessage({ roofs: [roof('판넬·금속'), roof('콘크리트')], obstacles: [], meta: { ms: 16_400 } })).toBe('AI가 지붕 2곳을 찾았습니다 · 16초');
  });
  it('천막 · 슬레이트(안 까는 갈래)와 못 까는 곳을 덧붙인다', () => {
    expect(traceMessage({ roofs: [roof('판넬·금속'), roof('기타'), roof('슬레이트')], obstacles: [{ polygons: [], note: '채광창' }], meta: { ms: 9_000 } })).toBe(
      'AI가 지붕 3곳(그중 2곳은 천막·슬레이트라 패널을 안 깔았습니다) · 못 까는 곳 1곳을 찾았습니다 · 9초',
    );
  });
  it('저장해 둔 결과면 초 대신 그렇게 적는다', () => {
    expect(traceMessage({ roofs: [roof('판넬·금속')], obstacles: [], cached: true })).toBe('AI가 지붕 1곳을 찾았습니다 (저장해 둔 결과)');
  });
});

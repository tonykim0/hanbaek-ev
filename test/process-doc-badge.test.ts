/**
 * 시공 서류 배지의 분모 — ★화면이 실제로 그리는 것만 센다★ (2026-09-08 검증).
 *
 * 전에는 PROCESS_DOCS 전체에서 조건(only)만 걸러 셌다. 그런데 화면이 그리는 것은
 * 그보다 좁다:
 *   ① 옛 「준공서류」(completion) 칸은 ★이미 올린 현장에만★ 그려진다
 *   ② 그 사업구분이 안 지나는 칸의 상자는 아예 안 그려진다(연동의 발주 상자)
 *
 * 그래서 아무도 안 쓴 옛 칸 하나 때문에 프로덕션 159건 전부가 N/N 에 못 닿았다
 * (실측 2026-09-08: completion 을 쓴 현장 0건). 세는 곳과 그리는 곳을 한 함수로 묶어
 * (shownProcessDocs) 다시 갈리지 않게 했다.
 */
import { describe, expect, it } from 'vitest';
import { shownProcessDocs } from '@/components/project/construction/milestones';
import type { GateContext } from '@/lib/process';
import type { ProjectDetail } from '@/types/project';

const P = (o: Record<string, unknown> = {}) =>
  ({ docs: [], status: '준공서류 접수/검토', ...o }) as unknown as ProjectDetail['process'];
const ctxOf = (bizType: '환경부' | '자체투자' | '기설치 연동'): GateContext =>
  ({ subsidized: bizType === '환경부', powerType: '모자분리', bizType, cpo: '플러그링크' });
const keys = (p: ReturnType<typeof P>, b: Parameters<typeof ctxOf>[0]) =>
  shownProcessDocs(p, ctxOf(b)).map((d) => d.key);

describe('배지 분모는 화면이 그리는 서류다', () => {
  it('★옛 「준공서류」 칸은 안 센다★ — 안 그려지는 칸이라 N/N 에 못 닿게 만들었다', () => {
    expect(keys(P(), '환경부')).not.toContain('completion');
  });

  it('그 칸을 실제로 쓴 현장은 다시 센다 — 파일이 화면에서 사라지면 안 된다', () => {
    const legacy = P({ docs: [{ kind: 'completion', status: 'uploaded' }] });
    expect(keys(legacy, '환경부')).toContain('completion');
    /* 옛 칸 하나만큼 늘어난다 */
    expect(keys(legacy, '환경부').length).toBe(keys(P(), '환경부').length + 1);
  });

  it('기설치 연동은 안 지나는 칸의 서류를 안 센다 — 올릴 자리가 없는 것들이다', () => {
    const link = keys(P(), '기설치 연동');
    expect(link).not.toContain('orderQuote');       // 견적서 — 발주 상자
    expect(link).not.toContain('installNotice');    // 충전시설 설치 신고서 — 발주 상자
    /* 표준 흐름은 그대로 센다 */
    expect(keys(P(), '환경부')).toContain('orderQuote');
    expect(keys(P(), '환경부')).toContain('installNotice');
  });

  it('「(환경부)」 준공서류 둘도 사업구분을 따른다 — doc-rules 의 조건이 여기까지 온다', () => {
    expect(keys(P(), '환경부')).toContain('completeConfirm');
    expect(keys(P(), '자체투자')).not.toContain('completeConfirm');
    expect(keys(P(), '자체투자')).not.toContain('costSurvey');
  });

  it('분모가 사업구분마다 다르다 — 연동이 가장 좁다', () => {
    const n = (b: Parameters<typeof ctxOf>[0]) => keys(P(), b).length;
    expect(n('환경부')).toBeGreaterThan(n('자체투자'));
    expect(n('자체투자')).toBeGreaterThan(n('기설치 연동'));
  });
});

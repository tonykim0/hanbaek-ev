/**
 * 준공에 받는 서류가 사업구분마다 다르다 — ★「(환경부)」 둘은 보조사업만★
 * (한백 확인 2026-09-08 「환경부에만 해당」 · 「나머지는 없음」).
 *
 * 그 둘에 조건이 없어 전 현장 필수였고, 준공완료 게이트가 이 목록을 그대로 물어
 * 자체투자·기설치 연동은 준공완료에 영영 못 들어갔다. 한쪽만 열리는 것이 특히
 * 나빴다: 준공마감은 공정 상태를 안 봐서 받을 기성은 열리는데 내려줄 2차는 막혔다.
 */
import { describe, expect, it } from 'vitest';
import { STATUS_GATES } from '@/lib/process';
import { processDocsFor } from '@/lib/doc-rules';
import type { ProcessInfo } from '@/types/project';

const P = (o: Record<string, unknown> = {}): ProcessInfo =>
  ({ docs: [], status: '준공서류 접수/검토', ...o }) as unknown as ProcessInfo;
const ctxOf = (bizType: '환경부' | '자체투자' | '기설치 연동', powerType: '모자분리' | '한전불입') =>
  ({ subsidized: bizType === '환경부', powerType, bizType, cpo: '플러그링크' as const });
const asks = (biz: Parameters<typeof ctxOf>[0], pw: Parameters<typeof ctxOf>[1]) =>
  (STATUS_GATES['준공완료']?.(P(), ctxOf(biz, pw)) ?? []).map((b) => b.label);

describe('준공완료가 묻는 서류', () => {
  it('환경부는 「(환경부)」 둘을 그대로 묻는다 — 예전과 같다', () => {
    expect(asks('환경부', '모자분리')).toEqual([
      '설치완료확인서 (환경부)', '원가조사서 (환경부)', '사용전점검/검사 필증', '사용검사 필증', '준공도면',
    ]);
  });

  it('★자체투자·기설치 연동은 그 둘을 안 묻는다★ — 환경부에 낼 일이 없는 사업이다', () => {
    for (const biz of ['자체투자', '기설치 연동'] as const) {
      expect(asks(biz, '모자분리')).toEqual(['사용전점검/검사 필증', '사용검사 필증', '준공도면']);
    }
  });

  it('나머지 넷은 사업구분과 무관하다 — 관공서 서류라 다 받는다', () => {
    for (const biz of ['환경부', '자체투자', '기설치 연동'] as const) {
      const l = asks(biz, '모자분리');
      expect(l).toContain('사용전점검/검사 필증');
      expect(l).toContain('사용검사 필증');
      expect(l).toContain('준공도면');
    }
  });

  it('한전불입의 선임신고증명서는 그대로 붙는다 — 수전방식 조건이라 별개다', () => {
    expect(asks('자체투자', '한전불입')).toContain('전기안전관리자 선임신고증명서');
    expect(asks('자체투자', '모자분리')).not.toContain('전기안전관리자 선임신고증명서');
  });

  it('★프로덕션에 걸려 있던 자리★ — 준공도면·사용전점검/검사 필증만 낸 자체투자 현장', () => {
    const have = P({ docs: [{ kind: 'asBuilt', status: 'uploaded' }, { kind: 'safety', status: 'uploaded' }] });
    const left = (b: Parameters<typeof ctxOf>[0]) =>
      (STATUS_GATES['준공완료']?.(have, ctxOf(b, '모자분리')) ?? []).map((x) => x.label);
    /* 전남개발공사·예다음아르띠에가 그 상태였다 — 이제 사용검사 필증 하나만 남는다 */
    expect(left('자체투자')).toEqual(['사용검사 필증']);
    expect(left('환경부')).toEqual(['설치완료확인서 (환경부)', '원가조사서 (환경부)', '사용검사 필증']);
  });

  it('서류 목록 자체도 갈린다 — 화면이 그리는 칸 수와 배지 분모가 같이 준다', () => {
    /* 준공 묶음이 그리는 칸 — milestones 의 목록과 같다 */
    const keys = ['completeConfirm', 'costSurvey', 'safety', 'useInspect', 'asBuilt'] as never;
    const n = (b: Parameters<typeof ctxOf>[0]) => processDocsFor(keys, ctxOf(b, '모자분리')).length;
    expect(n('환경부') - n('자체투자')).toBe(2);
  });
});

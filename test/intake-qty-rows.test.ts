/**
 * 판독이 읽은 대수가 갈 칸 — ★한백 지적 2026-09-22★.
 *
 * 「계약서에 다 나와있는데 왜 계약서류 접수단계에서 이걸 그냥 내보낸거야?」
 * (HB-2026-184 서울 강북 번동금호어울림A — 계약서에 「설치수량 5기 · 계약기간 7년」이
 *  찍혀 있는데 계약대수 0 대로 들어왔다.)
 *
 * 접수 화면의 자동채움이 「자체투자면 교체유형이 둘이라 모른다」로 뭉뚱그리고, 칸 이름도
 * 「환경부 신규」로 박아 두고 있었다. 둘 다 틀렸다:
 *   · 플러그링크·나이스·현대엔지니어링은 자체투자를 안 가른다 — 칸이 하나뿐인데 비웠다
 *   · 기설치 연동은 칸이 하나인데 없는 칸 이름에 적어 그대로 사라졌다
 * 어느 쪽이든 조용히 0 대가 됐다. 칸 목록은 화면이 쓰는 것과 ★같은 답★이어야 한다.
 */
import { describe, expect, it } from 'vitest';
import { SPLITS_SELF_REPL } from '@/types/project';
import type { BizType, CpoName, ReplType } from '@/types/project';

/* components/IntakeForm 의 replRowsOf 와 같은 규칙 — 화면은 클라이언트 부품이라 여기 옮겨 적는다 */
const SELF_REPLS: ReplType[] = ['자체투자 (제자리교체)', '자체투자 (신규위치)'];
function replRowsOf(bizType: BizType | null, cpo: CpoName): ReplType[] {
  if (bizType === '자체투자') return SPLITS_SELF_REPL.has(cpo) ? [...SELF_REPLS] : [SELF_REPLS[0]];
  if (bizType === '기설치 연동') return ['기설치 연동'];
  return ['환경부 신규'];
}

describe('대수가 들어갈 칸', () => {
  it('★안 가르는 운영사의 자체투자는 칸이 하나다★ — 그 현장이 0 대로 들어온 까닭', () => {
    for (const cpo of ['플러그링크', '나이스인프라', '현대엔지니어링'] as CpoName[]) {
      expect(replRowsOf('자체투자', cpo), cpo).toEqual(['자체투자 (제자리교체)']);
    }
  });

  it('가르는 운영사만 둘이다 — 그때는 사람이 나눠 적어야 한다', () => {
    for (const cpo of ['에버온', 'SK일렉링크'] as CpoName[]) {
      expect(replRowsOf('자체투자', cpo), cpo).toHaveLength(2);
    }
  });

  it('★기설치 연동의 칸 이름은 「환경부 신규」가 아니다★ — 없는 칸에 적으면 사라진다', () => {
    expect(replRowsOf('기설치 연동', '플러그링크')).toEqual(['기설치 연동']);
  });

  it('환경부는 환경부 신규 하나다', () => {
    expect(replRowsOf('환경부', '플러그링크')).toEqual(['환경부 신규']);
  });

  it('사업구분을 아직 모르면 환경부로 연다 — 접수의 기본값이다', () => {
    expect(replRowsOf(null, '플러그링크')).toEqual(['환경부 신규']);
  });
});

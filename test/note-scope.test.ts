/**
 * 진행현황 갈래 — 계약 탭과 시공 탭이 각자 자기 이야기를 갖는다 (한백 지시 2026-09-17).
 *
 * 판정이 두 벌이면 「시공 탭에서 남긴 글이 계약에 서는」 일이 생긴다 — 라우트도 저장소도
 * 이 함수 하나를 본다.
 */
import { describe, expect, it } from 'vitest';
import { isNoteScope, NOTE_SCOPES } from '@/types/project';

describe('진행현황 갈래', () => {
  it('갈래는 둘뿐이다 — 화면이 그 둘만 그린다', () => {
    expect([...NOTE_SCOPES]).toEqual(['계약', '시공']);
  });

  it('계약·시공은 받는다', () => {
    expect(isNoteScope('계약')).toBe(true);
    expect(isNoteScope('시공')).toBe(true);
  });

  /*
   * ★모르는 값은 막는다★ — 아무 탭에서도 안 보이는 글이 되느니 안 써지는 것이 낫다.
   * 화면이 안 보내는 일(옛 클라이언트·직접 호출)이 실제로 생길 수 있는 자리다.
   */
  it('그 밖의 값은 갈래가 아니다', () => {
    for (const v of [undefined, null, '', '정산', '기성', 'construction', '시공 ', 0, {}]) {
      expect(isNoteScope(v)).toBe(false);
    }
  });
});

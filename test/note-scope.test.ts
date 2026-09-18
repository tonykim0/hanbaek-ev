/**
 * 진행현황 갈래 — 계약 탭과 시공 탭이 각자 자기 이야기를 갖는다 (한백 지시 2026-09-17).
 *
 * 판정이 두 벌이면 「시공 탭에서 남긴 글이 계약에 서는」 일이 생긴다 — 라우트도 저장소도
 * 이 함수 하나를 본다.
 */
import { describe, expect, it } from 'vitest';
import { isNoteScope, NOTE_SCOPES } from '@/types/project';

describe('진행현황 갈래', () => {
  it('갈래는 셋이다 — 화면이 그 셋만 그린다(계약·시공·기성)', () => {
    expect([...NOTE_SCOPES]).toEqual(['계약', '시공', '기성']);
  });

  it('계약·시공·기성은 받는다', () => {
    for (const v of NOTE_SCOPES) expect(isNoteScope(v)).toBe(true);
  });

  /*
   * ★협력사 정산관리 탭은 갈래를 쓰지 않는다★ (한백 지시 2026-09-18) — 거기는 원래 있던
   * 지급 메모(settlements.pay_note)가 제목만 바꿔 그 자리를 맡는다. 그래서 '지급' 갈래는 없다.
   */
  it('「지급」은 갈래가 아니다 — 그 탭은 옛 메모가 맡는다', () => {
    expect(isNoteScope('지급')).toBe(false);
    expect(isNoteScope('정산')).toBe(false);
  });

  /*
   * ★모르는 값은 막는다★ — 아무 탭에서도 안 보이는 글이 되느니 안 써지는 것이 낫다.
   * 화면이 안 보내는 일(옛 클라이언트·직접 호출)이 실제로 생길 수 있는 자리다.
   */
  it('그 밖의 값은 갈래가 아니다', () => {
    for (const v of [undefined, null, '', '정산', '지급', 'construction', '시공 ', 0, {}]) {
      expect(isNoteScope(v)).toBe(false);
    }
  });
});

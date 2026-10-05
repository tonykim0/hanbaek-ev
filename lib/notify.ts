/**
 * 진행현황 글이 누구에게 알림으로 가는가 — 한 곳에서 정한다. [순수]
 *
 * 한백 지시 2026-10-05 「메모·댓글을 우리와 협력사 간 소통 창구로 — 내가 남긴 댓글이 상대방에게 알림으로」.
 * 창구는 현장 상세의 「진행현황 및 메모」다(계약·시공 탭마다 한 줄기). 쓴 쪽의 ★상대방★에게 간다:
 *
 *   한백이 남김     → 그 현장의 협력사. 계약 탭 글은 영업 쪽(salesOrg), 시공 탭 글은 시공 쪽(gcOrg) —
 *                    그 일을 맡은 회사다. 한쪽이 비었으면(턴키 등) 다른 쪽.
 *                    기성 탭 글은 아무에게도 안 간다 — 협력사에게는 그 탭이 없다(한백끼리의 기록).
 *   협력사가 남김   → 한백 관리자 전부. 열람 전용(재무)은 받지 않는다 — 답할 손이 없다.
 *
 * 쓴 사람 자신은 받지 않는다. 같은 현장의 다른 협력사(영업사가 쓴 글의 시공사)에게는 가지 않는다 —
 * 창구는 한백과 협력사 사이다. 보는 것은 그대로 보인다(진행현황은 그 현장의 누구나 읽는다).
 */
import type { NoteScope } from '@/types/project';

export type NoteAudience =
  | { kind: 'org'; org: string }
  | { kind: 'hanbaek' }
  | null;

export function noteAudience(input: {
  /** 한백(관리자)이 썼나 */
  byHanbaek: boolean;
  scope: NoteScope;
  salesOrg: string | null;
  gcOrg: string | null;
}): NoteAudience {
  if (!input.byHanbaek) return { kind: 'hanbaek' };
  if (input.scope === '기성') return null;
  const org = input.scope === '계약' ? input.salesOrg ?? input.gcOrg : input.gcOrg ?? input.salesOrg;
  return org ? { kind: 'org', org } : null;
}

/** 글의 갈래 → 그 글이 서는 현장 상세의 탭(주소의 ?tab=) */
export const TAB_OF_SCOPE: Record<NoteScope, 'intake' | 'construction' | 'receivable'> = {
  계약: 'intake',
  시공: 'construction',
  기성: 'receivable',
};

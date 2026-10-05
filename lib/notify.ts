/**
 * 진행현황 글이 누구에게 알림으로 가는가 — 한 곳에서 정한다. [순수]
 *
 * 한백 지시 2026-10-05 「메모·댓글을 우리와 협력사 간 소통 창구로 — 내가 남긴 댓글이 알림으로」 ·
 * 「굳이 내가 답하는 게 중요한 게 아니라, 서로 한 현장에 대해 기록을 남기면서 커뮤니케이션한다는 게 중요해」.
 *
 * 창구는 현장 상세의 「진행현황 및 메모」다(계약·시공 탭마다 한 줄기). ★그 현장의 기록을 같이 쓰는 사람 모두★에게
 * 간다 — 쓴 사람만 뺀다. 한 사람이 받아 답하는 구조가 아니라, 한 현장에 남는 기록을 다 같이 따라간다:
 *
 *   계약·시공 탭 글  → 한백 관리자 전부 + 그 현장의 협력사(영업사·시공사 둘 다)
 *   기성 탭 글       → 한백 관리자만 — 협력사에게는 그 탭이 없다
 *
 * 열람 전용(재무)은 받지 않는다 — 글을 남기는 자리에 서지 않는다(읽기는 그대로 한다).
 */
import type { NoteScope } from '@/types/project';

export interface NoteAudience {
  /** 한백 관리자들 */
  hanbaek: boolean;
  /** 협력사 소속들 — 그 소속의 계정 모두 */
  orgs: string[];
}

export function noteAudience(input: { scope: NoteScope; salesOrg: string | null; gcOrg: string | null }): NoteAudience {
  if (input.scope === '기성') return { hanbaek: true, orgs: [] };
  const orgs = [...new Set([input.salesOrg, input.gcOrg].filter((o): o is string => !!o))];
  return { hanbaek: true, orgs };
}

/** 글의 갈래 → 그 글이 서는 현장 상세의 탭(주소의 ?tab=) */
export const TAB_OF_SCOPE: Record<NoteScope, 'intake' | 'construction' | 'receivable'> = {
  계약: 'intake',
  시공: 'construction',
  기성: 'receivable',
};

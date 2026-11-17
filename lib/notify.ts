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

/**
 * 환경부 승인 알림의 글 — 한백이 환경부 승인일을 ★처음★ 넣으면 그 현장 사람들에게 간다
 * (한백 지시 2026-10-12 「환경부 승인일을 입력 완료하면 그 현장에 승인 완료 알림을」).
 * 고치거나 지울 때는 안 보낸다(한백 「처음 넣으면, 이것만 하자」).
 * 받는 사람은 시공 탭 글과 같다(noteAudience '시공') — 누르면 시공 탭으로 간다. 대기번호도 같다(queueNotice).
 *
 * ★한 줄뿐이다★ (한백 2026-10-15 「승인 알림도 한 줄로」 — 대기번호 알림과 같은 꼴). 할 일은 붙이지 않는다.
 * 기성은 말하지 않는다 — 이 날짜가 기성 「기후부 승인」 차수를 열지만 기성은 한백만 보는 탭이다.
 *
 * ★글의 「환경부」는 2026-11-17 부터 「기후부」다★ (한백 「기후부로 바꿔」 — 승인 · 승인 취소 · 대기번호 셋 다).
 * 이미 나간 알림의 제목 · 글도 migrations/0134 가 옮겼다 — 목록의 꼬리표가 저장된 제목이라 두 이름이 섞여 서지 않게.
 */
export function approvalNotice(date: string): { title: string; body: string } {
  return { title: '기후부 승인', body: `승인일 ${date} — 기후부 승인 완료` };
}

/**
 * 환경부 승인 취소 알림의 글 — 잘못 넣은 승인일을 지우면, 승인 알림을 ★이미 읽은★ 사람에게만 간다
 * (한백 지시 2026-11-17 · store/notifications retractApproval). 승인 알림과 같은 한 줄 꼴이다.
 */
export function approvalCancelNotice(date: string): { title: string; body: string } {
  return { title: '기후부 승인 취소', body: `승인일 ${date} 입력 취소 — 아직 승인 전` };
}

/**
 * 환경부 대기번호 알림의 글 — 한백이 대기번호를 ★처음★ 넣으면 그 현장 사람들에게 간다
 * (한백 지시 2026-10-12 「대기번호 입력했을 때도 알림 가게」). 승인 알림과 같은 규칙이다: 현장마다 한 번,
 * 받는 사람은 시공 탭 글과 같다(시공 보드의 첫 칸이 「기후부 승인 대기」다).
 *
 * ★한 줄뿐이다★ (한백 2026-10-13 「대기번호 2026-595 — 환경부 접수 완료, 위 메시지만」) — 할 일은 붙이지 않는다.
 */
export function queueNotice(no: string): { title: string; body: string } {
  return { title: '기후부 대기번호', body: `대기번호 ${no} — 기후부 접수 완료` };
}

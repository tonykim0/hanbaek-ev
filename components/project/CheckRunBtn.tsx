'use client';

/**
 * 대조를 (다시) 돌리는 단추 — 건축물대장 대조(ParkingCheck)와 기설치 대조(PreInstallCheck)의 머리 줄에 선다.
 *
 * ★자리는 제목 바로 뒤다★ (GroupHead action) — 이틀 사이에 두 번 옮겼다:
 *   · 상태 꼬리표(짚을 것 2) 뒤 → 흰 바탕 작은 곁 단추가 꼬리표의 하나처럼 읽혔다(한백 2026-10-21 「잘 안 보여」).
 *   · 머리 줄 오른쪽 끝(ml-auto) → 넓은 화면에서 제목과 멀어 눈이 거기까지 안 갔다(한백 2026-10-22 「맨 오른쪽에 있어서
 *     안 보인다」).
 *   제목을 읽는 눈이 바로 닿는 자리에 두고, 꼬리표와는 ★모양★으로 가른다 — 돌리는 그림(↻)을 단다. 꼬리표에는 그림이 없다.
 * ★무게★ — 돌려야 하는 때는 주 단추(do)다: 대조 전 · 서류가 바뀜 · 견주는 것이 늘어남 · 못 읽은 파일이 있고 아직
 *   넘기지 않음. 그때는 계약 확인이 어차피 막혀 있어(preCheckBlocker·parkingBlocker) 이 구역에서 할 일이 이것
 *   하나라, 주 단추가 한 상자에 둘이 되지 않는다. 결과가 서 있으면(맞음 · 짚을 것만 남음 · 넘김) 곁 단추(side)다.
 * 실패 문구는 단추 바로 뒤다(화면 규칙 9). 두 구역이 같은 꼴이라 한 부품이다 — 한쪽만 고치면 갈린다.
 */
import { Btn, Err } from '@/components/ui';

export function CheckRunBtn({ due, done, blocked, busy, error, onClick }: {
  /** 지금 돌려야 하는가 — 주 단추가 된다 */
  due: boolean;
  /** 대조한 결과가 있는가 — 「다시 대조」와 「대조」를 가른다 */
  done: boolean;
  /** 돌릴 수 없는 까닭 — 있으면 단추 이름이 그것이고 눌리지 않는다(화면 규칙 3) */
  blocked: string | null;
  busy: boolean;
  error: string | null;
  onClick: () => void;
}) {
  return (
    <span className="flex items-center gap-2 self-center">
      <Btn
        kind={due && !blocked ? 'do' : 'side'}
        size="sm"
        busy={busy}
        busyLabel="대조 중… (30초쯤)"
        disabled={blocked !== null}
        onClick={onClick}
        className="inline-flex items-center gap-1"
      >
        {!blocked && <Redo />}
        {blocked ?? (done ? '다시 대조' : '대조')}
      </Btn>
      <Err>{error}</Err>
    </span>
  );
}

/** 돌리는 그림 — 단추를 꼬리표와 가른다. 글자 색을 따른다 */
function Redo() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3.5H10" />
    </svg>
  );
}

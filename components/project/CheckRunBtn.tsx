'use client';

/**
 * 대조를 (다시) 돌리는 단추 — 건축물대장 대조(ParkingCheck)와 기설치 대조(PreInstallCheck)의 머리 줄에 선다.
 *
 * ★한백 지적 2026-10-21 「다시 대조 버튼 잘 안 보여」★ — 흰 바탕의 작은 곁 단추가 상태 꼬리표(짚을 것 2) 바로 뒤에
 * 붙어 꼬리표의 하나처럼 읽혔다. 두 가지를 바꿨다:
 *   ① 자리 — 머리 줄의 오른쪽 끝. 상태와 떨어져 늘 같은 자리에 선다(꼬리표 수가 바뀌어도 단추가 밀리지 않는다).
 *   ② 무게 — 돌려야 하는 때는 주 단추(do)다: 대조 전 · 서류가 바뀜 · 견주는 것이 늘어남 · 못 읽은 파일이 있고 아직
 *      넘기지 않음. 그때는 계약 확인이 어차피 막혀 있어(preCheckBlocker·parkingBlocker) 이 구역에서 할 일이 이것
 *      하나라, 주 단추가 한 상자에 둘이 되지 않는다. 결과가 서 있으면(맞음 · 짚을 것만 남음 · 넘김) 곁 단추(side)다.
 * 두 구역이 같은 꼴이라 한 부품이다 — 한쪽만 고치면 갈린다.
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
    <span className="ml-auto flex items-center gap-2 self-center">
      <Err>{error}</Err>
      <Btn
        kind={due && !blocked ? 'do' : 'side'}
        size="sm"
        busy={busy}
        busyLabel="대조 중… (30초쯤)"
        disabled={blocked !== null}
        onClick={onClick}
      >
        {blocked ?? (done ? '다시 대조' : '대조')}
      </Btn>
    </span>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import { Btn, Err } from '@/components/ui';

/**
 * 한전 여유용량을 못 받은 현장 — 그 자리에서 다시 묻는다(부지 검토의 계통 칸 · 제안서 생성의 「1 현장」). 같은 부지를 다시 불러오는
 * 것이라(ParcelBar 와 같은 길) 지도에서 뺀 지붕은 되살아나지만, AI 지붕은 하루 저장해 둔 결과라 다시 부르지 않는다(돈이 안 든다).
 * 한전 서버가 통째로 안 열리는 날(2026-11-24~25)에는 다시 받아도 같다 — 실패 문구가 단추 옆에 다시 선다.
 */
export default function GridRetry({
  busy,
  onRetry,
  label = null,
}: {
  busy: boolean;
  onRetry: () => Promise<string | null>;
  /** 단추 앞의 한 줄 — 결론이 따로 없는 자리(제안서 생성)만 */
  label?: ReactNode;
}) {
  const [going, setGoing] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const retry = async () => {
    setGoing(true);
    setFail(null);
    setFail(await onRetry());
    setGoing(false);
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {label}
      <Btn kind="quiet" size="sm" busy={going} busyLabel="다시 받는 중…" disabled={busy} onClick={retry}>
        다시 받기
      </Btn>
      <Err>{fail}</Err>
    </div>
  );
}

'use client';

/**
 * 담당과의 대화를 열면 그 담당의 정기 알림(열린구매 상신 — lib/agents/open-purchase)이 읽힌다. 현장 탭을 열면 그 갈래의 알림이 읽히는
 * 것(ProgressLog)과 같은 결이다 — 알림 줄을 누르면 여기로 온다. 읽은 것이 있으면 사이드바 배지를 다시 센다. 대행 중이면 라우트가
 * 안 찍는다. 그리는 것은 없다.
 */
import { useEffect } from 'react';
import { NOTIFICATIONS_CHANGED } from '@/lib/notify-events';

export function ReadAgentAlarms({ agentId }: { agentId: string }) {
  useEffect(() => {
    void fetch('/api/notifications/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ marked?: number }>) : null))
      .then((j) => {
        if ((j?.marked ?? 0) > 0) window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      })
      .catch(() => {
        /* 못 찍으면 알림이 남을 뿐 — 다음에 열 때 다시 찍는다 */
      });
  }, [agentId]);
  return null;
}

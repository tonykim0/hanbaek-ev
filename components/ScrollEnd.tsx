'use client';

/**
 * 가로로 넘치는 상자를 오른쪽 끝에서 열어 둔다 — 시간 축 그래프는 최근 쪽이 끝에 있다.
 *
 * 수주 현황의 월별·누적 그래프가 폰 폭에서 상자 안 가로 스크롤이 되는데, 왼쪽(1월)에서 열려 이번 달이 화면 밖에
 * 있었다(2026-10-16). 넘치지 않는 폭에서는 아무 일도 안 한다(scrollWidth 가 폭과 같다).
 */
import { useEffect, useRef, type ReactNode } from 'react';

export default function ScrollEnd({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

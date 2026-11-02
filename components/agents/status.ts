/**
 * 담당 표지의 등 판정 — 현황과 담당 화면이 같이 쓴다(둘이 다른 색을 켜지 않게).
 *   빨강  기한 지난 할 일이 있거나, 맡은 범위에 막는 것(확정 누락)이 있다
 *   노랑  봐야 할 것이 있다 — 한백 차례 · 7일 넘게 멈춘 현장
 *   초록  업무 정의가 있고 짚을 것이 없다
 *   회색  업무 정의 전 — 아직 일을 맡기지 않았다
 * 깜빡임은 색과 따로다 — 최근 24시간에 대화가 있었다는 것.
 */
import { stampOf } from '@/lib/date';
import type { Agent, AgentHeadline } from '@/types/agents';
import type { LedTone } from './kit';

/** 조직도 칸의 직함 줄 — 그 담당이 맡은 일. 운영사 담당은 이름이 곧 맡은 곳이라 일만 적는다 */
export function roleLineOf(agent: Agent): string {
  switch (agent.kind) {
    case 'strategy': return '시장 정보 · 전략 · 기획';
    case 'operator': return '현장 진행 · 운영사 소통';
    case 'settlement': return '기성 수금 · 협력사 지급 · 열린구매';
  }
}

export function ledOf(a: { lateTasks: number; duties: number; headline: AgentHeadline }): { tone: LedTone; label: string } {
  if (a.lateTasks > 0 || a.headline.counts.some((c) => c.tone === 'stop')) return { tone: 'stop', label: '막힌 것 있음' };
  if (a.headline.counts.some((c) => c.tone === 'warn')) return { tone: 'warn', label: '봐야 할 것 있음' };
  if (a.duties > 0) return { tone: 'ok', label: '짚을 것 없음' };
  return { tone: 'idle', label: '업무 정의 전' };
}

/** 최근 24시간 안의 말인가 — 말의 시각은 한국 시각 글자(YYYY-MM-DD HH:mm)라 글자로 견준다 */
export function isLive(lastAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastAt) return false;
  return lastAt >= stampOf(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

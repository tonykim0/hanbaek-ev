/**
 * 담당의 상태 — 현황과 담당 화면이 같이 쓴다(둘이 다른 말을 하지 않게). ★색만으로 말하지 않는다★ — 늘 글자가 붙은 상태 배지로
 * 서고, 현황에는 색 풀이 한 줄이 선다(한백 2026-11-05 「어떤 부분은 초록색, 빨간색, 노란색, 회색으로 되어있는데 이것도
 * 표시해줘야할듯」 — 그전에는 담당 표지 모서리의 작은 등뿐이라 무슨 색인지 읽을 수 없었다). 색은 콘솔의 상태 색 그대로다.
 *   막힘(빨강)          기한 지난 할 일 · 맡은 범위에 막는 것(확정 누락)
 *   확인 필요(노랑)     승인을 기다리는 메일 · 한백 차례 · 7일 넘게 멈춘 현장
 *   정상(초록)          업무 정의가 있고 위 것이 없다
 *   업무 정의 전(회색)  아직 일을 맡기지 않았다
 * 까닭은 같은 줄에 같은 색으로 보인다 — 기한 지난 할 일은 「지금 하는 일」의 빨간 꼬리표, 승인 대기 메일은 그 앞의 노란 꼬리표,
 * 확정 누락 · 한백 차례 · 정체는 맡은 범위의 꼬리표(lib/agents/brief headlineOf).
 */
import { OVERDUE_DAYS } from '@/lib/todo-types';
import type { Biz } from '@/lib/biz';
import type { Agent, AgentHeadline } from '@/types/agents';
import type { Tone } from '@/components/ui';

export type AgentState = 'stop' | 'warn' | 'ok' | 'idle';

export const STATE_LABEL: Record<AgentState, string> = {
  stop: '막힘',
  warn: '확인 필요',
  ok: '정상',
  idle: '업무 정의 전',
};

/** 배지의 색 — 콘솔 상태 색(ui.tsx Tone). 초록은 ok 다: 사업 색(brand)이면 태양광에서 귤색이 되어 노랑과 섞인다 */
export const STATE_TONE: Record<AgentState, Tone> = { stop: 'stop', warn: 'warn', ok: 'ok', idle: 'mute' };

export function stateOf(a: { lateTasks: number; duties: number; pendingMails: number; headline: AgentHeadline }): AgentState {
  if (a.lateTasks > 0 || a.headline.counts.some((c) => c.tone === 'stop')) return 'stop';
  if (a.pendingMails > 0 || a.headline.counts.some((c) => c.tone === 'warn')) return 'warn';
  if (a.duties > 0) return 'ok';
  return 'idle';
}

/**
 * 색 풀이 — 그 사업에서 그 색을 실제로 켜는 것만 적는다. 태양광의 맡은 범위(lib/agents/solar-brief)에는 꼬리표 셈이 없어
 * 확정 누락 · 한백 차례 · 정체가 빠진다 — 맡은 범위에 색 셈을 더하면 여기도 같이 고친다.
 */
export function stateLegend(biz: Biz): Array<{ state: AgentState; why: string }> {
  const ev = biz === 'ev';
  return [
    { state: 'stop', why: ['기한 지난 할 일', ...(ev ? ['확정 누락'] : [])].join(' · ') },
    { state: 'warn', why: ['승인 대기 메일', ...(ev ? ['한백 차례', `${OVERDUE_DAYS}일+ 정체`] : [])].join(' · ') },
    { state: 'ok', why: '짚을 것 없음' },
    { state: 'idle', why: '아직 일을 맡기지 않음' },
  ];
}

/** 담당이 맡은 일 — 현황 줄의 이름 밑 · 담당 화면의 머리말. 운영사 · 사업자 담당은 이름이 곧 맡은 곳이라 일만 적는다 */
export function roleLineOf(agent: Agent): string {
  switch (agent.kind) {
    case 'strategy': return '시장 정보 · 전략 · 기획';
    case 'operator': return '현장 진행 · 운영사 소통';
    case 'owner': return '현장 진행 · 사업자 소통';
    case 'settlement': return '기성 수금 · 협력사 지급 · 열린구매';
  }
}

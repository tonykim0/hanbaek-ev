/**
 * 태양광 현장의 단계 — ★초안★(2026-11-03). 보드의 칸이 이 차례로 선다.
 *
 * 태양광은 인허가와 계통이 몇 달씩 걸리고 거기서 잘 막힌다(발전사업허가 · 개발행위허가 · 한전 계통 접수) — 그래서
 * 「인허가」를 칸 하나로 세웠다. 칸마다 무엇이 끝나야 다음 칸으로 가는지(서류 · 날짜)는 한백의 역할(영업만 · 설계·시공 ·
 * 발전사업자)이 정해진 뒤에 정한다 — 전기차처럼 칸은 저장하지 않고 기록된 일에서 유도한다(lib/stage 와 같은 생각).
 */
export const SOLAR_STAGES = [
  { key: 'consult', label: '상담' },
  { key: 'survey', label: '현장 확인' },
  { key: 'contract', label: '견적·계약' },
  { key: 'permit', label: '인허가' },
  { key: 'build', label: '시공' },
  { key: 'inspect', label: '사용전검사' },
  { key: 'operate', label: '상업운전' },
] as const;

export type SolarStage = (typeof SOLAR_STAGES)[number]['key'];

/**
 * 에이전트 화면의 모양 — ★콘솔 부품(components/ui.tsx) 그대로이고, 여기에는 ui.tsx 에 없는 것만 둔다★.
 *   AgentMark  담당 표지 — 반짝이를 새긴 사업 색 칸
 *   Spark      반짝이 하나 — 에이전트가 한 것(답 · 적은 할 일 · 올린 목표 · 방향)을 가르는 표시
 *   FileChip   넘긴 파일 한 장 — 누르면 연다
 *   LINK       글 속 고리
 *
 * ★2026-11-05 콘솔 틀에 맞췄다★(한백 「AI 에이전트 페이지 UI도 기존 디자인시스템에 맞춰서 수정해줘」). 11-02 「좀 futurist 하게」 →
 * 「검정 배경은 지워줘. 기존 디자인컴포넌트의 틀은 맞추되, AI에이전트의 느낌은 지우지마」로 남겨 둔 장식을 걷었다: 표지의 그라데이션 ·
 * 그림자(콘솔은 그림자를 떠 있는 것에만 쓴다 — /design 「쓰지 않는 것」) · 구역 제목 앞 「//」(→ ui.tsx SectionHead) · 점 격자
 * 바탕 · 팀 층을 잇는 줄기 선과 마디(→ SectionHead 의 걸음 번호) · 이레 활동 칸(→ 곁글의 셈) · 깜빡이는 등과 점 · 표지 모서리의
 * 상태 등(→ 글자가 붙은 상태 배지, 같은 날 「초록색, 빨간색 … 이것도 표시해줘야할듯」). 에이전트임을
 * 말하는 것은 반짝이 하나만 남겼다 — 표지와, 에이전트가 한 일에 붙는 작은 표시다. ★콘솔 화면을 어둡게 만들지 않는다★ ·
 * ★글꼴은 콘솔 것 하나다★(숫자는 tabular-nums). 에이전트 화면(팀 · 담당 — 전기차 /admin/agents · 태양광 /solar/agents) 밖으로
 * 가져가지 않는다.
 */
import { sizeLabel } from '@/lib/agents/files';
import type { AgentFile } from '@/types/agents';
import { fileHref } from '@/lib/blob/path';

/** 반짝이 — 네 끝이 오목한 별. 글자(◆ ✦)는 글꼴마다 크기·자리가 달라 그림으로 둔다 */
export function Spark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M8 .5C8.6 5.2 10.8 7.4 15.5 8 10.8 8.6 8.6 10.8 8 15.5 7.4 10.8 5.2 8.6.5 8 5.2 7.4 7.4 5.2 8 .5Z"
      />
    </svg>
  );
}

/**
 * 담당 표지 — 누가 에이전트인지 한눈에. 사업 색 채움 짝(fill · on-fill — 귤색 위에는 진한 반짝이)의 납작한 칸이다. 모서리는
 * rounded-box — 표지는 누르는 것이 아니다(화면 규칙 11). ★상태는 표지에 싣지 않는다★(2026-11-05) — 모서리에 작은 등을 달았더니
 * 색이 무슨 뜻인지 읽히지 않았다(한백). 상태는 글자가 붙은 배지다(components/agents/AgentState).
 */
export function AgentMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-box bg-brand-fill text-brand-on-fill ${lg ? 'h-11 w-11' : 'h-8 w-8'}`}
    >
      <Spark className={lg ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  );
}

/** 클립 — 파일 */
export function Clip({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden className={className}>
      <path d="M13.5 7.5 8.2 12.8a3.2 3.2 0 0 1-4.5-4.5l5.6-5.6a2.1 2.1 0 0 1 3 3L6.7 11.3a1.1 1.1 0 0 1-1.5-1.5l5-5" />
    </svg>
  );
}

/** 넘긴 파일 한 장 — 누르면 새 탭에서 연다(PDF · 그림은 보이고, 나머지는 내려받는다). 각진 모양 — 누르는 것이다(규칙 11) */
export function FileChip({ file }: { file: Pick<AgentFile, 'name' | 'url' | 'size'> }) {
  return (
    <a
      href={fileHref(file.url)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 rounded-ctl border border-slate-200 bg-white px-2 py-1 text-small font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-800"
    >
      <Clip className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="min-w-0 truncate">{file.name}</span>
      <span className="shrink-0 text-tiny font-semibold tabular-nums text-slate-500">{sizeLabel(file.size)}</span>
    </a>
  );
}

/** 글 속 고리(링크) — 콘솔의 고리 모양 그대로(현장 이름 링크들과 같다) */
export const LINK = 'font-bold text-brand-800 underline decoration-brand-200 transition hover:decoration-brand-500';

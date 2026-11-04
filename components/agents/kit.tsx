/**
 * 에이전트 화면의 모양 — ★콘솔 부품(components/ui.tsx) 위에 에이전트다운 것 몇 개만 얹는다★.
 *
 * 2026-11-02 「좀 futurist 하게」로 어두운 관제 화면을 만들었다가, 같은 날 한백 「검정 배경은 지워줘. 기존 디자인컴포넌트의
 * 틀은 맞추되, AI에이전트의 느낌은 지우지마」. 그래서 판(PANEL)·단추(Btn)·꼬리표(Tag)·입력칸(FIELD)·실패 문구(Err)·글자
 * 역할(TEXT)은 ui.tsx 의 것을 그대로 쓰고 화면 규칙 열셋도 그대로다. 이 파일에는 ui.tsx 에 없는 것만 둔다:
 *   AgentMark  담당 표지 — 반짝이가 새겨진 초록 칸 + 모서리의 상태 등
 *   Spark      반짝이 하나 — 대화의 에이전트 줄 · 에이전트가 적은 할 일의 꼬리표
 *   AgentHead  구역 머리 — 구역 제목(TEXT.section) 앞에 「//」
 *   Activity   최근 이레의 활동 칸
 *   TEAM_LINE · DotGrid  팀 화면의 줄기 선 · 점 격자 바탕
 *   FileChip   넘긴 파일 한 장 — 누르면 연다
 * 에이전트 화면(팀 · 담당 — 전기차 /admin/agents · 태양광 /solar/agents) 밖으로 가져가지 않는다 — 시공 줄의 자리 정본(construction/shell.tsx)과
 * 같은 자리다. ★콘솔 화면을 어둡게 만들지 않는다★.
 *
 * ★글꼴은 콘솔 것 하나다★(한백 2026-11-02 「폰트는 기존 디자인 시스템 폰트 맞춰줘」) — 고정폭 글꼴로 시각 · 숫자를 그리던
 * 것을 걷었다. 숫자는 본문 글꼴의 자릿수 고정(tabular-nums)으로 줄을 맞춘다.
 */
import type { CSSProperties, ReactNode } from 'react';
import { TEXT } from '@/components/ui';
import { sizeLabel } from '@/lib/agents/files';
import type { AgentFile } from '@/types/agents';

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

/*
 * ── 상태 등 ── 색은 손봐야 할 것(components/agents/status ledOf), 번지는 고리는 최근 24시간에 대화가 있었다는 것.
 * 색의 뜻은 콘솔과 같다 — 빨강 막는 것 · 노랑 사람이 봐야 하는 것 · 초록 짚을 것 없음 · 회색 아직 일을 맡기지 않음.
 */
export type LedTone = 'ok' | 'warn' | 'stop' | 'idle';
const LED: Record<LedTone, string> = {
  ok: 'bg-ok-500', // 상태 초록 — 사업 색(brand)이 아니다: 태양광에서 귤색이면 「봐야 함」(노랑)과 섞인다
  warn: 'bg-amber-400',
  stop: 'bg-red-500',
  idle: 'bg-slate-300',
};

/** 담당 표지 — 누가 에이전트인지 한눈에. 등은 표지의 오른쪽 아래 모서리에 선다(사람 목록의 「접속 중」 점처럼) */
export function AgentMark({ tone, live = false, label, size = 'md' }: {
  tone: LedTone;
  live?: boolean;
  /** 등의 뜻 — 읽어 주는 말이자 마우스를 얹으면 뜨는 말 */
  label: string;
  size?: 'md' | 'lg';
}) {
  const lg = size === 'lg';
  return (
    <span role="img" aria-label={label} title={label} className={`relative inline-flex shrink-0 ${lg ? 'h-11 w-11' : 'h-8 w-8'}`}>
      <span
        aria-hidden
        className="flex h-full w-full items-center justify-center rounded-ctl bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 text-brand-on-fill shadow-[0_8px_18px_-10px_rgb(var(--brand-700)/0.9)]"
      >
        <Spark className={lg ? 'h-5 w-5' : 'h-4 w-4'} />
      </span>
      <span aria-hidden className={`absolute -bottom-1 -right-1 inline-flex ${lg ? 'h-3.5 w-3.5' : 'h-3 w-3'}`}>
        {live && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${LED[tone]}`} />}
        <span className={`relative inline-flex h-full w-full rounded-full border-2 border-white ${LED[tone]}`} />
      </span>
    </span>
  );
}

/** 구역 머리 — 구역 제목 + 그 구역의 단추(제목 바로 뒤, ui.tsx GroupHead 와 같은 자리) + 곁글(건수) */
export function AgentHead({ children, meta, action }: { children: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 className={TEXT.section}>
        <span aria-hidden className="mr-1 text-brand-400">{'//'}</span>{children}
      </h2>
      {action}
      {meta !== undefined && <span className={`${TEXT.meta} tabular-nums`}>{meta}</span>}
    </div>
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
      href={file.url}
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

/** 최근 이레의 활동 칸 — 그날 오간 말 수만큼 진하다(0 · 1~2 · 3+) */
export function Activity({ cells }: { cells: Array<{ day: string; n: number }> }) {
  const total = cells.reduce((s, c) => s + c.n, 0);
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={`최근 7일 대화 ${total}건`}>
      {cells.map((c) => (
        <span
          key={c.day}
          title={`${c.day.slice(5)} · ${c.n}건`}
          className={`h-3 w-3 rounded-[3px] ${c.n === 0 ? 'bg-slate-200' : c.n < 3 ? 'bg-brand-300' : 'bg-brand-600'}`}
        />
      ))}
    </span>
  );
}

/*
 * 팀 화면의 줄기 선 색 — 층(팀장 → 실무자)을 위에서 아래로 잇는다(components/agents/AgentsTeam). 2026-11-04 까지의 조직도
 * (가로 갈래 · 매달린 칸)는 「조직도말고 … 위에서 아래로」로 걷었다.
 */
export const TEAM_LINE = 'bg-brand-300';

/*
 * ── 점 격자 ── 팀 화면이 서는 바탕. 테두리 없이 가장자리로 갈수록 옅어진다 — 테두리를 두르면 그 안의 칸과 상자가 두 겹이
 * 된다(화면 규칙 1). 바탕만 흐리게 하려고 격자를 따로 깐다(mask 는 안의 칸까지 흐린다).
 */
const GRID: CSSProperties = {
  backgroundImage: 'radial-gradient(circle at center, rgba(100,116,139,0.32) 1px, transparent 1.5px)',
  backgroundSize: '20px 20px',
  WebkitMaskImage: 'radial-gradient(ellipse 85% 80% at 50% 40%, #000 45%, transparent 100%)',
  maskImage: 'radial-gradient(ellipse 85% 80% at 50% 40%, #000 45%, transparent 100%)',
};
export function DotGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={GRID} />
      <div className="relative">{children}</div>
    </div>
  );
}

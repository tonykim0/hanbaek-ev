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
 *   ORG_LINE · OrgNode · Twig · DotGrid  조직도의 선 · 마디 · 매달린 칸 · 점 격자 바탕
 * 이 두 화면(/admin/agents · /admin/agents/[id]) 밖으로 가져가지 않는다 — 시공 줄의 자리 정본(construction/shell.tsx)과
 * 같은 자리다. ★콘솔 화면을 어둡게 만들지 않는다★.
 *
 * ★고정폭 글꼴(font-mono)은 영문·숫자·시각에만 쓴다★ — 고정폭 글꼴에는 한글이 없어 대신 그려지는 한글이 「진 행 중」처럼
 * 벌어졌다(2026-11-02 첫 화면).
 */
import type { CSSProperties, ReactNode } from 'react';
import { TEXT } from '@/components/ui';

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
  ok: 'bg-brand-500',
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
        className="flex h-full w-full items-center justify-center rounded-ctl bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 text-white shadow-[0_8px_18px_-10px_rgba(49,106,64,0.9)]"
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
        <span aria-hidden className="mr-1 font-mono text-brand-400">{'//'}</span>{children}
      </h2>
      {action}
      {meta !== undefined && <span className={`${TEXT.meta} tabular-nums`}>{meta}</span>}
    </div>
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

/** 조직도의 선 색 — 가로선 · 세로선이 같은 것을 쓴다 */
export const ORG_LINE = 'bg-brand-300';

/** 조직도의 마디 — 선이 칸에 닿는 자리 */
export function OrgNode({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block h-2.5 w-2.5 rounded-full border-2 border-brand-400 bg-white ${className}`} />;
}

/*
 * ── 매달린 칸 ── 좁은 화면에서 조직을 세로로 펼칠 때 — 세로선(레일)에서 칸마다 가로선이 뻗고 마디에 점이 선다.
 * 마지막 칸(last)에서 레일이 끝난다. 마디의 높이(31px)는 담당 칸 첫 줄의 가운데다 — 칸 위 여백 12px + 첫 줄 38px 의 반.
 */
export function Twig({ last, children, node }: { last: boolean; children: ReactNode; node?: ReactNode }) {
  return (
    <li className="relative pl-9">
      <span aria-hidden className={`absolute left-[11.5px] top-0 w-px ${ORG_LINE} ${last ? 'h-[31px]' : 'h-full'}`} />
      <span aria-hidden className={`absolute left-[12px] top-[31px] h-px w-[22px] ${ORG_LINE}`} />
      <span className="absolute left-[12px] top-[31px] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        {node ?? <OrgNode />}
      </span>
      {children}
    </li>
  );
}

/*
 * ── 점 격자 ── 조직도가 서는 바탕. 테두리 없이 가장자리로 갈수록 옅어진다 — 테두리를 두르면 그 안의 칸과 상자가 두 겹이
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

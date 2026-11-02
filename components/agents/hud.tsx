/**
 * 에이전트 화면의 모양 — 관제 화면(HUD) (한백 지시 2026-11-02 「UI를 좀 바꿔줄래? 워크트리처럼 해서 좀 futurist 하게」).
 *
 * ★콘솔에서 이 두 화면(/admin/agents · /admin/agents/[id])만 어둡다★ — components/ui.tsx 의 부품은 밝은 바탕에 맞춘
 * 것이라(흰 단추 · 옅은 배지) 어두운 바탕에서는 이 파일의 부품을 쓴다. 시공 줄의 자리 정본(construction/shell.tsx)처럼
 * 한 화면의 정본이다 — 다른 화면에 가져가지 않는다.
 *
 * 바뀐 것은 옷뿐이다. ★색의 뜻은 콘솔과 같다★: 빨강 막는 것 · 노랑 사람이 봐야 하는 것 · 초록(한백 로고 그린) 진행·확인 ·
 * 하늘 고리(링크)·정보. 단추의 넷(do · side · quiet · undo)과 크기 둘, 활자 여덟 단계, 모서리 넷도 콘솔 것 그대로다.
 * 「워크트리처럼」은 git 그래프로 옮겼다 — 본부(main)가 줄기, 담당마다 가지(⎇ agent/…), 가지 끝의 등이 상태다.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* ── 바탕 ── 어둠 위의 격자 + 위쪽에 번지는 로고 그린 */
const DECK_BG = {
  backgroundImage: [
    'radial-gradient(ellipse 70% 45% at 10% -5%, rgba(86,167,108,0.20), transparent 62%)',
    'radial-gradient(ellipse 55% 35% at 100% 0%, rgba(34,211,238,0.08), transparent 60%)',
    'linear-gradient(rgba(148,163,184,0.055) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(148,163,184,0.055) 1px, transparent 1px)',
  ].join(','),
  backgroundSize: 'auto, auto, 28px 28px, 28px 28px',
};

/** 화면 한 장의 어두운 바탕 — 콘솔 본문 안에 선다(사이드바·상단 바는 그대로) */
export function Deck({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative rounded-panel border border-white/10 bg-[#070b10] p-4 text-slate-200 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.85)] sm:p-6"
      style={DECK_BG}
    >
      {children}
    </div>
  );
}

/** 어둠 위의 판 — 한 겹이다(화면 규칙 1). 안쪽은 선(border-white/[0.06])으로 나눈다 */
export const HUD_PANEL = 'rounded-box border border-white/10 bg-white/[0.035]';
/** 판 안을 나누는 가장 약한 선 — 테두리용과 목록 사이용(Tailwind 는 소스에 적힌 클래스만 만든다 — 글자를 이어 붙여 만들지 않는다) */
export const HUD_RULE = 'border-white/[0.07]';
export const HUD_DIVIDE = 'divide-white/[0.07]';

/*
 * ★고정폭 글꼴(font-mono)은 영문·숫자·시각에만 쓴다★ — 고정폭 글꼴에는 한글이 없어 대신 그려지는 한글이 「진 행 중」처럼
 * 벌어졌다(2026-11-02 첫 화면). 한글 이름·라벨은 본문 글꼴, 숫자만 고정폭이다.
 */

/** 갈래 제목 — 「// 업무 정의」. 곁글(건수)과 그 갈래의 단추가 같은 줄에 선다 */
export function HudLabel({ children, meta, action }: { children: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="text-small font-black text-brand-200">
        <span className="font-mono text-brand-300/70">{'// '}</span>{children}
      </h2>
      {action}
      {meta !== undefined && <span className="text-tiny font-semibold tabular-nums text-slate-400">{meta}</span>}
    </div>
  );
}

/* ── 단추 ── 콘솔과 같은 넷. do 만 빛난다(한 판에 하나) */
type HudKind = 'do' | 'side' | 'quiet' | 'undo';
const KIND: Record<HudKind, string> = {
  do: 'rounded-ctl bg-brand-400 font-bold text-[#04130a] shadow-[0_0_18px_-4px_rgba(86,167,108,0.9)] transition hover:bg-brand-300 disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none',
  side: 'rounded-ctl border border-white/15 bg-white/[0.04] font-bold text-slate-200 transition hover:border-brand-300/60 hover:text-white disabled:border-white/5 disabled:text-slate-600',
  quiet: 'rounded-ctl border border-white/10 font-bold text-slate-400 transition hover:border-brand-300/50 hover:text-brand-200 disabled:border-white/5 disabled:text-slate-600',
  undo: 'font-bold text-slate-500 underline decoration-white/20 underline-offset-2 transition hover:text-red-300 disabled:text-slate-700 disabled:no-underline',
};
const SIZE: Record<'md' | 'sm', Record<'box' | 'chip' | 'text', string>> = {
  md: { box: 'px-3.5 py-2 text-lead', chip: 'px-2.5 py-1 text-small', text: 'text-small' },
  sm: { box: 'px-2.5 py-1 text-small', chip: 'px-1.5 py-0.5 text-tiny', text: 'text-tiny' },
};

export function HudBtn({
  kind = 'do', size = 'md', busy = false, busyLabel, className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: HudKind; size?: 'md' | 'sm'; busy?: boolean; busyLabel?: string }) {
  const dim = SIZE[size][kind === 'undo' ? 'text' : kind === 'quiet' ? 'chip' : 'box'];
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} className={`${KIND[kind]} ${dim} disabled:cursor-not-allowed ${className}`}>
      {busy ? (busyLabel ?? '처리 중…') : children}
    </button>
  );
}

/* ── 꼬리표 ── 세어진 것. 각진 모양(화면 규칙 11) */
export type HudTone = 'ok' | 'warn' | 'stop' | 'info' | 'mute';
const CHIP: Record<HudTone, string> = {
  ok: 'border-brand-400/40 bg-brand-400/10 text-brand-200',
  warn: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  stop: 'border-red-400/50 bg-red-500/10 text-red-200',
  info: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  mute: 'border-white/10 bg-white/[0.04] text-slate-300',
};
export function Chip({ tone = 'mute', children }: { tone?: HudTone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-tag border px-1.5 py-0.5 text-micro font-bold ${CHIP[tone]}`}>{children}</span>;
}

/* ── 등 ── 가지 끝의 상태. 색은 손봐야 할 것, 깜빡임은 최근 24시간에 대화가 있었다는 것 */
export type LedTone = 'ok' | 'warn' | 'stop' | 'idle';
const LED: Record<LedTone, { dot: string; glow: string }> = {
  ok: { dot: 'bg-brand-300', glow: 'shadow-[0_0_10px_2px_rgba(131,197,151,0.65)]' },
  warn: { dot: 'bg-amber-300', glow: 'shadow-[0_0_10px_2px_rgba(252,211,77,0.55)]' },
  stop: { dot: 'bg-red-400', glow: 'shadow-[0_0_10px_2px_rgba(248,113,113,0.7)]' },
  idle: { dot: 'bg-slate-600', glow: '' },
};
export function Led({ tone, live = false, label }: { tone: LedTone; live?: boolean; label: string }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" role="img" aria-label={label} title={label}>
      {live && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${LED[tone].dot}`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${LED[tone].dot} ${LED[tone].glow}`} />
    </span>
  );
}

/** 가지 이름 — 워크트리의 브랜치처럼 */
export function BranchName({ id }: { id: string }) {
  return <span className="font-mono text-tiny text-brand-300/80">⎇ agent/{id}</span>;
}

/* ── 입력칸 ── 날짜·고르기 칸이 어둡게 열리도록 color-scheme 을 준다. 폭을 정하려면 _BASE 에 폭을 붙인다(ui.tsx FIELD 와 같은 함정) */
const FIELD_LOOK =
  'rounded-ctl border border-white/10 bg-black/40 px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 [color-scheme:dark] transition focus:border-brand-300/60 focus:outline-none focus:ring-2 focus:ring-brand-400/20 disabled:opacity-50';
export const HUD_FIELD = `w-full ${FIELD_LOOK}`;
export const HUD_FIELD_BASE = FIELD_LOOK;

/** 실패 문구 — 누른 단추 옆(화면 규칙 9). 어둠 위라 밝은 빨강 */
export function HudErr({ children, className = '' }: { children?: string | null; className?: string }) {
  if (!children) return null;
  return <span role="alert" className={`text-base font-bold text-red-300 ${className}`}>{children}</span>;
}

/** 고리(링크) 글자 — 하늘 */
export const HUD_LINK = 'font-semibold text-cyan-300 underline decoration-cyan-300/30 underline-offset-2 transition hover:decoration-cyan-200';

/*
 * ── 가지 ── git 그래프 · tree 명령의 ├─ └─. 줄기(세로선)에서 칸마다 가로선이 뻗고 마디에 점(또는 등)이 선다.
 * 마지막 가지(last)에서 줄기가 끝난다. 마디의 높이는 카드 첫 줄 가운데(26px)에 맞췄고, 마디는 크기와 무관하게 그 점에
 * 가운데가 오게 놓는다. 뿌리(main)의 점도 같은 세로줄(12px)에 선다.
 */
export function Twig({ last, children, node }: { last: boolean; children: ReactNode; node?: ReactNode }) {
  return (
    <li className="relative pl-9">
      <span aria-hidden className={`absolute left-[11.5px] top-0 w-px bg-brand-400/35 ${last ? 'h-[26px]' : 'h-full'}`} />
      <span aria-hidden className="absolute left-[12px] top-[26px] h-px w-[22px] bg-brand-400/35" />
      <span className="absolute left-[12px] top-[26px] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        {node ?? <span aria-hidden className="block h-[9px] w-[9px] rounded-full border border-brand-300/70 bg-[#070b10]" />}
      </span>
      {children}
    </li>
  );
}

/** 최근 이레의 활동 칸 — 그날 오간 말 수만큼 밝다(0 · 1~2 · 3+) */
export function Activity({ cells }: { cells: Array<{ day: string; n: number }> }) {
  const total = cells.reduce((s, c) => s + c.n, 0);
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={`최근 7일 대화 ${total}건`}>
      {cells.map((c) => (
        <span
          key={c.day}
          title={`${c.day.slice(5)} · ${c.n}건`}
          className={`h-3 w-3 rounded-[3px] ${
            c.n === 0 ? 'bg-white/[0.07]' : c.n < 3 ? 'bg-brand-500/60' : 'bg-brand-300 shadow-[0_0_8px_rgba(131,197,151,0.6)]'
          }`}
        />
      ))}
    </span>
  );
}

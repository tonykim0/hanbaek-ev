import { Badge, Segments, TEXT as CONSOLE, type Tone } from '@/components/ui';
import type { CheckStatus, Level } from '@/lib/solar/types';

/**
 * 부지 검토 화면의 모양 — 콘솔 부품(components/ui)을 그대로 쓰고, 콘솔에 없는 역할 몇 개만 콘솔의 글자 단계로 더한다.
 *
 * 검토 사이트(solar-site)에서 들였다(2026-11-03). 거기서는 판 · 글자 · 상태 알약 · 판정 색을 따로 골랐는데(호박색 단추 ·
 * 둥근 링 판 · 14/16px 글자), 콘솔 안에 들어오면 한 화면만 다른 옷을 입는다 — 단추는 초록 Btn, 판은 PANEL, 상태는 Badge,
 * 글자는 콘솔 단계(small 12 · base 13 · lead 14 · h3 16 · h2 18 · h1 24)로 바꿨다. 가장 옅은 글자는 콘솔처럼 slate-500.
 */
export { PANEL } from '@/components/ui';

/** 글자 역할 — 콘솔 TEXT 에 있는 것은 그것, 없는 것(장소 · 검토 항목 이름 · 큰 숫자)만 여기서 */
export const TEXT = {
  /** 장소 이름 — 결과 판의 머리 */
  place: 'text-h2 font-black text-slate-900',
  /** 판 머리 — 「검토 항목 12개」 */
  head: CONSOLE.section,
  /** 검토 항목 이름 · 검색창 이름 */
  item: 'text-lead font-bold text-slate-900',
  body: CONSOLE.body,
  /** 사실 이름 · 주소 · 검색 후보의 둘째 줄 */
  label: 'text-base text-slate-500',
  meta: CONSOLE.meta,
  /** 큰 숫자 — 설치 가능 용량 · 연 발전량 */
  num: 'text-h1 font-black tabular-nums text-slate-900',
  numLabel: CONSOLE.label,
} as const;

/**
 * 판정 → 콘솔의 말투. 색은 뜻이다(components/ui 의 Tone): 적합은 초록, 조건부는 노랑(사람이 볼 것), 부적합·불가는 빨강(막는 것).
 * 검토 사이트에서는 부적합이 주황이었다 — 콘솔에는 주황의 뜻이 없어(일곱 번째 뜻을 만들지 않는다) 빨강으로 모으고 이름으로 가른다.
 */
const LEVEL_TONE_OF: Record<Level, Tone> = { ok: 'ok', conditional: 'warn', hard: 'stop', banned: 'stop' };

/** 판정 줄의 점 · 글자색 */
export const LEVEL_TONE: Record<Level, { text: string; dot: string }> = {
  ok: { text: 'text-brand-800', dot: 'bg-brand-500' },
  conditional: { text: 'text-amber-800', dot: 'bg-amber-500' },
  hard: { text: 'text-red-700', dot: 'bg-red-600' },
  banned: { text: 'text-red-700', dot: 'bg-red-600' },
};

const STATUS: Record<CheckStatus, { label: string; tone: Tone }> = {
  ok: { label: '통과', tone: LEVEL_TONE_OF.ok },
  conditional: { label: '조건부', tone: LEVEL_TONE_OF.conditional },
  hard: { label: '미달', tone: LEVEL_TONE_OF.hard },
  banned: { label: '불가', tone: LEVEL_TONE_OF.banned },
  unknown: { label: '확인 못함', tone: 'mute' },
  skip: { label: '해당없음', tone: 'mute' },
};

/** 검토 항목의 상태 — 동글면 상태다(누르지 않는다) */
export function StatusPill({ status }: { status: CheckStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** 두 갈래 고르기 — 배치 방식 · 설치 방식. 콘솔의 갈래(Segments)에 값 ↔ 이름만 잇는다 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  const name = options.find(([v]) => v === value)?.[1] ?? '';
  return (
    <Segments
      value={name}
      options={options.map(([, text]) => ({ key: text }))}
      onPick={(text) => {
        const hit = options.find(([, t]) => t === text);
        if (hit) onChange(hit[0]);
      }}
    />
  );
}

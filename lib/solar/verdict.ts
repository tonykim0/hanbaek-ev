import { LEVELS, type Check, type Level, type Verdict } from './types';

const rank = (l: Level) => LEVELS.indexOf(l);

/** 가장 나쁜 상태 — 없으면 통과 */
export function worstLevel(levels: Iterable<Level>): Level {
  let worst: Level = 'ok';
  for (const l of levels) if (rank(l) > rank(worst)) worst = l;
  return worst;
}

/**
 * 검사들의 상태 → 종합 판정.
 *
 * 가장 나쁜 상태가 판정이다. 자료를 못 받은 검사(unknown)는 통과로 치지 않는다 —
 * 다른 것이 다 통과여도 「적합」을 줄 수 없으니 「조건부」로 내리고, 사유에 그 검사를 남긴다.
 */
export function judge(checks: Check[]): Verdict {
  const known = checks.filter(
    (c): c is Check & { status: Level } => c.status !== 'unknown' && c.status !== 'skip',
  );
  const unknown = checks.filter((c) => c.status === 'unknown');

  const level = worstLevel(known.map((c) => c.status));

  if (level === 'ok' && unknown.length > 0) {
    return { level: 'conditional', because: unknown, unknown };
  }
  const because = level === 'ok' ? [] : known.filter((c) => c.status === level);
  return { level, because, unknown };
}

export const LEVEL_LABEL: Record<Level, string> = {
  ok: '적합',
  conditional: '조건부 적합',
  hard: '부적합',
  banned: '설치 불가',
};

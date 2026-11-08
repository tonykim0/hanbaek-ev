/**
 * VWorld 의 속성 읽기 — 속성 이름이 문서와 다르게 오기도 하고(대소문자 · 밑줄) 빈 칸을 「」로 준다. [순수]
 */

/** 속성 이름이 문서에 없어 후보 중 처음 있는 것을 쓴다(대소문자 무시). */
export function pick(props: Record<string, unknown>, ...names: string[]): unknown {
  const lower = Object.fromEntries(Object.entries(props).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
/** VWorld 는 빈 칸을 「」로 준다 — 없는 값으로 본다(Number('') 는 0 이라 면적 0 으로 셈해졌다). */
export const blank = (v: unknown) => v === undefined || v === null || v === '';
export const str = (v: unknown) => (blank(v) ? null : String(v));
export const num = (v: unknown) => {
  if (blank(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

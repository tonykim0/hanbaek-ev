/**
 * 실사보고서 화면들이 같이 쓰는 작은 것 — 오늘 날짜 · 거점 id · 숫자 칸 읽기. [순수]
 */

/** 오늘(YYYY-MM-DD, 이 기기의 날짜) — 조사일 기본값 */
export const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

let seq = 0;
/** 거점 id — 화면 안에서만 겹치지 않으면 된다 */
export const nextId = () => `s${Date.now().toString(36)}${(seq += 1)}`;

/**
 * 숫자 칸의 글 → 정수. 비우면 null. 숫자 아닌 글자는 버린다(「30m」→30) — ★소수점 뒤는 버린다★: 붙여 넣은
 * 「12.5」가 점만 빠져 125 가 되던 것을 막는다. 칸은 정수만 받는다(대수·m — 제출본에 소수가 없다).
 */
export function num(v: string): number | null {
  const whole = v.split('.')[0].replace(/\D/g, '');
  return whole === '' ? null : Number(whole);
}

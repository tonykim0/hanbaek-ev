/** 화면 주소의 ?이름= 값 하나 — 같은 이름이 여럿이면 첫째, 없으면 빈 글자. 페이지의 searchParams 를 읽을 때 [순수] */
export const firstParam = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

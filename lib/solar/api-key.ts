/**
 * 태양광의 API 키 — Anthropic 콘솔의 키 「hanbaek-solar」(2026-11-04 한백). 전기차 판독과 키를 갈라야 콘솔 사용량에서 태양광 몫이
 * 따로 보인다(키 하나를 같이 쓰던 때 어디서 쓴 돈인지 가릴 수 없었다). 아직 안 넣은 환경에서는 공용 키로 돈다.
 *
 * 쓰는 곳: AI 지붕 찾기(lib/solar/roof-trace) · 태양광 AI에이전트(lib/agents/brain — 같은 날 「태양광전용으로 하나 · 기존 전기차
 * AI에이전트에 붙이지 말고」). 무거운 지붕 찾기 모듈을 에이전트가 끌어오지 않게 키만 따로 둔다.
 */
export const solarApiKey = (): string | undefined =>
  process.env.ANTHROPIC_SOLAR_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY;

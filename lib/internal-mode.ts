/**
 * 담당자 전용 기능 노출 스위치 — 상수와 링크 헬퍼.
 *
 * 계약서 작성 페이지(/contracts/hec 등)에 협력사 스캔본 판독 같은 재발행 도구를 상시
 * 노출하지 않고, 주소에 ?import=1 이 붙었을 때만 띄웁니다 (진입점은 /reissue).
 *
 * 접근 차단이 아니라 화면 분리입니다. 문은 따로 있다 — 페이지는 콘솔 로그인 안이고
 * (2026-10-01 포털을 닫으며 들였다), 판독 비용이 나가는 /api/import-form 도 세션을 본다.
 *
 * 이 파일에는 'use client'를 두지 않습니다 — /reissue(서버 컴포넌트)가
 * internalModeHref 를 쓰기 때문입니다. 클라이언트 훅은 use-internal-mode.ts 에 있습니다.
 */

export const INTERNAL_MODE_PARAM = 'import';

/** 담당자 모드 링크 (예: internalModeHref('/contracts/hec') → '/contracts/hec?import=1') */
export function internalModeHref(path: string): string {
  return `${path}?${INTERNAL_MODE_PARAM}=1`;
}

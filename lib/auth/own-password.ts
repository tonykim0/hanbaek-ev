/**
 * 내 비밀번호 바꾸기 — 규칙과 「바꾸기 전에 발급한 로그인인가」. 순수 모듈이라 화면 · 라우트 · 시험이 같이 본다.
 *
 * 한백 2026-11-23 「각 계정에서 자기 비밀번호 재설정 할 수 있도록 해줘」 — 그전에는 한백이 계정설정의 「비밀번호 재설정」으로
 * 새로 정해 전화로 알려 주는 길뿐이었다. 이제 계정마다(협력사 · 열람 전용 · 한백 관리자) 「비밀번호 변경」(/account/password)에서
 * 지금 비밀번호를 대고 새로 정한다. 잊은 비밀번호는 여전히 한백의 재설정이다 — 지금 비밀번호를 모르면 여기서 못 바꾼다.
 */
import { PASSWORD_MIN_LEN } from './types';

/** 위로는 이만큼 — 해시는 길이와 상관없지만 붙여 넣기 사고(문서 통째)를 막는다 */
export const PASSWORD_MAX_LEN = 72;

/**
 * 못 바꾸는 까닭 — 단추 이름으로 쓴다(화면 규칙 3). 서버도 같은 판정이다.
 * 길이 아래 끝은 계정을 만들 때 · 한백이 재설정할 때와 같은 PASSWORD_MIN_LEN(4 — 전화로 알려 주는 값이라 한백이 내렸다).
 * 셋이 갈리면 「만들 때는 되는데 바꿀 때는 안 되는」 값이 생긴다.
 * @param again 새 비밀번호 확인 칸 — 화면만 준다(서버는 이미 같은지 본 값을 받는다)
 */
export function ownPasswordBlocker(
  { current, next, loginId, again }: { current: string; next: string; loginId: string; again?: string }
): string | null {
  if (!current) return '현재 비밀번호 미입력 — 변경 불가';
  if (!next) return '새 비밀번호 미입력 — 변경 불가';
  if (next.length < PASSWORD_MIN_LEN) return `새 비밀번호 ${PASSWORD_MIN_LEN}자 미만 — 변경 불가`;
  if (next.length > PASSWORD_MAX_LEN) return `새 비밀번호 ${PASSWORD_MAX_LEN}자 초과 — 변경 불가`;
  if (next === current) return '지금과 같은 비밀번호 — 변경 불가';
  if (loginId && next.toLowerCase() === loginId.trim().toLowerCase()) return '아이디와 같은 비밀번호 — 변경 불가';
  if (again !== undefined) {
    if (!again) return '새 비밀번호 확인 미입력 — 변경 불가';
    if (again !== next) return '새 비밀번호 확인이 다름 — 변경 불가';
  }
  return null;
}

/**
 * 이 로그인 쿠키가 비밀번호를 바꾸기 전에 발급된 것인가 — 그렇다면 받지 않는다(다른 기기까지 풀린다 · migrations/0138).
 *
 * 쿠키의 발급 시각은 초 단위라 바꾼 시각도 초로 내려 견준다 — 바꾼 그 기기가 같은 초에 받은 새 쿠키를 막지 않게.
 * 같은 초 안에 먼저 발급된 다른 쿠키가 하나 남을 수 있는데, 그 1초를 위해 바꾼 기기를 내보내는 쪽이 더 나쁘다.
 * @param issuedAtSec 쿠키의 발급 시각(epoch 초)
 * @param changedAt 비밀번호를 바꾼 시각 — 없으면 막는 쿠키가 없다
 */
export function staleSession(issuedAtSec: number, changedAt: Date | null | undefined): boolean {
  if (!changedAt) return false;
  return issuedAtSec < Math.floor(changedAt.getTime() / 1000);
}

/**
 * 쓰기 라우트의 오류 두 종류 — 순수 모듈이다(Next·React 를 끌어오지 않는다, 그래서 시험할 수 있다).
 *
 *   BadRequest          값이 틀렸다 → 400. 「구분이 셋 중 하나가 아니다」처럼 보낸 값의 문제.
 *   (맨 Error)          규칙에 걸렸다 → 422. 저장소가 한글 메시지로 던진다 — 「관리자 계정은 여기서 못 바꾼다」.
 *   isUnexpectedError   그 밖의 것 → 500. 우리 잘못이거나 바깥이 죽은 것이다.
 *
 * 셋을 가르는 이유: 화면(lib/use-action.ts)은 `{ error }` 하나만 보고 문구를 띄운다. 400 과 422 를
 * 섞으면 「다시 입력하세요」와 「할 수 없는 일입니다」를 구분해 말할 수 없고, 500 을 422 로 답하면
 * 협력사 화면에 드라이버 메시지(호스트·표 이름)가 그대로 나가고 로그에는 아무 줄도 안 남아 아무도
 * 모른다 — 실제로 그렇게 삼켜지고 있었다(하네스 4번, 2026-09-09).
 */
import { DrizzleQueryError } from 'drizzle-orm/errors';

export class BadRequest extends Error {}

/**
 * 예상 밖 오류인가.
 * DB 드라이버·드리즐 오류(code 가 있다) · 코드 결함(TypeError 류) · Error 도 아닌 것.
 * 저장소가 던지는 맨 Error(규칙 위반)는 아니다.
 */
export function isUnexpectedError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  if (err instanceof BadRequest) return false;
  if (err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError) return true;
  if (err instanceof DrizzleQueryError || err.name === 'PostgresError') return true;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0;   // ECONNREFUSED · ETIMEDOUT · 08006 …
}

/** 500 의 본문 — 원인은 로그([api])에만 남긴다 */
export const SERVER_ERROR_MESSAGE = '서버에 문제가 생겼습니다 — 잠시 뒤 다시 시도하고, 계속되면 한백에 알려주세요.';

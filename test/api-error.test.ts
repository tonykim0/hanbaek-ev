/**
 * 쓰기 라우트 껍데기의 오류 분류 — 무엇이 422(규칙)고 무엇이 500(예상 밖)인가.
 *
 * 하네스 4번(2026-09-09): 예상 밖 오류가 422 로 조용히 삼켜지고 있었다. 이 판정이 틀리면 두 방향으로
 * 잘못된다 — 규칙 위반을 500 으로 답하면 화면이 「다시 입력」을 못 말하고, 드라이버 오류를 422 로 답하면
 * 협력사에게 드라이버 메시지가 나가고 로그에 아무것도 안 남는다.
 */
import { describe, expect, it } from 'vitest';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { BadRequest, isUnexpectedError } from '@/lib/api/errors';

describe('isUnexpectedError', () => {
  it('저장소가 던지는 규칙 위반(맨 Error, 한글 메시지)은 예상한 것이다 → 422', () => {
    expect(isUnexpectedError(new Error('현장 삭제는 한백 관리자만 할 수 있습니다.'))).toBe(false);
  });
  it('값이 틀린 것(BadRequest)도 예상한 것이다 → 400', () => {
    expect(isUnexpectedError(new BadRequest('날짜 꼴'))).toBe(false);
  });
  it('코드 결함은 예상 밖이다', () => {
    expect(isUnexpectedError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(true);
    expect(isUnexpectedError(new ReferenceError('x is not defined'))).toBe(true);
    expect(isUnexpectedError(new RangeError('Invalid array length'))).toBe(true);
  });
  it('DB 드라이버·드리즐 오류는 예상 밖이다', () => {
    const pg = Object.assign(new Error('connection to server failed'), { name: 'PostgresError', code: '08006' });
    expect(isUnexpectedError(pg)).toBe(true);
    expect(isUnexpectedError(new DrizzleQueryError('select 1', [], new Error('x')))).toBe(true);
    expect(isUnexpectedError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBe(true);
  });
  it('Error 가 아닌 것을 던졌으면 예상 밖이다', () => {
    expect(isUnexpectedError('문자열')).toBe(true);
    expect(isUnexpectedError(undefined)).toBe(true);
  });
  it('code 가 빈 문자열이거나 문자열이 아니면 규칙 위반으로 본다', () => {
    expect(isUnexpectedError(Object.assign(new Error('규칙'), { code: '' }))).toBe(false);
    expect(isUnexpectedError(Object.assign(new Error('규칙'), { code: 7 }))).toBe(false);
  });
});

/** 바깥 자료의 시간 초과 한 번 더(lib/solar/sources/http onceMoreOnTimeout) — 한전이 한 번 10초 안에 답하지 않아 제안서의 한전 표가 빠졌다 */
import { describe, expect, it } from 'vitest';
import { onceMoreOnTimeout, SourceError } from '@/lib/solar/sources/http';

const timeout = () => new SourceError('한전', '응답 없음 (10초)', undefined, true);

describe('onceMoreOnTimeout', () => {
  it('시간 초과 뒤 두 번째에 답하면 그 답', async () => {
    let calls = 0;
    const r = await onceMoreOnTimeout(async () => {
      if (++calls === 1) throw timeout();
      return 'rows';
    }, 0);
    expect(r).toBe('rows');
    expect(calls).toBe(2);
  });

  it('두 번 다 시간 초과면 그 실패를 던진다 — 세 번은 묻지 않는다', async () => {
    let calls = 0;
    await expect(
      onceMoreOnTimeout(async () => {
        calls++;
        throw timeout();
      }, 0),
    ).rejects.toThrow('[한전] 응답 없음 (10초)');
    expect(calls).toBe(2);
  });

  it('시간 초과가 아닌 실패(키 없음 · HTTP 500)는 다시 묻지 않는다', async () => {
    for (const err of [new Error('[한전] KEPCO_KEY 없음'), new SourceError('한전', 'HTTP 500', 500)]) {
      let calls = 0;
      await expect(
        onceMoreOnTimeout(async () => {
          calls++;
          throw err;
        }, 0),
      ).rejects.toBe(err);
      expect(calls).toBe(1);
    }
  });
});

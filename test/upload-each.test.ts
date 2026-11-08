/** 여러 장 올리기(lib/upload-each) — 차례로 · 실패해도 나머지 · 까닭을 모은다 */
import { describe, expect, it } from 'vitest';
import { uploadEach } from '@/lib/upload-each';

describe('uploadEach', () => {
  it('차례로 올리고 진행을 i/n · % 로 알린다 — 실패한 장은 까닭만 남기고 나머지를 이어 간다', async () => {
    const seen: string[] = [];
    const order: string[] = [];
    const r = await uploadEach(
      [{ name: 'a.pdf' }, { name: 'b.pdf' }, { name: 'c.pdf' }],
      async (f, onPct) => {
        order.push(f.name);
        onPct(50);
        if (f.name === 'b.pdf') throw new Error('b.pdf — 100MB 까지입니다.');
        return f.name.toUpperCase();
      },
      (i, n, pct) => seen.push(`${i + 1}/${n} ${pct}`),
    );
    expect(order).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(seen).toEqual(['1/3 50', '2/3 50', '3/3 50']);
    expect(r).toEqual({ ok: ['A.PDF', 'C.PDF'], failed: ['b.pdf — 100MB 까지입니다.'] });
  });
  it('Error 가 아닌 것을 던지면 「이름 — 올리지 못했습니다」', async () => {
    const r = await uploadEach([{ name: 'x.hwp' }], () => Promise.reject('?'), () => {});
    expect(r.failed).toEqual(['x.hwp — 올리지 못했습니다']);
  });
});

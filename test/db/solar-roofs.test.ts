/**
 * AI 지붕 따기의 저장(migrations/0127 · app/api/solar/roofs) — 같은 필지는 다시 부르지 않고, 서버가 새로 떠도 그대로, 동시에 두 번이면
 * 한 번, 실패도 한 번으로 세고, 계정마다 하루 20번. AI 와 VWorld 는 흉내 낸다(돈 · 바깥 한도). 시험 필지는 99 로 시작한다(실제 시도 코드에 없다).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { solarRoofTraces } from '@/lib/db/schema';
import { signIn, USERS } from './kit';

const ai = vi.hoisted(() => ({ calls: 0, delay: 0, fail: false }));
vi.mock('@/lib/solar/roof-trace', () => ({
  traceRoofs: vi.fn(async () => {
    ai.calls++;
    if (ai.delay) await new Promise((r) => setTimeout(r, ai.delay));
    if (ai.fail) throw new Error('[AI] 응답 거절 (시험)');
    return {
      roofs: [{ polygons: [], kind: '판넬·금속', note: '시험 지붕', area: 120 }],
      obstacles: [],
      meta: { model: 'm', servedBy: 'm', z: 19, metersPerPx: 0.24, width: 10, height: 10, inputTokens: 1, outputTokens: 1, ms: 9000 },
    };
  }),
}));
vi.mock('@/lib/solar/sources/vworld', async (orig) => ({
  ...(await orig<typeof import('@/lib/solar/sources/vworld')>()),
  hasVworld: () => true,
  parcelByPnu: vi.fn(async () => ({ properties: {}, polygons: [] })),
}));
vi.mock('@/lib/solar/api-key', () => ({ solarApiKey: () => 'test-key' }));

let seq = 0;
/** 이 시험만의 필지번호 — 99 + 시각 13자리 + 차례 4자리 = 19자리 */
const pnuOf = () => `99${String(Date.now()).slice(-13)}${String(++seq).padStart(4, '0')}`;
const ask = async (pnu: string) => {
  const { GET } = await import('@/app/api/solar/roofs/route');
  const res = await GET(new Request(`http://test.local/api/solar/roofs?pnu=${pnu}`));
  return { status: res.status, body: (await res.json()) as { roofs?: unknown[]; cached?: boolean; error?: string } };
};
const rowsOf = (pnu: string) => getDb().select().from(solarRoofTraces).where(eq(solarRoofTraces.pnu, pnu));

beforeEach(() => {
  ai.calls = 0;
  ai.delay = 0;
  ai.fail = false;
});
afterAll(async () => {
  await getDb().delete(solarRoofTraces).where(like(solarRoofTraces.pnu, '99%'));
});

describe('AI 지붕 따기 — 결과를 DB 에', () => {
  it('태양광을 안 보는 계정은 403', async () => {
    await signIn(USERS.navy);
    expect((await ask(pnuOf())).status).toBe(403);
  });

  it('같은 필지는 두 번째부터 저장해 둔 결과 — 서버가 새로 떠도(모듈을 다시 읽어도) AI 를 다시 안 부른다', async () => {
    await signIn(USERS.admin);
    const pnu = pnuOf();
    const first = await ask(pnu);
    expect(first.status).toBe(200);
    expect(first.body.cached).toBeUndefined();
    expect(first.body.roofs).toHaveLength(1);
    const again = await ask(pnu);
    expect(again.body.cached).toBe(true);
    vi.resetModules();
    const fresh = await ask(pnu);
    expect(fresh.body).toMatchObject({ cached: true, roofs: [{ note: '시험 지붕' }] });
    expect(ai.calls).toBe(1);
    expect(await rowsOf(pnu)).toHaveLength(1);
  });

  it('여러 필지를 한 부지로 — 필지들의 도형을 한 번에 따고, 넣은 차례가 달라도 같은 부지는 저장해 둔 결과', async () => {
    await signIn(USERS.admin);
    const { traceRoofs } = await import('@/lib/solar/roof-trace');
    const [a, b] = [pnuOf(), pnuOf()];
    const first = await ask(`${b},${a}`);
    expect(first.status).toBe(200);
    expect(vi.mocked(traceRoofs).mock.lastCall?.[1]).toBe(2);
    const again = await ask(`${a},${b}`);
    expect(again.body.cached).toBe(true);
    expect(ai.calls).toBe(1);
    expect(await rowsOf(`${a},${b}`)).toHaveLength(1);
    // 한 필지만은 다른 부지다
    expect((await ask(a)).body.cached).toBeUndefined();
    expect((await ask(`${a},123`)).status).toBe(400);
  });

  it('같은 필지를 동시에 두 번 — AI 는 한 번, 둘 다 같은 결과', async () => {
    await signIn(USERS.admin);
    const pnu = pnuOf();
    ai.delay = 300;
    const [a, b] = await Promise.all([ask(pnu), ask(pnu)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.cached, b.body.cached].filter(Boolean)).toHaveLength(1);
    expect(ai.calls).toBe(1);
    expect(await rowsOf(pnu)).toHaveLength(1);
  });

  it('AI 가 실패하면 502 — 그 한 번도 한도에 세고, 저장된 결과가 없으니 다음에 다시 부른다', async () => {
    await signIn(USERS.admin);
    const pnu = pnuOf();
    ai.fail = true;
    const bad = await ask(pnu);
    expect(bad.status).toBe(502);
    expect(bad.body.error).toBe('지붕을 찾지 못했습니다 — [AI] 응답 거절 (시험)');
    expect(await getDb().select().from(solarRoofTraces).where(and(eq(solarRoofTraces.pnu, pnu), isNull(solarRoofTraces.trace)))).toHaveLength(1);
    ai.fail = false;
    expect((await ask(pnu)).status).toBe(200);
    expect(ai.calls).toBe(2);
  });

  it('계정마다 오늘(한국 날짜) 20번 — 넘으면 429, AI 는 안 부르고 줄도 안 늘린다', async () => {
    await signIn(USERS.viewer);
    await getDb()
      .insert(solarRoofTraces)
      .values(Array.from({ length: 20 }, () => ({ id: randomUUID(), pnu: pnuOf(), userId: USERS.viewer.id })));
    const pnu = pnuOf();
    const r = await ask(pnu);
    expect(r).toEqual({ status: 429, body: { error: '오늘 AI로 패널배치하기를 20번 다 썼습니다.' } });
    expect(ai.calls).toBe(0);
    expect(await rowsOf(pnu)).toHaveLength(0);
  });
});

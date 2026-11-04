/**
 * 크론 문(app/api/cron/agents) — CRON_SECRET 으로만 열리고, 값이 없으면 소리 나게 멈춘다. 정기 일 자체는 흉내 낸다(DB 를 안 건드린다 —
 * 실제로 남기는 것은 test/db/agent-remind 가 본다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const run = vi.hoisted(() => vi.fn(async () => ({ day: '2026-11-05', due: ['2026-11-10'], reminded: ['2026-11-10'] })));
vi.mock('@/lib/agents/remind-run', () => ({ runAgentReminders: run }));

import { GET } from '@/app/api/cron/agents/route';

const get = (auth?: string) => GET(new Request('http://test.local/api/cron/agents', auth ? { headers: { authorization: auth } } : {}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  run.mockClear();
});

describe('크론 — 에이전트의 정기 일', () => {
  it('CRON_SECRET 이 없으면 [cron] 을 남기고 500 — 조용히 안 도는 일이 없게', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await get('Bearer anything');
    expect(res.status).toBe(500);
    expect(said.mock.calls[0]?.[0]).toBe('[cron] CRON_SECRET 없음 — 에이전트 정기 알림이 돌지 않는다');
    expect(run).not.toHaveBeenCalled();
  });

  it('값이 다르거나 없으면 401 — 돌지 않는다', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-for-test-0123456789');
    expect((await get()).status).toBe(401);
    expect((await get('Bearer wrong')).status).toBe(401);
    expect((await get('secret-for-test-0123456789')).status).toBe(401); // Bearer 없이
    expect(run).not.toHaveBeenCalled();
  });

  it('Vercel 이 실어 보낸 값이면 돈다', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-for-test-0123456789');
    const res = await get('Bearer secret-for-test-0123456789');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, day: '2026-11-05', due: ['2026-11-10'], reminded: ['2026-11-10'] });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('정기 일이 깨지면 [cron] 을 남기고 500', async () => {
    vi.stubEnv('CRON_SECRET', 'secret-for-test-0123456789');
    run.mockRejectedValueOnce(new Error('db down'));
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await get('Bearer secret-for-test-0123456789');
    expect(res.status).toBe(500);
    expect(said.mock.calls[0]?.[0]).toBe('[cron] agents');
  });
});

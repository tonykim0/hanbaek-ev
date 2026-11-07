/**
 * 에이전트 답은 담당마다 한 번에 하나 (migrations/0125 · store/agent-memory claimAgentReply · /api/agents/[id]/reply).
 *
 * 2026-11-05 루모라 담당에게 「답」이 7.5초 간격으로 두 번 들어와 둘 다 모델을 불렀다 — 같은 지시에 답이 둘 서고 그 한 답에 $1.49.
 * 여기서는 모델을 부르지 않는다: 표지가 잡힌 담당의 /reply 는 대화를 읽기도 전에 「이미 답하는 중」으로 멈춰야 하고, 문이 빠지면 같은
 * 자리에서 「답할 지시가 없습니다」가 나와(이 담당에게 기다리는 지시가 없다) 시험이 빨개진다 — 어느 쪽이든 돈이 드는 길까지 가지 않는다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { POST as postReply } from '@/app/api/agents/[id]/reply/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agents } from '@/lib/db/schema';
import { REPLY_CLAIM_SECONDS } from '@/lib/agents/memory';
import { USERS, actorOf, call, signIn } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const AGENT = 'op-everon';
const params = { id: AGENT };
const held = async () => (await getDb().select({ at: agents.replyingAt }).from(agents).where(eq(agents.id, AGENT)))[0]?.at ?? null;
const clear = () => getDb().update(agents).set({ replyingAt: null }).where(eq(agents.id, AGENT));

afterAll(clear);

describe('에이전트 답 — 담당마다 한 번에 하나', () => {
  it('한 번 잡으면 놓기 전에는 못 잡는다 · 남의 표지로는 못 놓는다', async () => {
    await clear();
    const first = await repo.claimAgentReply(AGENT, admin);
    expect(first).toBeTruthy();
    expect(await repo.claimAgentReply(AGENT, admin)).toBeNull();
    await repo.releaseAgentReply(AGENT, new Date(Date.now() - 60_000).toISOString(), admin);
    expect(await held()).not.toBeNull();
    await repo.releaseAgentReply(AGENT, first!, admin);
    expect(await held()).toBeNull();
    const again = await repo.claimAgentReply(AGENT, admin);
    expect(again).toBeTruthy();
    await repo.releaseAgentReply(AGENT, again!, admin);
  });

  it('동시에 둘이 잡으면 하나만 잡는다', async () => {
    await clear();
    const got = await Promise.all([repo.claimAgentReply(AGENT, admin), repo.claimAgentReply(AGENT, admin)]);
    expect(got.filter(Boolean)).toHaveLength(1);
    await repo.releaseAgentReply(AGENT, got.find(Boolean)!, admin);
  });

  it('시한에 끊겨 못 놓은 표지는 수명이 지나면 다음 요청이 가져간다', async () => {
    await getDb().update(agents)
      .set({ replyingAt: sql`now() - make_interval(secs => ${REPLY_CLAIM_SECONDS + 10})` })
      .where(eq(agents.id, AGENT));
    const got = await repo.claimAgentReply(AGENT, admin);
    expect(got).toBeTruthy();
    await repo.releaseAgentReply(AGENT, got!, admin);
  });

  it('열람 전용은 못 잡는다', async () => {
    await expect(repo.claimAgentReply(AGENT, actorOf(USERS.viewer))).rejects.toThrow();
  });

  it('답하는 중인 담당의 /reply 는 대화를 읽기 전에 멈추고, 표지를 건드리지 않는다', async () => {
    await clear();
    await signIn(USERS.admin);
    const claim = await repo.claimAgentReply(AGENT, admin);
    const r = await call(postReply, { params });
    expect(r.status).toBe(422);
    expect(r.json?.error).toContain('이미 답하는 중');
    expect((await held())?.toISOString()).toBe(claim);
    await repo.releaseAgentReply(AGENT, claim!, admin);
  });

  it('/reply 가 잡은 표지는 실패해도 놓는다', async () => {
    await clear();
    await signIn(USERS.admin);
    const r = await call(postReply, { params });
    expect(r.status).toBe(422);
    expect(r.json?.error).toContain('답할 지시가 없습니다');
    expect(await held()).toBeNull();
  });
});

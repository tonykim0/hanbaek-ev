/**
 * 에이전트의 문 — 업무 정의 · 할 일 · 대화는 한백 관리자만 (store/agents · app/api/agents).
 *
 * 화면은 (write) 안이라 관리자만 들어오지만, 라우트와 저장소가 각자 한 번 더 막는다(write-route adminWrite ·
 * assertAdmin). 협력사와 열람 전용은 403 이다. 에이전트를 실제로 부르는 /reply 는 돈이 드는 길이라 여기서는 문만 본다 —
 * 답할 지시가 없으면 부르기 전에 거절한다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { POST as postDuty } from '@/app/api/agents/[id]/duties/route';
import { DELETE as deleteDuty } from '@/app/api/agents/[id]/duties/[dutyId]/route';
import { POST as postTask } from '@/app/api/agents/[id]/tasks/route';
import { DELETE as deleteTask, PATCH as patchTask } from '@/app/api/agents/[id]/tasks/[taskId]/route';
import { POST as postMessage } from '@/app/api/agents/[id]/messages/route';
import { POST as postReply } from '@/app/api/agents/[id]/reply/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentDuties, agentMessages, agentTasks } from '@/lib/db/schema';
import { RUN, USERS, actorOf, call, signIn } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const AGENT = 'op-sk';
const params = { id: AGENT };
const mark = `[시험 ${RUN}]`;

afterAll(async () => {
  const db = getDb();
  await db.delete(agentMessages).where(like(agentMessages.body, `%${RUN}%`));
  await db.delete(agentTasks).where(like(agentTasks.title, `%${RUN}%`));
  await db.delete(agentDuties).where(like(agentDuties.title, `%${RUN}%`));
});

describe('에이전트 — 누가 쓰나', () => {
  it('협력사 · 열람 전용은 403', async () => {
    for (const u of [USERS.ecoelec, USERS.viewer]) {
      await signIn(u);
      expect((await call(postDuty, { body: { title: `${mark} 업무` }, params })).status, u.id).toBe(403);
      expect((await call(postTask, { body: { title: `${mark} 할 일` }, params })).status, u.id).toBe(403);
      expect((await call(postMessage, { body: { body: `${mark} 말` }, params })).status, u.id).toBe(403);
    }
  });

  it('저장소도 관리자만 — 라우트를 거치지 않는 길의 문', async () => {
    await expect(repo.listAgents(actorOf(USERS.ecoelec))).rejects.toThrow('한백 관리자만');
    await expect(repo.addAgentTask({ agentId: AGENT, title: `${mark} x` }, actorOf(USERS.viewer))).rejects.toThrow('한백 관리자만');
  });

  it('없는 담당은 422', async () => {
    await signIn(USERS.admin);
    const r = await call(postTask, { body: { title: `${mark} 할 일` }, params: { id: 'no-such-agent' } });
    expect(r.status).toBe(422);
    expect(r.json?.error).toBe('담당을 찾을 수 없습니다.');
  });
});

describe('업무 정의', () => {
  it('넣고 · 고치고 · 지운다', async () => {
    await signIn(USERS.admin);
    const made = await call(postDuty, { body: { title: `${mark} 견적 회신 확인`, body: '매주 월요일' }, params });
    expect(made.status).toBe(200);
    const id = made.json?.id as string;

    const fixed = await call(postDuty, { body: { id, title: `${mark} 견적 회신 확인`, body: '매주 월요일 · 목요일' }, params });
    expect(fixed.status).toBe(200);
    const after = (await repo.getAgent(AGENT, admin)).duties.find((d) => d.id === id);
    expect(after?.body).toBe('매주 월요일 · 목요일');
    expect(after?.updatedAt).not.toBeNull();

    expect((await call(deleteDuty, { method: 'DELETE', params: { id: AGENT, dutyId: id } })).status).toBe(200);
    expect((await repo.getAgent(AGENT, admin)).duties.some((d) => d.id === id)).toBe(false);
  });

  it('이름 없는 정의는 422 · 글이 아닌 값은 400', async () => {
    await signIn(USERS.admin);
    expect((await call(postDuty, { body: { title: '   ' }, params })).status).toBe(422);
    expect((await call(postDuty, { body: { title: 3 }, params })).status).toBe(400);
  });
});

describe('할 일', () => {
  it('적고 · 끝내고 · 되살리고 · 지운다 — 끝낸 것을 또 끝내도 그대로다', async () => {
    await signIn(USERS.admin);
    const made = await call(postTask, { body: { title: `${mark} SK 김과장 회신 받기`, due: '2026-11-07' }, params });
    expect(made.status).toBe(200);
    const id = made.json?.id as string;
    const taskParams = { id: AGENT, taskId: id };

    expect((await call(patchTask, { method: 'PATCH', body: { done: true }, params: taskParams })).status).toBe(200);
    expect((await call(patchTask, { method: 'PATCH', body: { done: true }, params: taskParams })).status).toBe(200);
    let t = (await repo.getAgent(AGENT, admin)).tasks.find((x) => x.id === id);
    expect(t?.doneAt).not.toBeNull();

    expect((await call(patchTask, { method: 'PATCH', body: { done: false }, params: taskParams })).status).toBe(200);
    t = (await repo.getAgent(AGENT, admin)).tasks.find((x) => x.id === id);
    expect(t?.doneAt).toBeNull();

    expect((await call(deleteTask, { method: 'DELETE', params: taskParams })).status).toBe(200);
    expect((await repo.getAgent(AGENT, admin)).tasks.some((x) => x.id === id)).toBe(false);
  });

  it('기한 모양이 틀리면 422 · done 이 없으면 400', async () => {
    await signIn(USERS.admin);
    expect((await call(postTask, { body: { title: `${mark} x`, due: '11월 7일' }, params })).status).toBe(422);
    expect((await call(patchTask, { method: 'PATCH', body: {}, params: { id: AGENT, taskId: 'x' } })).status).toBe(400);
  });

  it('에이전트가 적은 할 일은 적은 쪽에 에이전트 이름이 선다', async () => {
    const { id } = await repo.addAgentTask({ agentId: AGENT, title: `${mark} 대기번호 회신 확인`, byAgent: true }, admin);
    const t = (await repo.getAgent(AGENT, admin)).tasks.find((x) => x.id === id);
    expect(t?.author).toBe('SK일렉링크 담당');
    expect(t?.byAgent).toBe(true);
  });
});

describe('대화', () => {
  it('기록만 남기면 에이전트를 부르지 않는다 — 답할 지시가 없어 /reply 는 부르기 전에 거절', async () => {
    await signIn(USERS.admin);
    const r = await call(postMessage, { body: { body: `${mark} SK 김과장 통화 — 견적 금요일 회신`, note: true }, params });
    expect(r.status).toBe(200);
    expect((r.json?.message as { role: string }).role).toBe('note');

    const reply = await call(postReply, { params });
    expect(reply.status).toBe(422);
    expect(reply.json?.error).toContain('답할 지시가 없습니다');

    // 현황의 활동 칸 — 이레, 오늘 칸에 방금 남긴 기록이 든다(한국 달력)
    const sk = (await repo.listAgents(admin)).find((a) => a.id === AGENT);
    expect(sk?.activity).toHaveLength(7);
    expect(sk?.activity[6].n).toBeGreaterThanOrEqual(1);
    expect(sk?.last?.role).toBe('note');
    expect(typeof sk?.usdToday).toBe('number');
  });

  it('빈 말은 400', async () => {
    await signIn(USERS.admin);
    expect((await call(postMessage, { body: { body: '  ' }, params })).status).toBe(400);
  });
});

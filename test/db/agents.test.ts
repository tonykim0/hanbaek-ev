/**
 * 에이전트의 문 — 업무 정의 · 할 일 · 대화는 한백 관리자만 (store/agents · app/api/agents).
 *
 * 화면은 (write) 안이라 관리자만 들어오지만, 라우트와 저장소가 각자 한 번 더 막는다(write-route adminWrite ·
 * assertAdmin). 협력사와 열람 전용은 403 이다. 에이전트를 실제로 부르는 /reply 는 돈이 드는 길이라 여기서는 문만 본다 —
 * 답할 지시가 없으면 부르기 전에 거절한다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, like, or } from 'drizzle-orm';
import { POST as postDuty } from '@/app/api/agents/[id]/duties/route';
import { DELETE as deleteDuty } from '@/app/api/agents/[id]/duties/[dutyId]/route';
import { POST as postTask } from '@/app/api/agents/[id]/tasks/route';
import { DELETE as deleteTask, PATCH as patchTask } from '@/app/api/agents/[id]/tasks/[taskId]/route';
import { POST as postMessage } from '@/app/api/agents/[id]/messages/route';
import { POST as postReply } from '@/app/api/agents/[id]/reply/route';
import { POST as postFileToken } from '@/app/api/agents/[id]/files/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentDuties, agentMessages, agentTasks, auditLog } from '@/lib/db/schema';
import { mondayOf } from '@/lib/agents/weeks';
import { agentAuditKey } from '@/types/agents';
import { today } from '@/lib/date';
import { RUN, USERS, actorOf, call, signIn } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const AGENT = 'op-sk';
const params = { id: AGENT };
const mark = `[시험 ${RUN}]`;

afterAll(async () => {
  const db = getDb();
  await db.delete(agentMessages).where(like(agentMessages.body, `%${RUN}%`)); // 붙은 파일 줄도 같이 지워진다(cascade)
  await db.delete(agentTasks).where(like(agentTasks.title, `%${RUN}%`));
  await db.delete(agentDuties).where(like(agentDuties.title, `%${RUN}%`));
  /* 주간 기록이 감사기록을 읽는다 — 시험이 남긴 줄이 개발 DB 의 주간 기록에 섞이지 않게 걷는다 */
  await db.delete(auditLog).where(and(
    like(auditLog.action, '에이전트%'),
    or(like(auditLog.newValue, `%${RUN}%`), like(auditLog.oldValue, `%${RUN}%`)),
  ));
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

describe('넘긴 파일', () => {
  const prefix = `agent-files/${AGENT}/`;

  it('토큰 — 협력사는 403 · 이름이 없으면 400 · 너무 크면 422', async () => {
    await signIn(USERS.ecoelec);
    expect((await call(postFileToken, { body: { name: 'a.pdf', size: 10 }, params })).status).toBe(403);
    await signIn(USERS.admin);
    expect((await call(postFileToken, { body: { size: 10 }, params })).status).toBe(400);
    expect((await call(postFileToken, { body: { name: 'a.pdf', size: 0 }, params })).status).toBe(400);
    expect((await call(postFileToken, { body: { name: 'a.pdf', size: 60 * 1024 * 1024 }, params })).status).toBe(422);
    expect((await call(postFileToken, { body: { name: 'a.pdf', size: 10 }, params: { id: '../x' } })).status).toBe(400);
  });

  it.skipIf(!process.env.BLOB_READ_WRITE_TOKEN)('토큰 — 자리는 서버가 이 담당 밑에 짓는다', async () => {
    await signIn(USERS.admin);
    const r = await call(postFileToken, { body: { name: '견적/서.pdf', size: 1000 }, params });
    expect(r.status).toBe(200);
    expect(r.json?.pathname as string).toMatch(new RegExp(`^${prefix}[0-9a-f-]{36}/견적_서\\.pdf$`));
  });

  it('남의 자리 · 없는 파일은 받지 않는다 — 클라이언트가 준 주소를 믿지 않는다', async () => {
    await signIn(USERS.admin);
    const other = await call(postMessage, {
      body: { body: `${mark} 파일`, files: [{ pathname: 'agent-files/op-hec/x/a.pdf', name: 'a.pdf' }] }, params,
    });
    expect(other.status).toBe(400);
    expect(other.json?.error).toBe('이 담당에게 올린 파일이 아닙니다.');
    const missing = await call(postMessage, {
      body: { body: `${mark} 파일`, files: [{ pathname: `${prefix}${crypto.randomUUID()}/없음.pdf`, name: '없음.pdf' }] }, params,
    });
    expect(missing.status).toBe(400);
    expect(missing.json?.error).toContain('올린 파일을 찾을 수 없습니다');
  });

  it('저장소 — 파일만 넘겨도 되고, 대화에 파일이 붙어 나온다 · 에이전트의 말에는 붙지 않는다', async () => {
    const file = { name: '단가표.xlsx', pathname: `${prefix}${crypto.randomUUID()}/단가표.xlsx`, url: 'https://blob.example/x', size: 2048, contentType: null };
    const m = await repo.addAgentMessage({ agentId: AGENT, role: 'note', body: `${mark}`, files: [file] }, admin);
    expect(m.files).toHaveLength(1);
    expect(m.files[0]).toMatchObject({ name: '단가표.xlsx', size: 2048 });
    const back = (await repo.getAgent(AGENT, admin)).messages.find((x) => x.id === m.id);
    expect(back?.files.map((f) => f.name)).toEqual(['단가표.xlsx']);

    const said = await repo.addAgentMessage({ agentId: AGENT, role: 'agent', body: `${mark} 답`, files: [file] }, admin);
    expect(said.files).toEqual([]);
    await expect(repo.addAgentMessage(
      { agentId: AGENT, role: 'user', body: `${mark}`, files: [{ ...file, pathname: 'agent-files/op-hec/y/a.pdf' }] }, admin,
    )).rejects.toThrow('이 담당의 파일이 아닙니다');
  });
});

describe('주간 기록', () => {
  it('이번 주 줄에 말 · 할 일 · 업무 정의 · 파일이 세어지고, 그 주를 펼치면 일이 시각 순으로 선다', async () => {
    const before = (await repo.getAgent(AGENT, admin)).weeks.find((w) => w.start === mondayOf(today()));
    const n = (k: 'user' | 'tasksAdded' | 'tasksDone' | 'dutyChanges') => before?.[k] ?? 0;

    const tag = `${mark} 주간기록`; // 이 시험의 일만 골라 보려고 — 위의 시험들도 같은 표지를 쓴다
    await repo.addAgentMessage({ agentId: AGENT, role: 'user', body: `${tag} 이번 주 정리` }, admin);
    const duty = await repo.saveAgentDuty({ agentId: AGENT, title: `${tag} 보고`, body: '월요일' }, admin);
    await repo.saveAgentDuty({ agentId: AGENT, id: duty, title: `${tag} 보고`, body: '월요일 · 목요일' }, admin);
    const task = await repo.addAgentTask({ agentId: AGENT, title: `${tag} 회신 받기`, byAgent: true }, admin);
    await repo.setAgentTaskDone({ agentId: AGENT, id: task.id, done: true }, admin);

    const after = await repo.getAgent(AGENT, admin);
    const week = after.weeks.find((w) => w.start === mondayOf(today()));
    expect(week?.end).toBe(after.weeks[0].end);
    expect(week?.user).toBe(n('user') + 1);
    expect(week?.dutyChanges).toBe(n('dutyChanges') + 2);
    expect(week?.tasksAdded).toBe(n('tasksAdded') + 1);
    expect(week?.tasksDone).toBe(n('tasksDone') + 1);

    const open = await repo.getAgent(AGENT, admin, { week: today() }); // 아무 날이나 주면 그 주 월요일로
    expect(open.week?.start).toBe(mondayOf(today()));
    const mine = open.week!.events.filter((e) => e.title.includes(tag));
    expect(mine.map((e) => e.kind)).toEqual(['duty-added', 'duty-edited', 'task-added', 'task-done']);
    expect(mine[1].before).toContain('월요일');
    expect(mine[1].after).toContain('월요일 · 목요일');
    expect(mine[2].byAgent).toBe(true);
    expect(mine[2].by).toBe('SK일렉링크 담당');
    expect(open.messages.some((m) => m.body === `${tag} 이번 주 정리`)).toBe(true);
  });
});

describe('사용량', () => {
  it('답마다 남긴 비용 · 토큰을 이번 달로 묶는다 — 담당마다, 토큰은 적은 답만 · 관리자만', async () => {
    const before = await repo.agentUsage(admin);
    const row0 = before.byAgent.find((r) => r.agentId === AGENT)!;
    await repo.addAgentMessage({
      agentId: AGENT, role: 'agent', body: `${mark} 사용량 답`,
      meta: { model: 'claude-opus-5-5', usd: 0.25, tokens: { input: 1000, output: 200, cacheRead: 5000, cacheWrite: 300 }, searches: 2 },
    }, admin);
    const after = await repo.agentUsage(admin);
    const row1 = after.byAgent.find((r) => r.agentId === AGENT)!;
    expect(after.month).toBe(today().slice(0, 7));
    expect(row1.replies - row0.replies).toBe(1);
    expect(row1.usd - row0.usd).toBeCloseTo(0.25, 6);
    expect(after.tokens.replies - before.tokens.replies).toBe(1);
    expect(after.tokens.cacheRead - before.tokens.cacheRead).toBe(5000);
    expect(after.tokens.searches - before.tokens.searches).toBe(2);
    expect(after.byAgent[0].agentId).toBe('strategy'); // 조직도 순서
    await expect(repo.agentUsage(actorOf(USERS.viewer))).rejects.toThrow('한백 관리자만');
  });
});

describe('사업마다의 조직도 (migrations/0118)', () => {
  it('전기차와 태양광의 담당이 섞이지 않는다 — 태양광은 전략·기획 · 사업자 담당 셋 · 정산', async () => {
    const ev = await repo.listAgents(admin);
    const solar = await repo.listAgents(admin, 'solar');
    expect(ev.every((a) => a.biz === 'ev')).toBe(true);
    expect(ev.map((a) => a.id)).toEqual(expect.arrayContaining(['strategy', 'op-hec', 'op-nice', 'op-sk', 'op-pluglink', 'op-everon', 'settlement']));
    expect(solar.map((a) => [a.id, a.kind, a.biz, a.company, a.name])).toEqual([
      ['solar-strategy', 'strategy', 'solar', null, '전략·기획 담당'],
      ['solar-tyranteye', 'owner', 'solar', '타이런트아이', '타이런트아이 담당'],
      ['solar-henergy', 'owner', 'solar', '에이치에너지', '에이치에너지 담당'],
      ['solar-lumora', 'owner', 'solar', '루모라', '루모라 담당'],
      ['solar-settlement', 'settlement', 'solar', null, '정산 담당'],
    ]);
    /* 태양광은 따로인 조직이라 이름이 같다(전략·기획 담당 · 정산 담당) — 주간 기록이 찾는 열쇠는 사업마다 다르다 */
    const keys = [...ev, ...solar].map(agentAuditKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('사용량도 사업마다 — 태양광 담당의 답은 전기차 표에 안 든다', async () => {
    const SOLAR = 'solar-henergy';
    const [ev0, solar0] = [await repo.agentUsage(admin), await repo.agentUsage(admin, 'solar')];
    await repo.addAgentMessage({
      agentId: SOLAR, role: 'agent', body: `${mark} 태양광 답`,
      meta: { model: 'claude-opus-5-5', usd: 0.5, tokens: { input: 700, output: 70, cacheRead: 7000, cacheWrite: 0 }, searches: 0 },
    }, admin);
    const [ev1, solar1] = [await repo.agentUsage(admin), await repo.agentUsage(admin, 'solar')];
    expect(ev1.byAgent.some((r) => r.agentId === SOLAR)).toBe(false);
    expect(ev1.tokens.cacheRead).toBe(ev0.tokens.cacheRead);
    const before = solar0.byAgent.find((r) => r.agentId === SOLAR)!;
    const after = solar1.byAgent.find((r) => r.agentId === SOLAR)!;
    expect(after.replies - before.replies).toBe(1);
    expect(after.usd - before.usd).toBeCloseTo(0.5, 6);
    expect(solar1.tokens.cacheRead - solar0.tokens.cacheRead).toBe(7000);
    expect(solar1.byAgent.map((r) => r.agentId)[0]).toBe('solar-strategy'); // 조직도 순서
  });

  it('이름이 같아도 주간 기록이 섞이지 않는다 — 전기차 정산의 업무 정의는 태양광 정산의 기록에 안 선다', async () => {
    await signIn(USERS.admin);
    const week = mondayOf(today());
    const eventsOf = async (id: string) => (await repo.getAgent(id, admin, { week })).week?.events.length ?? 0;
    const [ev0, solar0] = [await eventsOf('settlement'), await eventsOf('solar-settlement')];
    const made = await call(postDuty, { body: { title: `${mark} 전기차 정산 업무` }, params: { id: 'settlement' } });
    expect(made.status).toBe(200);
    expect(await eventsOf('settlement')).toBe(ev0 + 1);
    expect(await eventsOf('solar-settlement')).toBe(solar0);
    await call(deleteDuty, { method: 'DELETE', params: { id: 'settlement', dutyId: made.json?.id as string } });
  });

  it('태양광 담당의 할 일 · 대화도 같은 문을 쓴다 — 지시가 없으면 부르기 전에 거절', async () => {
    await signIn(USERS.admin);
    const p = { id: 'solar-lumora' };
    const made = await call(postTask, { body: { title: `${mark} 루모라 회신 확인` }, params: p });
    expect(made.status).toBe(200);
    const detail = await repo.getAgent('solar-lumora', admin);
    expect(detail.agent.company).toBe('루모라');
    expect(detail.tasks.some((t) => t.title === `${mark} 루모라 회신 확인`)).toBe(true);
    const r = await call(postReply, { body: undefined, params: p });
    expect(r.status).toBe(422);
  });
});

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
import { POST as postDirection } from '@/app/api/agents/[id]/directions/route';
import { DELETE as deleteDirection } from '@/app/api/agents/[id]/directions/[directionId]/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentDirections, agentDuties, agentMessages, agentTasks, auditLog } from '@/lib/db/schema';
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
  await db.delete(agentDirections).where(like(agentDirections.title, `%${RUN}%`));
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

describe('팀 — 팀장 · 실무자 (migrations/0120)', () => {
  it('사업마다 한 팀이다 — 팀장은 전략·기획, 실무자는 나머지(조직 순서). 전기차 · 태양광 둘 다', async () => {
    const ev = await repo.agentTeam(admin, 'ev');
    const solar = await repo.agentTeam(admin, 'solar');
    expect(ev.lead?.id).toBe('strategy');
    expect(ev.members.map((a) => a.id)).toEqual(['op-hec', 'op-nice', 'op-sk', 'op-pluglink', 'op-everon', 'settlement']);
    expect(solar.lead?.id).toBe('solar-strategy');
    expect(solar.members.map((a) => a.id)).toEqual(['solar-tyranteye', 'solar-henergy', 'solar-lumora', 'solar-settlement']);
  });

  it('팀장의 일이 업무 정의에 한 줄씩 선다 — 두 전략·기획 담당 모두(0120)', async () => {
    for (const id of ['strategy', 'solar-strategy']) {
      const { duties } = await repo.getAgent(id, admin);
      expect(duties.map((d) => d.title), id).toContain('팀장 — 실무자 기록 읽고 목표 · 방향 세우기');
    }
  });

  it('목표 · 방향은 관리자만 · 팀장의 것만 — 실무자에게 적으면 422, 협력사 · 열람 전용은 403', async () => {
    for (const u of [USERS.ecoelec, USERS.viewer]) {
      await signIn(u);
      expect((await call(postDirection, { body: { title: `${mark} 목표` }, params: { id: 'strategy' } })).status, u.id).toBe(403);
    }
    await signIn(USERS.admin);
    const r = await call(postDirection, { body: { title: `${mark} 목표` }, params: { id: 'op-nice' } });
    expect(r.status).toBe(422);
    expect(String(r.json?.error)).toContain('팀장');
    expect((await call(postDirection, { body: { body: 'x' }, params: { id: 'strategy' } })).status).toBe(400);
  });

  it('팀장이 세운 것은 그 사업의 팀만 읽는다 — 고치고 지운 일은 팀장의 주간 기록에 앞뒤와 함께 선다', async () => {
    await signIn(USERS.admin);
    const week = mondayOf(today());
    const eventsOf = async () => (await repo.getAgent('strategy', admin, { week })).week?.events ?? [];
    const before = (await eventsOf()).length;

    const made = await call(postDirection, { body: { title: `${mark} 4분기 목표`, body: '계약 300기' }, params: { id: 'strategy' } });
    expect(made.status).toBe(200);
    const id = made.json?.id as string;
    expect((await repo.agentTeam(admin, 'ev')).directions.find((d) => d.id === id)).toMatchObject({
      title: `${mark} 4분기 목표`, body: '계약 300기', author: USERS.admin.name, byAgent: false, updatedAt: null,
    });
    expect((await repo.agentTeam(admin, 'solar')).directions.some((d) => d.id === id)).toBe(false);

    /* 팀장이 대화 중에 고치면 적은 쪽이 팀장이다 — 같은 글을 또 올리면 아무것도 안 남는다 */
    await repo.saveAgentDirection({ leadId: 'strategy', id, title: `${mark} 4분기 목표`, body: '계약 320기', byAgent: true }, admin);
    await repo.saveAgentDirection({ leadId: 'strategy', id, title: `${mark} 4분기 목표`, body: '계약 320기', byAgent: true }, admin);
    const edited = (await repo.agentTeam(admin, 'ev')).directions.find((d) => d.id === id)!;
    expect(edited).toMatchObject({ body: '계약 320기', author: '전략·기획 담당', byAgent: true });
    expect(edited.updatedAt).not.toBeNull();

    const gone = await call(deleteDirection, { method: 'DELETE', params: { id: 'strategy', directionId: id } });
    expect(gone.status).toBe(200);
    expect((await repo.agentTeam(admin, 'ev')).directions.some((d) => d.id === id)).toBe(false);

    const events = (await eventsOf()).filter((e) => e.title === `${mark} 4분기 목표`);
    expect(events.map((e) => [e.kind, e.byAgent])).toEqual([
      ['direction-added', false], ['direction-edited', true], ['direction-deleted', false],
    ]);
    expect(events[1]).toMatchObject({ by: '전략·기획 담당', before: `${mark} 4분기 목표 — 계약 300기`, after: `${mark} 4분기 목표 — 계약 320기` });
    expect((await eventsOf()).length).toBe(before + 3);
    const weekRow = (await repo.getAgent('strategy', admin)).weeks.find((w) => w.start === week);
    expect(weekRow?.directionChanges).toBeGreaterThanOrEqual(3);
  });

  it('팀원끼리 서로의 기록을 읽는다 — 읽는 담당 자신과 다른 사업은 빠지고, 한 사람만 깊이도 읽는다', async () => {
    await repo.addAgentMessage({ agentId: 'op-nice', role: 'note', body: `${mark} 나이스 김대리 통화 — 단가 인하 예고` }, admin);
    await repo.addAgentMessage({ agentId: 'strategy', role: 'note', body: `${mark} 팀장에게 남긴 기록` }, admin);
    await repo.addAgentMessage({ agentId: 'solar-lumora', role: 'note', body: `${mark} 루모라 미팅` }, admin);
    await repo.addAgentTask({ agentId: 'op-nice', title: `${mark} 단가 회신 받기` }, admin);

    /* 팀장이 읽을 때 — 실무자 여섯 */
    const logs = await repo.agentTeamLog(admin, 'ev', { days: 14, perMember: 6, exclude: 'strategy' });
    expect(logs.map((l) => l.agent.id)).toEqual(['op-hec', 'op-nice', 'op-sk', 'op-pluglink', 'op-everon', 'settlement']);
    /* 실무자가 읽을 때 — 팀장과 다른 실무자들(2026-11-05 부터 팀원 모두가 서로 읽는다) */
    const fromNice = await repo.agentTeamLog(admin, 'ev', { days: 14, perMember: 6, exclude: 'op-nice' });
    expect(fromNice.map((l) => l.agent.id)).toContain('strategy');
    expect(fromNice.map((l) => l.agent.id)).not.toContain('op-nice');
    expect(fromNice.flatMap((l) => l.messages.map((m) => m.body))).toContain(`${mark} 팀장에게 남긴 기록`);
    const nice = logs.find((l) => l.agent.id === 'op-nice')!;
    expect(nice.messages.at(-1)?.body).toBe(`${mark} 나이스 김대리 통화 — 단가 인하 예고`);
    expect(nice.tasks.some((t) => t.title === `${mark} 단가 회신 받기` && !t.doneAt)).toBe(true);
    expect(nice.total).toBeGreaterThanOrEqual(nice.messages.length);
    const all = logs.flatMap((l) => l.messages.map((m) => m.body));
    expect(all).not.toContain(`${mark} 팀장에게 남긴 기록`);
    expect(all).not.toContain(`${mark} 루모라 미팅`);

    const [one] = await repo.agentTeamLog(admin, 'solar', { days: 30, perMember: 1, memberId: 'solar-lumora' });
    expect(one.agent.id).toBe('solar-lumora');
    expect(one.messages.map((m) => m.body)).toEqual([`${mark} 루모라 미팅`]);
    expect(await repo.agentTeamLog(admin, 'ev', { days: 30, perMember: 5, memberId: 'solar-lumora' })).toEqual([]);
    await expect(repo.agentTeamLog(actorOf(USERS.viewer), 'ev', { days: 14, perMember: 6 })).rejects.toThrow('한백 관리자만');
  });

  it('팀원에게 말을 남긴다(tell_teammate) — 받은 담당의 대화에 「팀원」의 말로 서고, 팀원들도 읽는다. 다른 사업 · 자기 자신은 거절', async () => {
    const body = `${mark} HB-2026-033 계약서 접수 — 영업비 1차가 열립니다`;
    expect(await repo.tellAgent({ fromId: 'op-nice', toId: 'settlement', body }, admin)).toEqual({ id: 'settlement', name: '정산 담당' });

    const thread = await repo.agentThread('settlement', admin);
    const got = thread.at(-1)!;
    expect(got).toMatchObject({ role: 'peer', author: '나이스인프라 담당', body, meta: { from: { id: 'op-nice', name: '나이스인프라 담당' } } });
    /* 화면의 대화 · 주간 기록에도 선다 */
    const detail = await repo.getAgent('settlement', admin);
    expect(detail.messages.at(-1)?.id).toBe(got.id);
    expect(detail.weeks.find((w) => w.start === mondayOf(today()))?.peer).toBeGreaterThanOrEqual(1);
    /* 팀장이 [팀 소식]으로 읽는다 */
    const [settle] = await repo.agentTeamLog(admin, 'ev', { days: 1, perMember: 3, memberId: 'settlement' });
    expect(settle.messages.map((m) => m.body)).toContain(body);

    await expect(repo.tellAgent({ fromId: 'op-nice', toId: 'solar-lumora', body: `${mark} x` }, admin)).rejects.toThrow('다른 사업');
    await expect(repo.tellAgent({ fromId: 'op-nice', toId: 'op-nice', body: `${mark} x` }, admin)).rejects.toThrow('자기 자신');
    await expect(repo.tellAgent({ fromId: 'op-nice', toId: 'settlement', body: '  ' }, admin)).rejects.toThrow('비었다');
    await expect(repo.tellAgent({ fromId: 'op-nice', toId: 'settlement', body: `${mark} x` }, actorOf(USERS.viewer)))
      .rejects.toThrow('한백 관리자만');
  });

  it('지난 대화는 전부 읽는다(agentThread) — 화면의 300개보다 앞의 말도, 오래된 것부터, 넘긴 파일과 함께', async () => {
    /* 아주 오래된 말 하나를 300개 넘게 앞에 둔다 — 화면(getAgent)에는 안 실려도 에이전트는 읽는다 */
    const db = getDb();
    const oldest = { id: crypto.randomUUID(), agentId: 'op-everon', role: 'user', author: '김정우', body: `${mark} 2020년의 지시`,
      at: new Date('2020-01-02T00:00:00+09:00') };
    const filler = Array.from({ length: 300 }, (_, i) => ({
      id: crypto.randomUUID(), agentId: 'op-everon', role: 'note', author: '김정우', body: `${mark} 채움 ${i}`,
      at: new Date(Date.UTC(2020, 1, 1, 0, i)),
    }));
    await db.insert(agentMessages).values([oldest, ...filler]);
    const thread = await repo.agentThread('op-everon', admin);
    expect(thread.length).toBeGreaterThan(300);
    expect(thread[0].body).toBe(`${mark} 2020년의 지시`);
    expect(thread.findIndex((m) => m.body === `${mark} 채움 0`)).toBeLessThan(thread.findIndex((m) => m.body === `${mark} 채움 299`));
    const shown = (await repo.getAgent('op-everon', admin)).messages;
    expect(shown.length).toBeLessThanOrEqual(300);
    expect(shown.map((m) => m.body)).not.toContain(`${mark} 2020년의 지시`);
    await expect(repo.agentThread('op-everon', actorOf(USERS.viewer))).rejects.toThrow('한백 관리자만');
  });
});

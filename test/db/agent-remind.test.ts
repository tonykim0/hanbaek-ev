/**
 * 담당의 정기 알림 — 정산 담당의 열린구매 상신(store/agents agentRemind · lib/agents/remind-run · lib/agents/open-purchase).
 * 한백 지시 2026-11-04 「정산담당자는 정기결제일인 매월 10일 25일 3영업일 전에 열린구매 상신해야한다고 나한테 알림 줘야함」.
 *
 * 보는 것: 할 일 · 대화 한 줄(자동) · 한백 관리자 알림이 한 번에 남는다 · 같은 열쇠는 한 번(다시 불려도 · 할 일을 지워도 · 동시에 불려도) ·
 * 알림 줄은 그 담당을 가리키고 그 담당을 열면 읽힌다 · 열람 전용 · 협력사는 받지 않는다 · 크론이 부르는 정기 일은 기한 날에만 남긴다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import { POST as readNotifications } from '@/app/api/notifications/read/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { agentMessages, agentTasks, auditLog, notifications, users } from '@/lib/db/schema';
import { runAgentReminders } from '@/lib/agents/remind-run';
import { openPurchaseKey } from '@/lib/agents/open-purchase';
import { RUN, USERS, actorOf, call, signIn } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const AGENT = 'settlement';
const KEY = `test-remind:${RUN}`;
const KEY_RACE = `test-remind-race:${RUN}`;
const TITLE = `[시험 ${RUN}] 열린구매 상신`;
/** runAgentReminders(2027-01-05) 가 남기는 것 — 1월 10일(일) 정기결제 */
const JAN_KEY = openPurchaseKey('2027-01-10');
const JAN_TITLE = '열린구매 상신 — 1월 10일 정기결제';

const remind = (key: string) => repo.agentRemind({
  agentId: AGENT, key,
  task: { title: TITLE, note: '지급 0건', due: '2027-01-05' },
  say: `${TITLE} — 대화`,
  alarm: { title: TITLE, body: `${RUN} 본문` },
  link: { href: '/statements', label: '거래명세서 보기 →' },
}, admin);

const byKey = (key: string) => and(eq(agentMessages.agentId, AGENT), sql`${agentMessages.meta}->>'remind' = ${key}`);

async function sweep() {
  const db = getDb();
  const keys = [KEY, KEY_RACE, JAN_KEY];
  for (const key of keys) await db.delete(agentMessages).where(byKey(key));
  await db.delete(agentTasks).where(and(eq(agentTasks.agentId, AGENT), inArray(agentTasks.kind, keys)));
  await db.delete(notifications).where(and(
    eq(notifications.agentId, AGENT), eq(notifications.kind, 'remind'), inArray(notifications.title, [TITLE, JAN_TITLE]),
  ));
  await db.delete(auditLog).where(and(
    eq(auditLog.field, '정산 담당'),
    inArray(auditLog.action, ['에이전트 할 일 (에이전트가 적음)', '에이전트 자동', '에이전트 할 일 삭제']),
    or(like(auditLog.newValue, `%${RUN}%`), like(auditLog.oldValue, `%${RUN}%`), like(auditLog.newValue, '%1월 10일%정기결제%')),
  ));
}

beforeAll(sweep);
afterAll(sweep);

describe('담당의 정기 알림 — 정산 담당의 열린구매 상신', () => {
  it('할 일 · 대화 한 줄 · 한백 관리자 알림을 한 번에 — 같은 열쇠는 다시 불려도, 할 일을 지워도 한 번', async () => {
    const db = getDb();
    const first = await remind(KEY);
    expect(first.created).toBe(true);

    const [task] = await db.select().from(agentTasks).where(and(eq(agentTasks.agentId, AGENT), eq(agentTasks.kind, KEY)));
    expect(task).toMatchObject({ title: TITLE, note: '지급 0건', due: '2027-01-05', author: '정산 담당', doneAt: null });
    const said = await db.select().from(agentMessages).where(byKey(KEY));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ role: 'auto', author: '정산 담당', body: `${TITLE} — 대화` });
    expect(said[0].meta).toMatchObject({ remind: KEY, added: [TITLE], link: { href: '/statements', label: '거래명세서 보기 →' } });

    /* 받는 사람은 한백 관리자 모두 — 열람 전용 · 협력사는 받지 않는다 */
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.active, true)));
    const alarms = await db.select().from(notifications).where(and(eq(notifications.agentId, AGENT), eq(notifications.title, TITLE)));
    expect(first.alarmed).toBe(admins.length);
    expect(alarms.map((n) => n.userId).sort()).toEqual(admins.map((a) => a.id).sort());
    expect(alarms.map((n) => n.userId)).not.toContain(USERS.viewer.id);
    expect(alarms.every((n) => n.kind === 'remind' && n.projectId === null && n.biz === 'ev')).toBe(true);

    expect((await remind(KEY)).created).toBe(false);
    await repo.deleteAgentTask({ agentId: AGENT, id: task.id }, admin);
    expect((await remind(KEY)).created).toBe(false); // 대화의 그 줄로 가른다 — 지운 할 일이 다음 날 다시 서지 않는다
    expect(await db.select().from(agentMessages).where(byKey(KEY))).toHaveLength(1);
    expect(await db.select().from(notifications).where(and(eq(notifications.agentId, AGENT), eq(notifications.title, TITLE))))
      .toHaveLength(admins.length);
  });

  it('동시에 두 번 불려도 하나만 선다 — 담당 줄을 잠근다', async () => {
    const results = await Promise.all([remind(KEY_RACE), remind(KEY_RACE)]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await getDb().select().from(agentMessages).where(byKey(KEY_RACE))).toHaveLength(1);
  });

  it('알림 줄은 그 담당을 가리키고(AI 담당 · 탭 없음), 그 담당과의 대화를 열면 읽힌다', async () => {
    const me = { id: USERS.admin.id, role: USERS.admin.role, org: USERS.admin.org };
    const mine = () => repo.listNotifications(me).then((l) => l.filter((n) => n.title === TITLE));
    const before = await mine();
    expect(before.length).toBeGreaterThan(0);
    expect(before[0]).toMatchObject({
      kind: 'remind', agentId: AGENT, agentName: '정산 담당', author: 'AI 담당', scope: null, projectId: null, read: false,
    });

    await signIn(USERS.admin);
    const res = await call(readNotifications, { body: { agentId: AGENT } });
    expect(res.status).toBe(200);
    expect(Number(res.json?.marked)).toBeGreaterThanOrEqual(before.length);
    expect((await mine()).every((n) => n.read)).toBe(true);

    /* 협력사에게는 서지 않는다 */
    const partner = await repo.listNotifications({ id: USERS.ecoelec.id, role: USERS.ecoelec.role, org: USERS.ecoelec.org });
    expect(partner.some((n) => n.kind === 'remind')).toBe(false);
  });

  it('크론의 정기 일 — 기한 전날은 아무것도 안 하고, 기한 날 아침에 정산 담당이 한 번 남긴다', async () => {
    // 한국 시각 2027-01-04 09:00 — 1월 10일(일) 정기결제는 앞 영업일 1월 8일(금)에 나가고 기한은 1월 5일(화)
    expect(await runAgentReminders(new Date('2027-01-04T00:00:00Z'))).toEqual({ day: '2027-01-04', due: [], reminded: [], drafted: [] });
    // 그날 나갈 배치가 없다 — 아지트 글 초안은 안 서고 그 까닭을 적는다(초안이 서는 길은 test/db/agit-posts)
    expect(await runAgentReminders(new Date('2027-01-05T00:00:00Z')))
      .toEqual({ day: '2027-01-05', due: ['2027-01-10'], reminded: ['2027-01-10'], drafted: [] });

    const said = await getDb().select().from(agentMessages).where(byKey(JAN_KEY));
    expect(said).toHaveLength(1);
    expect(said[0].author).toBe('정산 담당');
    expect(said[0].body).toContain('1월 10일(일) 정기결제 — 오늘이 열린구매 상신 기한입니다(3영업일 전).');
    expect(said[0].body).toContain('1월 10일은 일요일이라 앞 영업일 1월 8일(금)에 나간다고 보고 셌습니다.');
    expect(said[0].body).toContain('아지트 열린구매 글 초안은 올리지 않았습니다(지급 0건 — 올릴 것 없음)');
    const [task] = await getDb().select().from(agentTasks).where(and(eq(agentTasks.agentId, AGENT), eq(agentTasks.kind, JAN_KEY)));
    expect(task).toMatchObject({ title: JAN_TITLE, due: '2027-01-05' });

    // 같은 날 다시 돌아도(크론이 두 번) 하나
    expect((await runAgentReminders(new Date('2027-01-05T03:00:00Z'))).reminded).toEqual([]);
  });
});

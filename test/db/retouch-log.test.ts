/**
 * 서류 문구 수정의 문 — 관리자만 쓰고, 받을 때마다 audit_log 에 「무엇을 무엇으로」가 남는다.
 *
 * 화면은 기록이 남아야 PDF 를 내준다(components/retouch/Retouch save). 그 기록이 열람 전용·협력사에게 열리거나,
 * 남는다고 해 놓고 안 남으면 직인사용동의로 고친 서류의 근거가 사라진다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { POST as log } from '@/app/api/retouch/log/route';
import { POST as locate } from '@/app/api/retouch/locate/route';
import { getDb } from '@/lib/db/client';
import { auditLog } from '@/lib/db/schema';
import { RUN, USERS, call, signIn } from './kit';

const FILE = `[시험 ${RUN}] 계약서.pdf`;
const body = { file: FILE, prompt: '3대를 2대로', edits: [{ page: 1, from: '3', to: '2' }] };

afterAll(async () => {
  await getDb().delete(auditLog).where(like(auditLog.field, `%${RUN}%`));
});

describe('서류 문구 수정 — 기록', () => {
  it('열람 전용·협력사는 기록 라우트에서 403', async () => {
    for (const u of [USERS.viewer, USERS.ecoelec]) {
      await signIn(u);
      expect((await call(log, { method: 'POST', body })).status, u.id).toBe(403);
    }
  });

  it('관리자가 받으면 audit_log 한 줄 — 파일·바꾼 글자·요청', async () => {
    await signIn(USERS.admin);
    const r = await call(log, { method: 'POST', body });
    expect(r.status).toBe(200);
    const rows = await getDb().select().from(auditLog)
      .where(and(eq(auditLog.action, '서류 문구 수정'), eq(auditLog.field, FILE)));
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toContain('(admin)');
    expect(rows[0].oldValue).toBe('1쪽 「3」');
    expect(rows[0].newValue).toBe('1쪽 「2」 ‖ 요청: 3대를 2대로');
  });

  it('고친 것이 없으면 400 — 빈 기록으로 PDF 를 내주지 않는다', async () => {
    await signIn(USERS.admin);
    expect((await call(log, { method: 'POST', body: { ...body, edits: [] } })).status).toBe(400);
  });

  it('찾기 라우트도 관리자만 — 판독 비용이 나간다', async () => {
    await signIn(USERS.viewer);
    expect((await call(locate, { method: 'POST', body: { prompt: 'x', pages: [] } })).status).toBe(403);
  });
});

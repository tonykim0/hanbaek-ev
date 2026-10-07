/**
 * 기설치 대조는 접수 단계에서 저절로 돈다 (한백 지시 2026-10-07 · lib/preinstall-run).
 * 판독을 부르지 않게 증빙 없이 설치이력 엑셀(저장소의 양식)만 붙인다 — 엑셀은 코드가 읽는다. 파일 주소는
 * 시험 주소라 fetch 를 그 자리에서 양식 파일로 돌려준다.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import { loadPreInstallCheck } from '@/lib/data/store/preinstall-check';
import { schedulePreInstallCheck } from '@/lib/preinstall-run';
import { RUN, USERS, actorOf, withProject } from './kit';

const TEMPLATE = readFileSync('public/notices/files/legacy-charger-history-template.xlsx');
const realFetch = globalThis.fetch;
beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) =>
    (String(url).startsWith('https://test.local/') ? new Response(TEMPLATE) : realFetch(url, init)));
});
afterAll(() => { vi.unstubAllGlobals(); });

const repo = getRepository();
const admin = actorOf(USERS.admin);
const autoRuns = async (id: string) =>
  (await getDb().select({ id: auditLog.id }).from(auditLog)
    .where(and(eq(auditLog.projectId, id), eq(auditLog.action, '기설치 대조'), eq(auditLog.actor, '자동 대조(system)')))).length;
const attach = (id: string, n: number) => repo.uploadDocument(
  { projectId: id, kind: 'legacylog', filename: `이력${n}.xlsx`, blobUrl: `https://test.local/${RUN}/${id}/log${n}.xlsx` }, admin);

describe('기설치 대조 — 접수 단계에서 저절로', () => {
  it('설치이력이 들어오면 돈다 — 연달아 들어오면 마지막 하나만, 같은 서류로는 다시 안 돈다', () => withProject(async (id) => {
    // 현장 번호는 지운 뒤 다시 쓰인다 — 감사 기록은 남으므로 앞뒤 차이로 센다
    const base = await autoRuns(id);
    await attach(id, 1);
    const first = schedulePreInstallCheck(id, 'legacylog', 300);
    // 기다리는 사이에 한 장 더 — 앞의 것은 서지 않고 뒤의 것만 돈다
    await new Promise((r) => setTimeout(r, 50));
    await getRepository().deleteDocumentFile({ projectId: id, kind: 'legacylog', url: `https://test.local/${RUN}/${id}/log1.xlsx` }, admin);
    await attach(id, 2);
    const second = schedulePreInstallCheck(id, 'legacylog', 300);
    await Promise.all([first, second]);
    const check = await loadPreInstallCheck(id);
    expect(check, '대조 결과가 남는다').not.toBeNull();
    expect(check!.files).toEqual([`https://test.local/${RUN}/${id}/log2.xlsx`]);
    expect(check!.sheet, '엑셀을 읽었다').not.toBeNull();
    expect(await autoRuns(id) - base, '한 번만 돌았다').toBe(1);
    // 같은 서류로 다시 불러도(계약서 접수) 돌지 않는다
    await schedulePreInstallCheck(id, undefined, 10);
    expect(await autoRuns(id) - base).toBe(1);
  }));

  it('설치이력·증빙이 아닌 칸이나 설치이력이 없으면 돌지 않는다', () => withProject(async (id) => {
    expect(schedulePreInstallCheck(id, 'contract', 10)).toBeUndefined();
    await schedulePreInstallCheck(id, undefined, 10);
    expect(await loadPreInstallCheck(id)).toBeNull();
  }));
});

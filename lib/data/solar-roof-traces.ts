/**
 * AI 지붕 따기(「AI로 패널배치하기」)의 결과 · 부른 기록 (migrations/0127, 2026-11-08 — 그전에는 라우트의 메모리였다).
 *
 * 서버가 새로 떠도 같은 필지를 AI 에 다시 보내지 않고(한 번 약 $0.05), 계정마다 하루 한도도 그대로 센다. 부르기 전에 줄을 세우고
 * 끝나면 결과를 적는다 — 실패한 것도 한 번으로 센다(돈이 들었다). 정본 자료가 아니라 다시 부르지 않으려는 기록이라 감사 기록은 없다.
 */
import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { solarRoofTraces } from '@/lib/db/schema';
import type { Trace } from '@/lib/solar/roof-trace';

/** 그 필지의 가장 최근 결과 — since 뒤에 끝난 것만(없으면 null) */
export async function recentTrace(pnu: string, since: Date): Promise<Trace | null> {
  const [row] = await getDb()
    .select({ trace: solarRoofTraces.trace })
    .from(solarRoofTraces)
    .where(and(eq(solarRoofTraces.pnu, pnu), isNotNull(solarRoofTraces.trace), gte(solarRoofTraces.createdAt, since)))
    .orderBy(desc(solarRoofTraces.createdAt))
    .limit(1);
  return (row?.trace as Trace | undefined) ?? null;
}

/** 그 계정이 since 뒤에 부른 수 — 실패한 것까지 */
export async function tracesSince(userId: string, since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(solarRoofTraces)
    .where(and(eq(solarRoofTraces.userId, userId), gte(solarRoofTraces.createdAt, since)));
  return Number(row?.n ?? 0);
}

/** 부르기 전 — 한 줄을 세운다(한도에 센다) */
export async function startTrace(pnu: string, userId: string): Promise<string> {
  const id = randomUUID();
  await getDb().insert(solarRoofTraces).values({ id, pnu, userId });
  return id;
}

/** 끝난 결과를 그 줄에 적는다 */
export async function finishTrace(id: string, trace: Trace): Promise<void> {
  await getDb().update(solarRoofTraces).set({ trace }).where(eq(solarRoofTraces.id, id));
}

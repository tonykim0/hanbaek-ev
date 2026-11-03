/**
 * PATCH  /api/solar/sites/[id] — 고치기(보낸 칸만 · 담당 협력사는 한백 관리자만)
 * DELETE /api/solar/sites/[id] — 지우기(번호는 다시 쓰지 않는다)
 *
 * 한백 관리자, 또는 그 현장의 담당 협력사(태양광 참여 중)만 — 남의 현장은 「찾지 못했습니다」(lib/data/solar-sites).
 */
import { sessionWrite } from '@/lib/api/write-route';
import { solarSiteStore } from '@/lib/data/solar-sites';

export const PATCH = sessionWrite<{ id: string }, unknown>(async ({ body, params, actor }) => {
  await solarSiteStore.update(params.id, body, actor);
});

export const DELETE = sessionWrite<{ id: string }, unknown>(async ({ params, actor }) => {
  await solarSiteStore.remove(params.id, actor);
});

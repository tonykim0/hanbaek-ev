/**
 * POST /api/solar/sites — 태양광 상담 접수 { name, address, kind, customer?, phone?, memo?, org?(한백 관리자만) }
 *
 * 쓰기 껍데기(sessionWrite)가 로그인 · 열람 전용을 보고, 누가 접수할 수 있는지(태양광 참여)와 담당은 저장소가 본다
 * (lib/data/solar-sites). 돌려주는 것은 새 번호(SL-연도-순번).
 */
import { sessionWrite } from '@/lib/api/write-route';
import { solarSiteStore } from '@/lib/data/solar-sites';

export const POST = sessionWrite<Record<string, never>, unknown>(async ({ body, actor }) => {
  const site = await solarSiteStore.create(body, actor);
  return { id: site.id };
});

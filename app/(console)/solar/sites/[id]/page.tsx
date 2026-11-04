/**
 * 태양광 현장 한 곳 — 상담 접수로 들어온 현장(2026-11-03). 남의 현장 · 없는 현장은 같은 404 다(있는지도 안 알린다).
 * 고치기 · 지우기는 한백 관리자와 그 현장의 담당 협력사 — 화면은 단추를 감추고, 저장소가 한 번 더 본다(lib/data/solar-sites).
 */
import { notFound, redirect } from 'next/navigation';
import SiteDetail from '@/components/solar/SiteDetail';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import { solarSiteStore } from '@/lib/data/solar-sites';
import { canWrite } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const session = await getSessionUser();
  const site = session ? await solarSiteStore.get(params.id, viewerOf(session)) : null;
  return { title: site ? site.name : '태양광 현장' };
}

export default async function SolarSitePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getSessionUser();
  if (!session) redirect(`/login?next=/solar/sites/${params.id}`);
  const site = await solarSiteStore.get(params.id, viewerOf(session));
  if (!site) notFound();

  // 한백 관리자 · 담당 협력사의 계정이면 고친다 — 참여를 껐으면 저장소가 막는다(화면은 여기까지만 본다)
  const canEdit = session.role === 'admin' || (canWrite(session.role) && !!session.org && site.org === session.org && session.solar === true);
  const maker = await userStore.find(site.createdBy);
  // 담당 협력사는 한백 관리자만 바꾼다 — 고칠 때 고를 소속(태양광 참여 협력사)
  const orgs = session.role === 'admin' ? await solarSiteStore.partnerOrgs() : undefined;

  // 접수 폼이 파일을 다 못 올렸으면 그 수를 들고 온다 — 상세의 파일 구역이 알린다
  const unsent = Math.max(0, Math.min(99, Number(searchParams.unsent) || 0));
  return (
    <SiteDetail site={site} canEdit={canEdit} orgs={orgs} createdByName={maker?.name ?? site.createdBy} unsent={unsent} />
  );
}

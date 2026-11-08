/**
 * 태양광 상담 접수 (2026-11-03, 한백 「현장관리에서 상담 개소 접수 할 수 있도록」).
 *
 * 부지 검토에서 「이 부지로 상담 접수」를 누르면 주소 · 현장명 · 설치 형태를 들고 온다(?address=&name=&kind=).
 * 받는 사람은 태양광 참여 협력사와 한백 관리자다(lib/solar/sites canRegisterSite — 11-04 「한백도 접수하게해줘」).
 * 협력사는 제 소속이 담당이고, 한백은 담당 협력사를 태양광 참여 협력사 중에서 고른다(「한백 직접은 없어」). 열람 전용 ·
 * 참여하지 않는 협력사는 현장관리로 돌려보낸다. 대행(그 협력사의 눈)이면 그 협력사로 접수된다.
 */
import { redirect } from 'next/navigation';
import { PANEL } from '@/components/ui';
import SiteForm from '@/components/solar/SiteForm';
import { getSessionUser } from '@/lib/auth/session';
import { solarSiteStore } from '@/lib/data/solar-sites';
import { canRegisterSite, draftOf, SITE_KINDS } from '@/lib/solar/sites';
import { firstParam } from '@/lib/search-param';

export const metadata = { title: '태양광 상담 접수' };
export const dynamic = 'force-dynamic';

export default async function SolarSiteNewPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/sites/new');
  if (!canRegisterSite(session)) redirect('/solar/sites');
  const kind = SITE_KINDS.find((k) => k === firstParam(searchParams.kind));
  // 한백 관리자만 담당을 고른다 — 협력사의 폼에는 그 칸이 없다
  const orgs = session.role === 'admin' ? await solarSiteStore.partnerOrgs() : undefined;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-5 text-h1 font-black text-slate-900">상담 접수</h1>
      <div className={`${PANEL} p-5`}>
        <SiteForm
          initial={draftOf({ name: firstParam(searchParams.name).slice(0, 80), address: firstParam(searchParams.address).slice(0, 200), kind })}
          orgs={orgs}
        />
      </div>
    </div>
  );
}

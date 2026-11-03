/**
 * 태양광 상담 접수 (2026-11-03, 한백 「현장관리에서 상담 개소 접수 할 수 있도록」).
 *
 * 부지 검토에서 「이 부지로 상담 접수」를 누르면 주소 · 현장명 · 설치 형태를 들고 온다(?address=&name=&kind=).
 * 협력사가 접수하면 제 소속이 담당이고, 한백 관리자는 담당 협력사를 고르거나 「한백 직접」으로 둔다.
 * 열람 전용은 쓰기가 없다 — 현장관리로 돌려보낸다.
 */
import { redirect } from 'next/navigation';
import { PANEL } from '@/components/ui';
import SiteForm from '@/components/solar/SiteForm';
import { getSessionUser } from '@/lib/auth/session';
import { solarSiteStore } from '@/lib/data/solar-sites';
import { canWrite } from '@/lib/roles';
import { draftOf, SITE_KINDS } from '@/lib/solar/sites';

export const metadata = { title: '태양광 상담 접수' };
export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function SolarSiteNewPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/sites/new');
  if (!canWrite(session.role)) redirect('/solar/sites');
  const isAdmin = session.role === 'admin';
  const orgs = isAdmin ? await solarSiteStore.solarOrgs() : [];
  const kind = SITE_KINDS.find((k) => k === one(searchParams.kind));

  return (
    <div className="max-w-3xl">
      <h1 className="mb-5 text-h1 font-black text-slate-900">상담 접수</h1>
      <div className={`${PANEL} p-5`}>
        <SiteForm
          initial={draftOf({ name: one(searchParams.name).slice(0, 80), address: one(searchParams.address).slice(0, 200), kind })}
          orgs={orgs}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}

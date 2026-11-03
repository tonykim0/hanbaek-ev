/**
 * 태양광 상담 접수 (2026-11-03, 한백 「현장관리에서 상담 개소 접수 할 수 있도록」).
 *
 * 부지 검토에서 「이 부지로 상담 접수」를 누르면 주소 · 현장명 · 설치 형태를 들고 온다(?address=&name=&kind=).
 * ★태양광 참여 협력사만 접수한다★ — 담당은 그 계정의 소속이다(한백 지시 「한백 직접은 없어」). 한백(관리자 · 열람 전용)은
 * 현장관리로 돌려보낸다 — 대행(그 협력사의 눈)이면 그 협력사로 접수된다.
 */
import { redirect } from 'next/navigation';
import { PANEL } from '@/components/ui';
import SiteForm from '@/components/solar/SiteForm';
import { getSessionUser } from '@/lib/auth/session';
import { canWrite, isHanbaek } from '@/lib/roles';
import { draftOf, SITE_KINDS } from '@/lib/solar/sites';

export const metadata = { title: '태양광 상담 접수' };
export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function SolarSiteNewPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/sites/new');
  if (isHanbaek(session.role) || !canWrite(session.role) || !session.solar) redirect('/solar/sites');
  const kind = SITE_KINDS.find((k) => k === one(searchParams.kind));

  return (
    <div className="max-w-3xl">
      <h1 className="mb-5 text-h1 font-black text-slate-900">상담 접수</h1>
      <div className={`${PANEL} p-5`}>
        <SiteForm
          initial={draftOf({ name: one(searchParams.name).slice(0, 80), address: one(searchParams.address).slice(0, 200), kind })}
        />
      </div>
    </div>
  );
}

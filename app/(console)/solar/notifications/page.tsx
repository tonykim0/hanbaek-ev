/**
 * 태양광 알림 (2026-11-03, 한백 「알림도 전기차랑 태양광이랑 구분」 · migrations/0107).
 *
 * 전기차 알림(/notifications)과 같은 목록이고 사업만 다르다 — 사이드바의 「알림」은 지금 사업의 것으로 가고 배지도 그것만 센다.
 * 지금은 태양광 알림을 남기는 일이 없어 0건이다 — 태양광 현장에 글 · 반려 같은 일이 생기면 biz 'solar' 로 남긴다.
 */
import { redirect } from 'next/navigation';
import NotificationList from '@/components/NotificationList';
import { getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';

export const metadata = { title: '태양광 알림' };
export const dynamic = 'force-dynamic';

export default async function SolarNotificationsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/notifications');
  const items = await getRepository().listNotifications({ id: session.id, role: session.role, org: session.org }, undefined, 'solar');
  return (
    <div className="max-w-[880px]">
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">알림</h1>
      </div>
      <NotificationList items={items} viewingAs={session.via ? session.org ?? session.name : null} biz="solar" />
    </div>
  );
}

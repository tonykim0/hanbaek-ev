import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import NotificationList from '@/components/NotificationList';

export const metadata = { title: '알림 — 한백 전기차사업관리시스템' };
export const dynamic = 'force-dynamic';

/**
 * 알림 — 현장의 「진행현황 및 메모」에 상대방이 남긴 글 (한백 지시 2026-10-05 「메모·댓글을 우리와 협력사 간
 * 소통 창구로 — 내가 남긴 댓글이 상대방에게 알림으로」). 누구에게 가는지는 lib/notify.ts.
 *
 * 줄을 누르면 그 현장의 그 탭으로 간다 — 거기서 읽힌다(현장 상세가 그 갈래의 알림을 읽음으로 찍는다). 이 화면을
 * 여는 것만으로는 읽은 것이 아니다 — 무엇이 왔는지 훑는 것과 읽는 것은 다르다. 「모두 읽음」이 따로 있다.
 */
export default async function NotificationsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/notifications');

  const items = await getRepository().listNotifications({ id: session.id, role: session.role, org: session.org });

  return (
    <div className="max-w-[880px]">
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">알림</h1>
      </div>
      <NotificationList items={items} viewingAs={session.via ? session.org ?? session.name : null} />
    </div>
  );
}

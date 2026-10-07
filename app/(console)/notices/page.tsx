import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import NoticeBoard from '@/components/NoticeBoard';
import { isHanbaek } from '@/lib/roles';
import { userStore } from '@/lib/auth/users';

export const metadata = { title: '공지 — 한백 전기차사업관리시스템' };
// 공지를 쓰면 배포 없이 바로 보이도록 매 요청마다 읽는다
export const dynamic = 'force-dynamic';

/**
 * 공지 — 한백이 협력사 전체에 알리는 글 (한백 지시 2026-09-03).
 *
 * 정적 HTML(public/notices/)로 한 장씩 만들던 것을 화면으로 받는다. 읽기는 로그인한
 * 전부(열람 전용 포함), 쓰기는 관리자만이다. 이 화면을 여는 것이 곧 「읽었다」이고
 * (NoticeBoard 가 표시를 찍는다) 상단바 배지가 그때 꺼진다.
 */
export default async function NoticesPage({ searchParams }: {
  /** 알림에서 오면 ?open=공지&org=업체 — 그 공지를 펼치고 그 업체의 대화로 내려간다 */
  searchParams: { open?: string; org?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/notices');

  const repo = getRepository();
  const me = { id: session.id, role: session.role, org: session.org };
  const [items, messages, freshIds] = await Promise.all([
    repo.listNotices(),
    repo.listNoticeMessages(me),
    repo.unreadNoticeMessages(session.id),
  ]);
  const hanbaek = isHanbaek(session.role);
  /*
   * 한백이 메모를 보낼 수 있는 업체 — 협력사 계정이 있는 곳(DB 계정만: 알림이 갈 사람이다).
   * 저장소도 같은 판정으로 거절한다(store/notice-messages) — 받을 사람 없는 줄기를 만들지 않는다.
   */
  const orgs = session.role === 'admin'
    ? [...new Set((await userStore.list().catch(() => []))
      .filter((a) => a.source === 'db' && a.active && !isHanbaek(a.role) && a.org)
      .map((a) => a.org!))].sort((a, b) => a.localeCompare(b, 'ko'))
    : [];

  return (
    <div className="max-w-[880px]">
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">공지</h1>
      </div>
      <NoticeBoard
        items={items}
        canWrite={session.role === 'admin'}
        messages={messages}
        freshIds={freshIds}
        // 남기는 사람 — 협력사(소속이 있어야 줄기가 선다)와 한백 관리자. 열람 전용은 읽기만
        talk={{ hanbaek, canPost: session.role === 'admin' || (!hanbaek && !!session.org), orgs }}
        openId={typeof searchParams.open === 'string' ? searchParams.open : null}
        focusOrg={typeof searchParams.org === 'string' ? searchParams.org : null}
      />
    </div>
  );
}

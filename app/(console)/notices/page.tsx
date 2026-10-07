import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import NoticeBoard from '@/components/NoticeBoard';
import { canWrite } from '@/lib/roles';

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
  /** 알림에서 오면 ?open=공지 — 그 공지를 펼치고 그리로 내려간다 */
  searchParams: { open?: string };
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
        // 메모를 남기는 사람 — 협력사와 한백 관리자. 열람 전용은 읽기만(라우트도 막는다)
        canPost={canWrite(session.role)}
        openId={typeof searchParams.open === 'string' ? searchParams.open : null}
      />
    </div>
  );
}

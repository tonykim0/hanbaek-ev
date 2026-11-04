import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import NoticeBoard from '@/components/NoticeBoard';
import { canWrite } from '@/lib/roles';

export const metadata = { title: '태양광 공지' };
// 공지를 쓰면 배포 없이 바로 보이도록 매 요청마다 읽는다
export const dynamic = 'force-dynamic';

/**
 * 태양광 공지 (2026-11-04, migrations/0116 — 한백 「태양광에 있는 공지내용은 지워줘야지 전기차만 해당되는데, 모든 공지와
 * 알림은 분리해(전기차/태양광)」).
 *
 * 전기차 공지(/notices)와 같은 부품이고 사업만 다르다 — 상단 바의 「공지」는 지금 사업의 것으로 가고 배지도 그것만 센다.
 * 그전 공지는 전부 전기차라 여기는 빈 채로 시작한다. 문은 태양광 구역의 것이다((console)/solar/layout — 한백 + 태양광 참여
 * 협력사). 메모와 그 알림도 태양광을 보는 계정 사이에서만 오간다(store/notice-messages).
 */
export default async function SolarNoticesPage({ searchParams }: {
  /** 알림에서 오면 ?open=공지 — 그 공지를 펼치고 그리로 내려간다 */
  searchParams: { open?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/notices');

  const repo = getRepository();
  const me = { id: session.id, role: session.role, org: session.org };
  const [items, messages, freshIds] = await Promise.all([
    repo.listNotices('solar'),
    repo.listNoticeMessages(me, 'solar'),
    repo.unreadNoticeMessages(session.id),
  ]);

  return (
    <div className="max-w-[880px]">
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">공지</h1>
      </div>
      <NoticeBoard
        biz="solar"
        items={items}
        canWrite={session.role === 'admin'}
        messages={messages}
        freshIds={freshIds}
        canPost={canWrite(session.role)}
        openId={typeof searchParams.open === 'string' ? searchParams.open : null}
      />
    </div>
  );
}

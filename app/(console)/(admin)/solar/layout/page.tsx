import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canWrite } from '@/lib/roles';
import LayoutBoard from '@/components/solar/LayoutBoard';

export const metadata = { title: '패널 배치 — 한백 전기차사업관리시스템' };

/**
 * 위성사진 패널 배치 — 협력사 회의 Agenda 의 배치도(21차 12~36쪽, 현장 24곳)를 만드는 자리.
 *
 * ★우리 DB 에 아무것도 쓰지 않는다★ — 사진도 결과도 브라우저 안에서만 돈다.
 * 문은 제안서와 같다((admin) 레이아웃 + canWrite · routes-map 의 /solar 가 앞가지로 덮는다).
 *
 * 폴더 이름이 `layout` 이지만 Next 의 layout.tsx 와는 상관없다 — 주소 한 조각일 뿐이다.
 */
export default async function SolarLayoutPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/layout');
  if (!canWrite(session.role)) redirect('/projects');

  return (
    <>
      <Link
        href="/solar"
        className="mb-3 inline-flex items-center gap-1 text-base text-slate-500 transition hover:text-brand-700"
      >
        ← 태양광 제안서
      </Link>
      <h1 className="mb-6 text-h1 font-black text-slate-900">패널 배치</h1>
      <LayoutBoard />
    </>
  );
}

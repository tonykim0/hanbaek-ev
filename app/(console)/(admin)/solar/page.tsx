import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canWrite } from '@/lib/roles';
import ProposalForm from '@/components/solar/ProposalForm';

export const metadata = { title: '태양광 제안서 — 한백 전기차사업관리시스템' };

/**
 * 태양광(솔라쉐어바로) 제안서 만들기.
 *
 * ★우리 DB 에 아무것도 쓰지 않는다★ — 서식도 결과도 브라우저 안에서만 돈다(실사보고서와 같다).
 * 그런데도 (admin) 그룹에 둔다: 서류 손질 도구 셋(/reissue·/split·/scan)은 ★받은 서류★를
 * 가르는 자리라 열람 전용에게도 열었지만, 제안서는 ★우리 이름으로 고객에게 나가는 물건★이다.
 * 전기차 협력사의 일도 아니다 — 태양광은 한백이 직접 제안한다.
 *
 * 그래서 문이 둘이다: (admin) 레이아웃이 「한백의 눈인가」, 여기가 「쓰는 사람인가」.
 * 엣지에서도 같은 답이 나온다 — lib/routes-map 의 HANBAEK_ONLY + WRITER_ONLY 에 함께 있어
 * 둘을 합치면 관리자만 남는다. 영업사에게 열 일이 생기면 HANBAEK_ONLY 에서 빼고 이 폴더를
 * (admin) 밖으로 옮긴다.
 */
export default async function SolarPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar');
  if (!canWrite(session.role)) redirect('/projects');

  return (
    <>
      <h1 className="mb-6 text-h1 font-black text-slate-900">태양광 제안서</h1>
      <ProposalForm />
    </>
  );
}

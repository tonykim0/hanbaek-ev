/**
 * 태양광 구역의 문 — 태양광을 보는 계정만 들인다: 한백의 눈(관리자 · 열람 전용)과 태양광 참여를 켠 협력사(lib/biz seesSolar).
 *
 * 처음(2026-11-03 아침)에는 (admin) 그룹 안이라 한백만 봤다. 같은 날 「에코일렉은 태양광도 같이할거야」로 협력사에 열면서
 * 그룹 밖으로 꺼내 이 문을 세웠다 — 이 아래 새 화면을 만들면 저절로 잠긴다. 미들웨어의 목록(HANBAEK_ONLY)에서는 뺐다:
 * 엣지는 쿠키만 보는데 참여 여부는 계정설정에서 바뀌는 값이라 매 요청 DB 에서 읽어야 한다(getSessionUser).
 * 협력사가 무엇을 보는지(제 소속의 현장만)는 저장소가 가른다(lib/data/solar-sites).
 */
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { seesSolar } from '@/lib/biz';

export default async function SolarLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar');
  if (!seesSolar(session)) redirect('/projects');
  return <>{children}</>;
}

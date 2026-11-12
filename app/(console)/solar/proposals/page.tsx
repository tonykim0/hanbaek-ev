/**
 * 태양광 제안서 생성 — 사이드바의 자리(한백 2026-11-07 「사이드바에 제안서 생성 이라는 기능으로 추가해줘」). [한백 전용]
 *
 * 제안서만 짓는다(한백 2026-11-08 「부지검토는 부지검토용으로만 제안서생성은 제안서 생성용으로만」) — 1 현장 → 2 상품 → 3 패널 배치 →
 * 4 고객 · 영업사 → 만들기(components/solar/ProposalMaker). 판정 · 검토 항목 · 상담 접수는 부지 검토에만 있고, 부지 검토 결과의
 * 「이 부지로 제안서 만들기」가 주소(?q=)를 들고 여기로 온다.
 *
 * 사업자 자료(틀)로 짓는 일이라 한백의 눈(관리자 · 열람 전용)만 — 미들웨어 HANBAEK_ONLY(쿠키라 낡을 수 있다)와 여기서 두 번 막는다.
 * 태양광 구역의 바깥 문((console)/solar/layout)은 태양광 참여 협력사도 들인다.
 */
import { redirect } from 'next/navigation';
import ProposalMaker from '@/components/solar/ProposalMaker';
import { getSessionUser } from '@/lib/auth/session';
import { BIZ_HOME } from '@/lib/biz';
import { isHanbaek } from '@/lib/roles';
import { firstParam } from '@/lib/search-param';

export const metadata = { title: '태양광 제안서 생성' };

/** ?q= — 주소를 들고 오면(부지 검토의 「이 부지로 제안서 만들기」) 「1 현장」에 넣고 바로 불러온다 */
export default async function SolarProposalsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSessionUser();
  // 로그인 자체가 없는 경우는 바깥 레이아웃이 먼저 로그인으로 보낸다
  if (!session || !isHanbaek(session.role)) redirect(BIZ_HOME.solar);
  const q = firstParam(searchParams.q).trim().slice(0, 500);
  return (
    <div className="max-w-4xl">
      <h1 className="mb-5 text-h1 font-black text-slate-900">제안서 생성</h1>
      {/* 카카오 JavaScript 키는 브라우저에 보이는 것이 정상인 키다 — 카카오 앱에 등록한 도메인에서만 지도가 뜬다 */}
      <ProposalMaker mapKey={process.env.KAKAO_JS_KEY || null} initialQ={q} canManage={session.role === 'admin'} />
    </div>
  );
}

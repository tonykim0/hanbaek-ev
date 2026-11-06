/**
 * 태양광 제안서 생성 — 사이드바의 자리(한백 2026-11-07 「사이드바에 제안서 생성 이라는 기능으로 추가해줘」). [한백 전용]
 *
 * 부지 검토의 지붕형과 같은 길이다: 주소 → 검토(필지 · 건물 · 계통) → 지도에서 AI 지붕 → 고객명 · 주소 · 영업사 · 상품 → PPTX.
 * 같은 부품(Checker · ReportView · ProposalPanel)을 쓰고, 이 화면은 지붕형 검색창 하나와 결과의 요약 · 지도 · 제안서만 세운다
 * (검토 항목은 부지 검토에). 부지 검토 결과의 「제안서」도 그대로다 — 검토하다 바로 짓는 길.
 *
 * 사업자 자료(틀)로 짓는 일이라 한백의 눈(관리자 · 열람 전용)만 — 미들웨어 HANBAEK_ONLY(쿠키라 낡을 수 있다)와 여기서 두 번 막는다.
 * 태양광 구역의 바깥 문((console)/solar/layout)은 태양광 참여 협력사도 들인다.
 */
import { redirect } from 'next/navigation';
import Checker from '@/components/solar/Checker';
import { getSessionUser } from '@/lib/auth/session';
import { BIZ_HOME } from '@/lib/biz';
import { isHanbaek } from '@/lib/roles';
import { canRegisterSite } from '@/lib/solar/sites';

export const metadata = { title: '태양광 제안서 생성' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** ?q= — 주소를 들고 오면 지붕형 검색창에 넣고 바로 돈다 */
export default async function SolarProposalsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSessionUser();
  // 로그인 자체가 없는 경우는 바깥 레이아웃이 먼저 로그인으로 보낸다
  if (!session || !isHanbaek(session.role)) redirect(BIZ_HOME.solar);
  const q = one(searchParams.q).trim().slice(0, 200);
  return (
    <div className="max-w-4xl">
      <h1 className="mb-5 text-h1 font-black text-slate-900">제안서 생성</h1>
      {/* 카카오 JavaScript 키는 브라우저에 보이는 것이 정상인 키다 — 카카오 앱에 등록한 도메인에서만 지도가 뜬다 */}
      <Checker
        mapKey={process.env.KAKAO_JS_KEY || null}
        initial={q.length >= 2 ? { q, mode: 'roof' } : null}
        modes={['roof']}
        focus="proposal"
        canRegister={canRegisterSite(session)}
        canPropose
        canManage={session.role === 'admin'}
      />
    </div>
  );
}

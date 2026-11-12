/**
 * 태양광 부지 검토 — 태양광 사업의 첫 화면(2026-11-03, 한백 「태양광 설치 검토 기능을 이 페이지에 넣어줘」). [한백 전용]
 *
 * 검토 사이트(~/Documents/solar-site)를 콘솔로 들였다 — 계산·규칙은 lib/solar, 화면은 components/solar, API 는 /api/solar.
 * ★이제 정본은 콘솔이다★ — 검토 사이트는 고치지 않는다(두 벌을 고치면 갈린다).
 * 주소 하나를 넣으면 필지 · 건물 · 용도지역 · 계통 여유 · 이격거리 조례 · 개발 인허가를 보고 판정과 설치 가능 용량을 낸다.
 * 지붕형은 「AI로 패널배치하기」가 항공사진에서 딴 지붕에 패널을 깔고, 지상형은 지도에 그린 설치면적으로 용량을 센다.
 * DB 에는 아무것도 남기지 않는다(조회 도구) — 그래서 열람 전용도 쓴다. (admin) 그룹 안이라 협력사에게는 열리지 않는다.
 */
import Checker from '@/components/solar/Checker';
import { getSessionUser } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { canRegisterSite } from '@/lib/solar/sites';
import type { Mode } from '@/lib/solar/types';
import { firstParam } from '@/lib/search-param';

export const metadata = { title: '태양광 부지 검토' };

/** ?q=&mode= — 현장 상세의 「부지 검토」가 주소 · 설치 형태를 들고 온다. 그 검색창에 넣고 바로 돈다 */
export default async function SolarCheckPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const session = await getSessionUser();
  const q = firstParam(searchParams.q).trim().slice(0, 500);
  const mode: Mode = firstParam(searchParams.mode) === 'ground' ? 'ground' : 'roof';
  return (
    <div className="max-w-4xl">
      <h1 className="mb-5 text-h1 font-black text-slate-900">부지 검토</h1>
      {/* 카카오 JavaScript 키는 브라우저에 보이는 것이 정상인 키다 — 카카오 앱에 등록한 도메인에서만 지도가 뜬다 */}
      <Checker
        mapKey={process.env.KAKAO_JS_KEY || null}
        initial={q.length >= 2 ? { q, mode } : null}
        // 상담 접수는 한백 관리자와 태양광 참여 협력사 — 열람 전용에게는 결과의 접수 단추가 없다
        canRegister={!!session && canRegisterSite(session)}
        // 제안서는 「제안서 생성」에서만 짓는다 — 여기는 그리로 가는 고리뿐. 사업자 자료(템플릿)라 한백만(타이런트 업무협약서 3조)
        canPropose={!!session && isHanbaek(session.role)}
      />
    </div>
  );
}

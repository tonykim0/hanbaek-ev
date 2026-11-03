/**
 * 태양광 설치 검토 — 태양광 사업의 첫 화면(2026-11-03, 한백 「태양광 설치 검토 기능을 이 페이지에 넣어줘」). [한백 전용]
 *
 * 검토 사이트(~/Documents/solar-site)를 콘솔로 들였다 — 계산·규칙은 lib/solar, 화면은 components/solar, API 는 /api/solar.
 * ★이제 정본은 콘솔이다★ — 검토 사이트는 고치지 않는다(두 벌을 고치면 갈린다).
 * 주소 하나를 넣으면 필지 · 건물 · 용도지역 · 계통 여유 · 이격거리 조례 · 개발 인허가를 보고 판정과 설치 가능 용량을 낸다.
 * 지붕형은 「AI로 지붕 찾기」가 항공사진에서 딴 지붕에 패널을 깔고, 지상형은 지도에 그린 설치면적으로 용량을 센다.
 * DB 에는 아무것도 남기지 않는다(조회 도구) — 그래서 열람 전용도 쓴다. (admin) 그룹 안이라 협력사에게는 열리지 않는다.
 */
import Checker from '@/components/solar/Checker';

export const metadata = { title: '태양광 설치 검토' };

export default function SolarCheckPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="mb-5 text-h1 font-black text-slate-900">설치 검토</h1>
      {/* 카카오 JavaScript 키는 브라우저에 보이는 것이 정상인 키다 — 카카오 앱에 등록한 도메인에서만 지도가 뜬다 */}
      <Checker mapKey={process.env.KAKAO_JS_KEY || null} />
    </div>
  );
}

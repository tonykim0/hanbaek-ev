/**
 * 태양광 AI에이전트의 문 — ★한백 관리자만★(전기차 /admin/agents 가 (write) 안인 것과 같다 — 업무 정의 · 지시가 한백의 일이다).
 *
 * 태양광 구역의 바깥 문((console)/solar/layout)은 태양광을 보는 계정 모두(한백의 눈 · 태양광 참여 협력사)를 들인다 — 여기는 한 겹
 * 더 막는다. 미들웨어도 이 경로를 관리자 전용으로 둔다(lib/routes-map ADMIN_ONLY) — 쿠키라 낡을 수 있어 진짜 문은 여기다.
 */
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { BIZ_HOME } from '@/lib/biz';

export default async function SolarAgentsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  // 로그인 자체가 없는 경우는 바깥 레이아웃이 먼저 로그인으로 보낸다
  if (session && session.role !== 'admin') redirect(BIZ_HOME.solar);
  return <>{children}</>;
}

import { getSessionUser } from '@/lib/auth/session';
import { salesChoicesFor } from '@/lib/contract-form';
import PluglinkContractForm from '@/components/contracts/PluglinkContractForm';

/**
 * 플러그링크 계약서 — 폼은 클라이언트라 로그인한 소속을 모른다. 그래서 여기서 세션을 보고 그 소속이 고를 수 있는
 * 모집 담당자만 넘긴다(한백 지시 2026-10-23 · 에코일렉은 한비 김종혁 / 에코일렉 이용진). 대행 중이면 대상 계정의
 * 소속이다(getSessionUser). 문(로그인·쓰기)은 미들웨어와 /contracts 가 이미 본다.
 */
export default async function PluglinkContractPage() {
  const session = await getSessionUser();
  return <PluglinkContractForm salesChoices={salesChoicesFor('pluglink', session?.org)} />;
}

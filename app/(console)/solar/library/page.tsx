/**
 * 태양광 자료실 (2026-11-04, 한백 「태양광사업관리 페이지에서도 자료실 기능을 만들어줘 · 제목은 운영사 자료실 아니고 그냥 자료실 ·
 * 우리가 업로드 할 수 있는 기능도 · 왼쪽 사이드바에 넣어줘」).
 *
 * 문은 (console)/solar/layout 하나다 — 태양광을 보는 계정(한백 · 태양광 참여 협력사)이 보고 받는다. 올리기 · 빼기는 한백 관리자만
 * (서버는 app/api/solar/library 가 한 번 더 본다). 목록은 DB 없이 Blob 을 그대로 읽는다(lib/solar/library-list) — 매 요청마다
 * 읽어 올리면 바로 보인다. 전기차의 「운영사 자료실」(/library)과 자리 · 목록이 따로다.
 */
import { redirect } from 'next/navigation';
import Library from '@/components/solar/Library';
import { getSessionUser } from '@/lib/auth/session';
import { listSolarLibrary } from '@/lib/solar/library-list';

export const metadata = { title: '자료실' };
export const dynamic = 'force-dynamic';

export default async function SolarLibraryPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/library');
  const { files, storageMissing, error } = await listSolarLibrary();
  return <Library files={files} canManage={session.role === 'admin'} storageMissing={storageMissing} error={error} />;
}

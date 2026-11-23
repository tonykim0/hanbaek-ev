import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { userStore } from '@/lib/auth/users';
import { ROLE_LABEL } from '@/lib/roles';
import { Note, TEXT } from '@/components/ui';
import OwnPassword from '@/components/OwnPassword';

export const metadata = {
  title: '비밀번호 변경',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * 비밀번호 변경 — 로그인한 계정 본인이(2026-11-23 한백 「각 계정에서 자기 비밀번호 재설정 할 수 있도록 해줘」).
 *
 * 계정 모두가 온다 — 협력사 · 열람 전용 · 한백 관리자. 들어오는 길은 사이드바 맨 아래 「비밀번호 변경」과 비밀번호 관리기의
 * 「비밀번호 변경」(/.well-known/change-password — next.config). 잊은 비밀번호는 여기서 못 바꾼다(지금 비밀번호를 대야 한다) —
 * 그 길은 여전히 한백의 계정설정 「비밀번호 재설정」이다.
 *
 * 못 바꾸는 경우 둘은 칸 대신 그 까닭을 둔다: 대행 중(쿠키의 임자는 관리자라 누구의 비밀번호인지 갈린다) · 배포 설정 계정
 * (해시가 환경변수 · 코드에 있다). 판정은 라우트(app/api/auth/password)가 다시 한다.
 */
export default async function OwnPasswordPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/account/password');

  // 계정 목록 전체는 내려보내지 않는다 — 제 줄이 DB 에 있는지만 본다(사업자 정보 화면과 같은 방식)
  const me = (await userStore.list()).find((a) => a.id === session.id);
  const fromFile = !me || me.source === '파일';

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <h1 className="text-h1 font-black text-slate-900">비밀번호 변경</h1>
        <p className="mt-1.5 text-base text-slate-500">
          {session.id} · {session.org ? `${session.org} · ` : ''}
          {ROLE_LABEL[session.role]}
        </p>
      </div>
      {session.via ? (
        <Note>대행 중에는 비밀번호를 바꿀 수 없습니다 — 위 띠에서 대행을 끝내고 바꾸세요.</Note>
      ) : fromFile ? (
        <Note>배포 설정 계정이라 여기서 바꿀 수 없습니다.</Note>
      ) : (
        <>
          <OwnPassword loginId={session.id} />
          {/*
            * 잊으면 되찾는 길은 한백 관리자의 「비밀번호 재설정」(계정설정) 하나다 — 계정에 메일 · 전화가 없어 스스로 되찾을 수 없다.
            * 바꾸기 전에 알아야 해서 칸 밑에 늘 둔다(2026-11-23 한백 「비밀번호 변경 후 까먹었으면 한백 관리자에 문의 필요」).
            * 로그인 화면에도 같은 말이 있다(잊은 사람이 서는 자리).
            */}
          <p className={`mt-3 ${TEXT.meta}`}>바꾼 비밀번호를 잊으면 한백 관리자에게 문의하세요 — 관리자가 재설정해 드립니다.</p>
        </>
      )}
    </div>
  );
}

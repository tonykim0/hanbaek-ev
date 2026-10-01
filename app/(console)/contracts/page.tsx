import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canWrite } from '@/lib/roles';

export const metadata = { title: '계약서 작성 — 한백 전기차사업관리시스템' };

/**
 * 계약서 작성 — 운영사별 양식으로 들어가는 자리.
 *
 * ★양식이 콘솔 안에 있다★ (한백 지시 2026-10-01) — /contracts/hec 등. 예전에는 포털(hanbaek-form,
 * 로그인 없음)에 두고 여기서 새 탭으로 보냈다. 포털을 닫으며 콘솔로 들였다 — 이제 계약서를 쓰려면
 * 로그인한다. 옛 주소(/hec · /nice · /sk · /pluglink · /sk-invest)는 next.config 가 이리로 넘긴다.
 *
 * 고를 것만 둔다 — 부제·단계 표시·아래 설명문을 걷었다(한백 지시 2026-08-25). 접수로 가는 길은
 * 사이드바에 있다(화면 규칙 2). SK 자체투자는 SK 양식 안의 사업구분이다(옛 /sk-invest 도 SK 로 간다).
 */
const FORMS: Array<{ path: string; cpo: string; note: string }> = [
  { path: '/contracts/hec', cpo: '현대엔지니어링', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/contracts/nice', cpo: '나이스인프라', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/contracts/sk', cpo: 'SK일렉링크', note: '설치신청서 · 사전현장컨설팅결과서' },
  { path: '/contracts/pluglink', cpo: '플러그링크', note: '설치신청서 · 사전현장컨설팅결과서' },
];

export default async function ContractsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/contracts');
  // 만들어서 내는 자리다 — 열람 전용은 들어오지 않는다
  if (!canWrite(session.role)) redirect('/projects');

  return (
    <>
      <h1 className="mb-6 text-h1 font-black text-slate-900">계약서 작성</h1>

      <div className="grid max-w-[880px] gap-2 sm:grid-cols-2">
        {FORMS.map((f) => (
          <Link
            key={f.path}
            href={f.path}
            className="flex items-center justify-between gap-3 rounded-panel border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="min-w-0">
              <span className="block text-lead font-bold text-slate-900">{f.cpo}</span>
              <span className="block text-tiny text-slate-400">{f.note}</span>
            </span>
            <span aria-hidden className="shrink-0 text-brand-700">→</span>
          </Link>
        ))}
      </div>
    </>
  );
}

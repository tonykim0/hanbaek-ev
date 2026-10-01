import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export const metadata = { title: '실사보고서 작성 — 한백 전기차사업관리시스템' };

/**
 * 실사보고서(사진대지) 작성 — 운영사별 서식으로 들어가는 자리.
 *
 * 포털 첫 화면의 「실사보고서 작성」 구역이었다. 포털을 닫으며(한백 지시 2026-10-01) 콘솔로 들였다.
 * ★우리 DB 에 아무것도 쓰지 않는다★ — 사진과 값은 브라우저 안에서 서식이 되어 내려받아질 뿐이다
 * (components/survey). 그래서 재발행·분할·스캔처럼 열람 전용도 쓴다(routes-map 의 WRITER_ONLY 밖).
 * ★만든 운영사만 올린다★ — 눌러서 「준비 중」이 뜨는 카드는 두지 않는다(화면 규칙 3).
 */
const FORMS: Array<{ path: string; cpo: string; note: string }> = [
  { path: '/survey/pluglink', cpo: '플러그링크', note: '실사개요 · 사진대지 · 공사내역서' },
  { path: '/survey/hec', cpo: '현대엔지니어링', note: '사진대지 · 사전체크리스트' },
  { path: '/survey/nice', cpo: '나이스인프라', note: '사진 대장' },
  { path: '/survey/sk', cpo: 'SK일렉링크', note: '사진 대장' },
];

export default async function SurveyPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/survey');

  return (
    <>
      <h1 className="mb-6 text-h1 font-black text-slate-900">실사보고서 작성</h1>

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

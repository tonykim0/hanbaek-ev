import type { Metadata } from 'next';
import { SYSTEM_NAME } from '@/lib/biz';
import './globals.css';

/*
 * ★이름은 한 곳에서만 정한다 (한백 2026-08-31).★ 링크 미리보기에 「로그인 - 한백EV콘솔」이
 * 떴는데, 세어 보니 꼬리표가 네 꼴이었다: 「한백 EV 콘솔」·「한백 전기차사업관리」·
 * 「한백 전기차충전사업」·「| 한백 전기차충전사업」. 같은 시스템을 네 이름으로 부르면
 * 링크를 받은 사람은 그것이 같은 것인지 알 수 없다.
 *
 * 콘솔의 이름은 하나다 — 처음엔 「한백 전기차사업관리시스템」, 태양광이 들어온 2026-11-03 부터
 * ★한백 신재생사업관리시스템★(lib/biz SYSTEM_NAME). (포털 「한백 전기차충전사업」은 2026-10-01 닫았다.)
 *
 * ★화면은 제 이름만 적는다★ — 「계약관리」처럼. 꼬리(— 한백 신재생사업관리시스템)는 여기 template 이 단다.
 * 예전에는 화면 31곳이 꼬리까지 손으로 적어, 이름을 바꾸려면 31곳을 고쳐야 했다(같은 날 그렇게 걷었다).
 * 제목을 안 정한 화면은 default — 새 화면이 제목을 깜빡해도 남의 이름을 달지 않는다.
 */
export const metadata: Metadata = {
  title: { default: SYSTEM_NAME, template: `%s — ${SYSTEM_NAME}` },
  description: '한백 신재생 사업 관리 — 전기차 · 태양광',
  icons: { icon: '/logo.png', apple: '/logo.png' },
};

/*
 * ★방문 분석(Vercel Web Analytics)은 걷었다★ (2026-11-13 사용자 「web analytics 꺼」) — 아무도 보지 않는 숫자에 이벤트마다
 * 돈이 나갔다(10/23~ 주기 1.2만 건 $0.36). 다시 켜려면 @vercel/analytics 의 <Analytics /> 를 여기 body 끝에 두고
 * Vercel 프로젝트에서 Web Analytics 를 켠다.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}

/**
 * 콘솔 구역 인증 게이트.
 *
 * ★주소는 하나다★ — 포털(hanbaek-form.vercel.app)은 2026-10-01 닫았다(한백 지시). 그 주소로 오는
 * 요청은 next.config 의 redirects 가 콘솔로 넘기고(미들웨어보다 먼저 돈다), 포털에 있던 계약서
 * 작성·실사보고서 작성은 콘솔 안(/contracts/* · /survey/*)으로 들어왔다. 그래서 예전의 주소 게이트
 * (포털 주소에서 콘솔 경로를 404 로 가리던 것)는 걷었다 — 가릴 반대쪽이 없다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { verifyPayload } from '@/lib/auth/crypto';
import { SESSION_COOKIE, type SessionPayload } from '@/lib/auth/types';
import { canWrite, isHanbaek } from '@/lib/roles';
import {
  ADMIN_ONLY, ADMIN_READABLE, CONSOLE_PATHS, HANBAEK_ONLY, OPEN_IN_CONSOLE, WRITER_ONLY,
} from '@/lib/routes-map';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  return 'dev-only-insecure-secret-do-not-ship';
}

/*
 * 콘솔 구역 — 로그인(/login)까지 포함한다. 콘솔에 들어가려고 지나는 자리라 주소도 콘솔이다.
 * (admin) 그룹의 /admin · /design · /pricing · /receivables 도 여기 있다.
 */
// 경로 목록은 lib/routes-map.ts 에 있다 — 화면 폴더와 맞는지 시험이 본다

function hits(path: string, list: readonly string[]): boolean {
  return list.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 세션은 콘솔 경로만 본다 — 그 밖은 로그인 화면과 api(라우트가 스스로 본다)뿐이다
  if (!hits(path, CONSOLE_PATHS) || hits(path, OPEN_IN_CONSOLE)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyPayload<SessionPayload>(token, secret()) : null;

  if (session) {
    /*
     * 구역이 셋이다. 대행 중(asId)이면 눈이 협력사이므로 앞의 둘은 언제나 막힌다 —
     * 바탕이 관리자여도 그렇다.
     *
     *   adminOnly    쓰는 자리. 관리자만. (계정·자료실)
     *   hanbaekOnly  보는 자리. 관리자와 열람 전용. (기성·단가·디자인 기준·협력사 정보)
     *   writerOnly   내는 자리. 열람 전용만 못 들어간다. (접수·계약서 작성·사업자 정보)
     *
     * /payouts 는 어디에도 없다 — 협력사도 자기 몫을 본다(페이지가 줄을 가른다).
     * 여기는 엣지라 쿠키에 박힌 구분을 그대로 읽는다. 진짜 문은 레이아웃이다
     * (app/(console)/(admin)/layout.tsx · 그 아래 admin/(write)/layout.tsx).
     *
     * ★/admin 은 통째로 관리자 전용이고, 열어 준 주소만 뺀다(adminReadable).★
     * 재무팀(열람 전용)이 협력사 정보 — 사업자등록증·통장사본·정산 계좌 — 를 봐야 한다
     * (한백 지시 2026-08-25). 목록을 「열린 것만」으로 뒤집지 않는 이유는, 그러면 새로
     * 만드는 /admin 화면이 저절로 열리기 때문이다. 막는 쪽이 기본이어야 빠뜨려도 안전하다.
     */
    const starts = (list: readonly string[]) => hits(path, list);

    /** /admin 이지만 한백의 눈이면 보는 자리 — 보기만 하고 쓰기는 API 가 막는다 */
    /*
     * 재발행도 「내는 자리」다 — 서류를 만들어 내보내는 일이라 열람 전용의 자리가 아니다.
     * PDF 분류·분할도 같다: 부를 때마다 판독 비용이 나가므로 보기만 하는 계정에는 안 연다.
     */
    /*
     * ★도구는 쓰기가 아니다★ (한백 지시 2026-08-31). 재발행·분할·스캔을 여기 두고 있었는데
     * 셋 다 우리 DB 에 아무것도 안 쓴다: 재발행은 계약서 양식으로 보내는 링크 모음이고,
     * 분할·스캔은 파일을 갈라 받아 가는 자리다. 「내는 자리」라는 이유로 막았지만
     * 그것은 자리의 성격이지 권한이 아니었다 — 재무(열람 전용)가 서류를 손질해 볼 일이 있다.
     *
     * 남은 셋은 진짜 쓰기다: 접수·계약서 작성은 현장과 계약을 만들고, 협력사 정보는
     * 제 사업자등록증을 적는 자리다. 여기까지 열면 「열람 전용」이 아니게 된다 —
     * 재무가 실제로 그 일을 해야 하면 계정 구분을 올리는 것이 맞다.
     */

    const blocked =
      (starts(ADMIN_ONLY) && !starts(ADMIN_READABLE) && (session.role !== 'admin' || session.asId))
      || ((starts(HANBAEK_ONLY) || starts(ADMIN_READABLE)) && (!isHanbaek(session.role) || session.asId))
      || (starts(WRITER_ONLY) && !canWrite(session.role));

    if (blocked) return NextResponse.redirect(new URL('/projects', request.url));
    return NextResponse.next();
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * 전 경로를 본다 — api 는 뺀다(라우트마다 스스로 권한을 본다) · _next 와 점이 붙은 요청
     * (정적 파일)도 뺀다.
     */
    '/((?!api/|_next/|.*\\.).*)',
  ],
};

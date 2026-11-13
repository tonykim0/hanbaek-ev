/**
 * 파일 문 — 브라우저가 파일을 받는 유일한 길(2026-11-14, lib/blob/path 머리말).
 *
 * GET /api/files/<저장소 경로>[?download=1] → 로그인 · 「이 사람이 이 파일을 볼 수 있는가」(lib/blob/access)를 본 뒤
 * 5분짜리 서명 주소로 넘긴다(302). 파일을 이 함수가 흘려 보내지 않는 것은 비용 때문이다 — 함수를 거치면 저장소 →
 * 함수 · 함수 → 브라우저로 두 번 값을 내고, 큰 PDF 는 함수 시간까지 먹는다. 서명 주소는 경로를 바꾸면 거절되고
 * 5분 뒤 닫힌다.
 *
 * 받는 쪽 모양: <a href> · <img> · <iframe> · fetch() 가 다 302 를 따라간다. 서명 주소는 CORS 가 열려 있어
 * (Access-Control-Allow-Origin: *) 화면의 fetch(묶어 받기 · 저장본 사진 · PDF 미리보기)도 된다.
 *
 * 없는 파일 · 못 보는 파일은 둘 다 404 다 — 403 을 따로 주면 「그 경로에 파일이 있다」를 알려 준다.
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canReadFile, fileScopeOf } from '@/lib/blob/access';
import { blobPathOf } from '@/lib/blob/path';
import { signedGetUrl } from '@/lib/blob/server';
import { fileFactsOf } from '@/lib/data/file-scope';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: NO_STORE });

  const url = new URL(request.url);
  const path = blobPathOf(url.pathname);
  if (!path) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404, headers: NO_STORE });

  try {
    const scope = fileScopeOf(path);
    const facts = await fileFactsOf(scope, path, session.role);
    if (!canReadFile(session, scope, facts)) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404, headers: NO_STORE });
    }
    const to = await signedGetUrl(path, { download: url.searchParams.get('download') === '1' });
    return NextResponse.redirect(to, { status: 302, headers: NO_STORE });
  } catch (e) {
    console.error('[api] 파일 문 실패', path, e);
    return NextResponse.json({ error: '파일을 열지 못했습니다.' }, { status: 500, headers: NO_STORE });
  }
}

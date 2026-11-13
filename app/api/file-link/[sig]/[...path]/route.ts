/**
 * 고정 링크 — 파일 하나만 여는, 바뀌지 않는 주소(lib/blob/server fileLink 머리말). 로그인 없이 열린다.
 *
 * 받는 쪽은 콘솔 밖이다: Claude API(에이전트에 넘긴 파일 — 대화마다 같은 주소로 다시 실어야 프롬프트 캐시가 산다) ·
 * 메일 받는 사람(큰 묶음 링크). 서명이 경로와 맞아야 열린다 — 경로를 바꾸면 404.
 *
 * ★파일을 흘려 보낸다 — 넘기지(302) 않는다★. 받는 쪽이 넘기기를 따라가는지 모르고(Claude 의 주소 받기), 넘긴 서명
 * 주소는 5분 뒤 닫혀 메일 받는 사람이 나중에 누르면 안 열린다. 묶음 · 에이전트 파일은 드물고 작아 함수를 거치는 값은 작다.
 */
import { NextResponse } from 'next/server';
import { blobPathOf } from '@/lib/blob/path';
import { BlobMissing, openBlob, verifyFileLink } from '@/lib/blob/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NOT_FOUND = () => NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request, { params }: { params: { sig: string } }) {
  const rest = new URL(request.url).pathname.split('/').slice(4).join('/'); // /api/file-link/<서명>/<경로>
  const path = blobPathOf(`/api/files/${rest}`);
  if (!path || !verifyFileLink(params.sig, path)) return NOT_FOUND();
  try {
    const f = await openBlob(path);
    const name = path.split('/').pop() ?? 'file';
    return new Response(f.stream, {
      headers: {
        'Content-Type': f.contentType || 'application/octet-stream',
        'Content-Length': String(f.size),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    if (e instanceof BlobMissing) return NOT_FOUND();
    console.error('[api] 고정 링크 실패', path, e);
    return NextResponse.json({ error: '파일을 열지 못했습니다.' }, { status: 500 });
  }
}

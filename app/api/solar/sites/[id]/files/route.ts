/**
 * 태양광 현장의 파일 — 올리기(두 단계)와 한 장 빼기 (한백 지시 2026-11-03 「상담접수할 때 파일도 올릴 수 있도록」).
 *
 *   POST ?step=token { pathname }          올리기 토큰 — 자리는 solar-sites/{현장}/ 아래만
 *   POST { blobUrl, filename }             올린 결과를 현장에 붙인다 — 주소는 우리 저장소에서 다시 찾은 것을 쓴다
 *   DELETE { url }                         한 장 빼기 — 기록을 먼저 빼고 Blob 을 걷는다
 *
 * 전기차 서류 칸(app/api/projects/[id]/documents/[kind]/file)과 같은 길이다 — 서버를 거쳐 올리면 서버리스 본문 한도(4.5MB)에
 * 걸려서 브라우저가 Blob 에 바로 올리고 주소만 알려준다. 형식은 묻지 않고 크기만 본다(같은 한백 지시 — 2026-09-02).
 * 누가 하는지(한백 관리자 · 그 현장의 담당 협력사 · 태양광 참여 중)는 저장소가 본다(lib/data/solar-sites).
 *
 * ★쓰기 껍데기(lib/api/write-route)를 쓰지 않는 이유★ 토큰 발급이 실패하면 500 이다(Blob 설정 문제 — 사람이 고칠 수 없다).
 * 껍데기는 그것을 422 로 바꿀 수 없다. 그래서 열람 전용 막기(canWrite)를 여기서 손으로 적는다.
 */
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';
import { solarSiteStore } from '@/lib/data/solar-sites';
import { dropBlob, ourBlob, ourBlobPathname } from '@/lib/intake-stage';
import { canWrite } from '@/lib/roles';
import { SITE_FILE_MAX_BYTES, siteFilePrefix } from '@/lib/solar/sites';

/** 토큰이 묶일 자리 — 그 현장의 폴더 바로 밑, 영문 · 숫자 이름만(siteFilePathname 이 짓는 모양) */
const PATH_RE = /^solar-sites\/SL-\d{4}-\d+\/[A-Za-z0-9.-]+$/;

type Gate = { ok: true; session: SessionPayload } | { ok: false; denied: NextResponse };

async function gate(): Promise<Gate> {
  const session = await getSessionUser();
  if (!session) return { ok: false, denied: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  if (!canWrite(session.role)) {
    return { ok: false, denied: NextResponse.json({ error: '열람 전용 계정입니다 — 보기만 할 수 있습니다.' }, { status: 403 }) };
  }
  return { ok: true, session };
}

/** 저장소의 규칙 위반(한글 메시지)은 422, 그 밖은 500 과 [solar-files] 한 줄 */
function failed(err: unknown) {
  if (err instanceof Error && /[가-힣]/.test(err.message)) return NextResponse.json({ error: err.message }, { status: 422 });
  console.error('[solar-files]', err);
  return NextResponse.json({ error: '파일을 처리하지 못했습니다.' }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if (!g.ok) return g.denied;
  const actor = actorOf(g.session);
  const body = (await request.json().catch(() => null)) as { pathname?: string; blobUrl?: string; filename?: string } | null;
  if (!body) return NextResponse.json({ error: '요청을 읽을 수 없습니다.' }, { status: 400 });

  // ── 1단계: 토큰 ────────────────────────────────────────────────
  if (new URL(request.url).searchParams.get('step') === 'token') {
    const pathname = body.pathname ?? '';
    // 자리를 서버가 정한 모양으로 못 박는다 — 아니면 남의 현장 폴더에 올릴 수 있다
    if (!pathname.startsWith(siteFilePrefix(params.id)) || !PATH_RE.test(pathname)) {
      return NextResponse.json({ error: '올릴 자리가 올바르지 않습니다.' }, { status: 400 });
    }
    try {
      await solarSiteStore.assertEditable(params.id, actor);
    } catch (err) {
      return failed(err);
    }
    try {
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN!,
        pathname,
        validUntil: Date.now() + 10 * 60 * 1000,
        maximumSizeInBytes: SITE_FILE_MAX_BYTES,
      });
      return NextResponse.json({ token });
    } catch (err) {
      console.error('[solar-files] 토큰 발급 실패:', err);
      return NextResponse.json({ error: '업로드 준비에 실패했습니다.' }, { status: 500 });
    }
  }

  // ── 2단계: 붙이기 ──────────────────────────────────────────────
  const pathname = ourBlobPathname(body.blobUrl ?? '');
  if (!pathname || !pathname.startsWith(siteFilePrefix(params.id))) {
    return NextResponse.json({ error: '파일 주소가 올바르지 않습니다.' }, { status: 400 });
  }
  let found: { url: string; size: number };
  try {
    // 브라우저가 준 주소를 적지 않는다 — 우리 저장소에서 그 자리를 찾아 그 주소 · 크기를 쓴다(올라오지 않은 파일도 여기서 걸린다)
    found = await ourBlob(pathname);
  } catch {
    return NextResponse.json({ error: '올린 파일을 찾을 수 없습니다. 다시 올려주세요.' }, { status: 422 });
  }
  const name = (body.filename ?? '').normalize('NFC').trim().slice(0, 200) || pathname.split('/').pop()!;
  try {
    const { already } = await solarSiteStore.attachFile(
      params.id,
      { url: found.url, name, size: found.size, at: new Date().toISOString(), by: actor.id },
      actor,
    );
    return NextResponse.json({ ok: true, already });
  } catch (err) {
    return failed(err);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const g = await gate();
  if (!g.ok) return g.denied;
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  if (!body?.url) return NextResponse.json({ error: '뺄 파일 주소가 없습니다.' }, { status: 400 });
  try {
    const gone = await solarSiteStore.removeFile(params.id, body.url, actorOf(g.session));
    // 기록을 뺀 뒤에 파일을 지운다 — 그 현장 자리에 있는 것만
    if ((ourBlobPathname(gone.url) ?? '').startsWith(siteFilePrefix(params.id))) await dropBlob(gone.url);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed(err);
  }
}

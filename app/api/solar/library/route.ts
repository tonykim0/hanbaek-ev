/**
 * 태양광 자료실의 올리기 · 빼기 — 한백 관리자만(한백 지시 2026-11-04 「우리가 업로드 할 수 있는 기능도 만들어주고」).
 *
 *   POST ?step=token { pathname }   올리기 토큰 — 자리는 solar-materials/(<분류>/)<파일명> 만(lib/solar/library isLibraryPath).
 *                                   같은 자리에 이미 있으면 옛 본을 보관 자리에 한 부 옮기고 교체를 허락한다
 *   POST { pathname }               올린 뒤 — 우리 저장소에 그 자리가 정말 있는지 보고 기록(audit_log)을 남긴다
 *   DELETE { pathname }             빼기 — 보관 자리에 한 부 옮기고 지운 뒤 기록을 남긴다
 *
 * 보기는 화면(/solar/library)이 Blob 을 그대로 나열한다 — 그 문은 (console)/solar/layout(태양광을 보는 계정)이다.
 * 브라우저가 Blob 에 바로 올린다(서버리스 본문 한도 4.5MB) — 현장 첨부파일 · 전기차 자료실과 같은 길이다. 전기차 자료실은
 * 관리자 비밀번호를 한 번 더 묻는데(로그인 없던 포털 시절의 문), 여기는 콘솔 로그인 + 관리자로 충분하다.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/types';
import { writeAudit } from '@/lib/db/audit';
import { getDb, hasDatabase } from '@/lib/db/client';
import { isLibraryPath, LIBRARY_MAX_BYTES, LIBRARY_PREFIX, libraryArchivePathOf } from '@/lib/solar/library';
import { clientUploadToken, copyBlob, deleteBlobs, hasBlobStore, headBlob } from '@/lib/blob/server';

const ACTION = '태양광 자료실';
const shown = (pathname: string) => pathname.slice(LIBRARY_PREFIX.length);
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/**
 * 문 — 한백 관리자만(열람 전용 · 협력사는 403 — 보기는 화면이 한다), 자리는 자료실 규칙대로만(400).
 * 저장소 연결은 그 뒤에 본다 — 문과 자리 검사는 Blob 없이도 같은 답을 해야 한다(경계 시험 · CI).
 */
async function gate(request: Request, wrong: string): Promise<{ session: SessionPayload; pathname: string } | NextResponse> {
  const session = await requireAdmin();
  if (!session) return fail('자료는 한백 관리자만 올리고 뺍니다.', 403);
  const body = (await request.json().catch(() => null)) as { pathname?: unknown } | null;
  const pathname = typeof body?.pathname === 'string' ? body.pathname : '';
  if (!isLibraryPath(pathname)) return fail(wrong, 400);
  if (!hasBlobStore()) return fail('파일 저장소(Blob)가 연결되지 않았습니다.', 500);
  return { session, pathname };
}

async function audit(session: SessionPayload, field: string, value: { oldValue?: string; newValue?: string }) {
  if (!hasDatabase()) return;
  await writeAudit(getDb(), { projectId: null, actor: actorOf(session), action: ACTION, field, ...value });
}

export async function POST(request: Request) {
  const g = await gate(request, '올릴 자리가 올바르지 않습니다.');
  if (g instanceof NextResponse) return g;
  const { session, pathname } = g;

  // ── 1단계: 토큰 ────────────────────────────────────────────────
  if (new URL(request.url).searchParams.get('step') === 'token') {
    // 교체 전에 옛 본을 한 부 — 실패해도 올리기는 막지 않는다(보관은 보험이지 조건이 아니다). 조용히 넘기지 않고 로그에 남긴다
    const existing = await headBlob(pathname);
    if (existing) {
      try {
        await copyBlob(existing.url, libraryArchivePathOf(pathname), { addRandomSuffix: false, contentType: existing.contentType });
      } catch (err) {
        console.error('[solar-library] 옛 본 보관 실패:', pathname, err);
      }
    }
    try {
      const token = await clientUploadToken({
        pathname,
        // 큰 자료를 올리는 중에 만료되지 않게(전기차 자료실과 같은 60분)
        validUntil: Date.now() + 60 * 60 * 1000,
        // 이름이 곧 자리다 — 같은 이름으로 다시 올리면 교체(옛 본은 위에서 보관했다)
        addRandomSuffix: false,
        allowOverwrite: true,
        maximumSizeInBytes: LIBRARY_MAX_BYTES,
      });
      return NextResponse.json({ token, replaced: !!existing });
    } catch (err) {
      console.error('[solar-library] 토큰 발급 실패:', err);
      return fail('업로드 준비에 실패했습니다.', 500);
    }
  }

  // ── 2단계: 올린 뒤 — 우리 저장소에 그 자리가 있어야 기록한다 ──────────
  const found = await headBlob(pathname);
  if (!found) return fail('올린 파일을 찾을 수 없습니다. 다시 올려주세요.', 422);
  try {
    await audit(session, '자료 올림', { newValue: shown(pathname) });
  } catch (err) {
    console.error('[solar-library] 기록 실패:', pathname, err);
    return fail('자료는 올렸지만 기록을 남기지 못했습니다.', 500);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const g = await gate(request, '뺄 자료가 올바르지 않습니다.');
  if (g instanceof NextResponse) return g;
  const { session, pathname } = g;
  const info = await headBlob(pathname);
  if (!info) return fail('그 자료가 자료실에 없습니다.', 422);
  try {
    // 보관 자리에 먼저 한 부 — 옮기지 못하면 지우지 않는다(Blob 의 삭제는 되돌릴 수 없다)
    await copyBlob(info.url, libraryArchivePathOf(pathname), { addRandomSuffix: false, contentType: info.contentType });
    await deleteBlobs(info.url);
    await audit(session, '자료 뺌', { oldValue: shown(pathname) });
  } catch (err) {
    console.error('[solar-library] 빼기 실패:', pathname, err);
    return fail('자료를 빼지 못했습니다.', 500);
  }
  return NextResponse.json({ ok: true });
}

/**
 * GET /api/agit/posts/[id]/files[?part=png] — 아지트 열린구매 글의 첨부 zip 받기(part=png 면 엑셀 캡처만) [한백 관리자]
 * (한백 2026-11-08 「열린구매 글에는 거래명세서, 세금계산서 그리고 엑셀파일이 들어가야해」 → 「개별 파일로 하나의 zip으로 다운받아서 올려」)
 *
 * 콘솔이 그 글(결제일 × 구분)의 첨부를 zip 하나로 묶어 주고, Claude Code 가 받아 아지트 글의 첨부 파일로 붙인다(scripts/agit-post.ts).
 * 안: 구매요청간소화 엑셀(lib/agit/purchase-xlsx)과 그 캡처 PNG(본문 가운데에 붙인다 — lib/agit/purchase-image) · 배치마다 거래명세서
 * PDF(콘솔 화면 그대로 — lib/agit/statement-pdf) · 붙은
 * 세금계산서. 이름 · 폴더는 한백이 올려 온 zip 그대로(lib/agit/bundle). 받을 때마다 지금 원장으로 짓는다 — 저장하지 않는다.
 * 거래명세서 PDF 는 서버의 브라우저가 이 요청의 로그인으로 그 화면을 연다(쿠키는 콘솔 주소에만).
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf } from '@/lib/auth/session';
import { getRepository } from '@/lib/data';
import { isUnexpectedError } from '@/lib/api/errors';
import { agitPostFilesOf } from '@/lib/agit/publish';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return fail('첨부 파일은 한백 관리자만 받습니다.', 403);
  try {
    const actor = actorOf(session);
    const post = await getRepository().getAgitPost(actor, params.id);
    if (!post) return fail('아지트 글을 찾을 수 없습니다.', 404);
    /* 올릴 때 붙는 것과 같은 zip — 위탁운영수수료 글은 엑셀 · 넘긴 세금계산서(lib/agit/fee), 그 밖은 그 결제일 · 구분의 배치 */
    const url = new URL(request.url);
    const { zip, png } = await agitPostFilesOf(actor, post, { origin: url.origin, cookie: request.headers.get('cookie') });
    /* ?part=png — 엑셀 캡처만(예비 길이 본문 그림으로 올린다 · 위탁운영수수료 zip 에는 캡처가 없다 — 한백의 5차 zip 그대로) */
    const file = url.searchParams.get('part') === 'png'
      ? { bytes: png.bytes, name: png.name, type: 'image/png' }
      : { bytes: zip.bytes, name: zip.name, type: 'application/zip' };
    return new NextResponse(new Blob([file.bytes as BlobPart], { type: file.type }), {
      headers: {
        'Content-Type': file.type,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (isUnexpectedError(e)) {
      console.error('[api] 아지트 첨부 zip', e instanceof Error ? e.message : String(e));
      return fail('첨부 파일을 만들지 못했습니다 — 잠시 뒤 다시 받아 주세요.', 500);
    }
    return fail(e instanceof Error ? e.message : '첨부 파일을 만들지 못했습니다.', 422);
  }
}
